import { DomainError, execute, parseImport } from '../acquisition/domain';
import { createHash } from 'node:crypto';
import { HttpError } from '../acquisition/http';
import type { AcquisitionState } from '../acquisition/types';
import type { WorkspaceRole } from '../lib/access';
import { loadAcquisition } from '../lib/acquisition-store';
import { automationCommandSchema } from './contracts';
import { validateRuleSet } from './decision-tree';
import { createBuyerRule, createSellerRule } from './rules';
import { csvForLead, decisionCounts, evaluateRecords, publishedRule, sourceCurrent } from './research';
import * as store from './store';
import { processOne } from './worker';

export type AutomationAccess={workspaceId:string;actorId:string;role:WorkspaceRole;workspace:{id:string;name:string}};
const review=(access:AutomationAccess)=>{if(!['admin','reviewer'].includes(access.role)) throw new HttpError('A reviewer or administrator must approve this change.',403);};
export async function payload(access:AutomationAccess,offset=0) {
  const [snapshot,current]=await Promise.all([store.loadAutomation(access.workspaceId,access.actorId,offset),loadAcquisition(access.workspaceId,access.actorId)]);
  return {...snapshot,workspace:access.workspace,role:access.role,acquisition:{leads:current.state.leads,contracts:current.state.contracts,buyers:current.state.buyers,version:current.version},
    defaults:{seller:createSellerRule(access.workspaceId),buyer:createBuyerRule(access.workspaceId)}};
}
export async function runEvaluations(access:AutomationAccess,contractId?:string,offset=0) {
  const [snapshot,current]=await Promise.all([store.loadAutomation(access.workspaceId,access.actorId,offset),loadAcquisition(access.workspaceId,access.actorId)]);
  const purposes=contractId?['buyer_fit'] as const:['seller_research','buyer_fit'] as const;
  const results=[];
  for(const purpose of purposes) {
    const rule=publishedRule(snapshot.rules,purpose);
    if(!rule) {if(contractId) throw new DomainError('Publish a buyer matching rule first.');continue;}
    const evaluated=evaluateRecords(rule,snapshot.records,snapshot.sources,current.state,new Date().toISOString(),contractId);
    if(evaluated.length) await store.saveDecisions(access.workspaceId,access.actorId,rule.id,evaluated,current.version);
    results.push(...evaluated);
  }
  return {results,counts:decisionCounts(results),recordCount:snapshot.recordCount,recordLimit:snapshot.recordLimit};
}
export async function command(access:AutomationAccess,input:unknown) {
  const parsed=automationCommandSchema.safeParse(input);
  if(!parsed.success) throw new HttpError('Check the form values and selected action.');
  const cmd=parsed.data,now=new Date().toISOString();
  if(cmd.type==='save_source') {
    review(access);
    if(cmd.source.monthlyRowCap<cmd.source.maxRows) throw new HttpError('The monthly row limit must cover at least one full run.');
    if(cmd.source.status==='approved') {
      if(!cmd.source.permissionReference.trim()) throw new HttpError('Record the source permission evidence before approval.');
      if(!cmd.source.synthetic && (!cmd.source.rightsExpiresAt || Date.parse(cmd.source.rightsExpiresAt)<=Date.parse(now))) throw new HttpError('Real source permission needs a future review expiry.');
    }
    return await store.saveSource(access.workspaceId,access.actorId,cmd.expectedRevision,cmd.source);
  }
  if(cmd.type==='create_rule'||cmd.type==='save_rule') {
    review(access);
    const snapshot=await store.loadAutomation(access.workspaceId,access.actorId);
    const purpose=cmd.type==='create_rule'?cmd.purpose:validateRuleSet(cmd.rule).purpose;
    const ruleId=purpose==='seller_research'?'ie-seller-motivation':'buyer-buy-box';
    const revision=Math.max(0,...snapshot.rules.filter(rule=>rule.ruleId===ruleId).map(rule=>rule.revision))+1;
    const rule=cmd.type==='save_rule'?validateRuleSet(cmd.rule):purpose==='seller_research'?createSellerRule(access.workspaceId,ruleId,revision,{farmZips:cmd.farmZips,minimumScore:cmd.minimumScore}):createBuyerRule(access.workspaceId,ruleId,revision);
    if(rule.workspaceId!==access.workspaceId) throw new HttpError('Rules must belong to the selected workspace.',403);
    return await store.saveRule(access.workspaceId,access.actorId,{ruleId:rule.id,revision:rule.revision,purpose:rule.purpose,status:'draft',rule});
  }
  if(cmd.type==='publish_rule') {
    review(access);
    const snapshot=await store.loadAutomation(access.workspaceId,access.actorId);
    const candidate=snapshot.rules.find(rule=>rule.id===cmd.ruleVersionId);
    if(!candidate) throw new HttpError('Choose a rule in this workspace.');
    validateRuleSet(candidate.rule);
    // A current dry run is part of publication even when a caller skips the UI
    // preview. It cannot change leads, approvals or outreach.
    const current=await loadAcquisition(access.workspaceId,access.actorId);
    evaluateRecords(candidate,snapshot.records,snapshot.sources,current.state,now);
    return await store.publishRule(access.workspaceId,access.actorId,candidate.id);
  }
  if(cmd.type==='evaluate'||cmd.type==='match_buyers') return runEvaluations(access,cmd.type==='match_buyers'?cmd.contractId:undefined,cmd.type==='evaluate'?cmd.offset:0);
  const [snapshot,current]=await Promise.all([store.loadAutomation(access.workspaceId,access.actorId,cmd.type==='dry_run_rule'?cmd.offset:0),loadAcquisition(access.workspaceId,access.actorId)]);
  if(cmd.type==='dry_run_rule') {
    const rule=snapshot.rules.find(item=>item.id===cmd.ruleVersionId);
    if(!rule) throw new HttpError('Choose a saved rule.');
    const results=evaluateRecords(rule,snapshot.records,snapshot.sources,current.state,now);
    const previous=publishedRule(snapshot.rules,rule.purpose);
    const before=previous?evaluateRecords(previous,snapshot.records,snapshot.sources,current.state,now):[];
    const changes=results.map(item=>{const old=before.find(value=>value.recordId===item.recordId);return {recordId:item.recordId,name:item.name,before:old?.evaluation.decision??null,after:item.evaluation.decision,beforeScore:old?.evaluation.observedScore??null,afterScore:item.evaluation.observedScore};});
    return {results,counts:decisionCounts(results),comparison:{before:previous?.revision??null,after:rule.revision,changes,changedCount:changes.filter(item=>item.before!==item.after||item.beforeScore!==item.afterScore).length},recordCount:snapshot.recordCount,recordLimit:snapshot.recordLimit};
  }
  if(cmd.type==='upload_source'||cmd.type==='run_source') {
    const source=snapshot.sources.find(item=>item.id===cmd.sourceId);
    if(!source || !sourceCurrent(source,current.state,now)) throw new HttpError('Approve the source and current data permission before processing an export.');
    if(!publishedRule(snapshot.rules,'seller_research')) throw new HttpError('Publish a seller research rule before processing exports.');
    if(cmd.type==='upload_source') {
      const preview=parseImport({...current.state,leads:[]},{csv:cmd.csv,source:source.name,sourceDate:cmd.sourceDate,permissionReference:source.permissionReference,synthetic:source.synthetic},now);
      if(preview.leads.length>source.maxRows) throw new HttpError(`This source allows at most ${source.maxRows} rows per export.`);
    }
    const requestKey=cmd.type==='upload_source'?'upload:'+createHash('sha256').update(JSON.stringify({csv:cmd.csv,sourceDate:cmd.sourceDate})).digest('hex'):cmd.requestKey;
    const job=await store.enqueueRun(access.workspaceId,access.actorId,source.id,requestKey,cmd.type==='upload_source'?{csv:cmd.csv,sourceDate:cmd.sourceDate}:{},cmd.type==='upload_source'?'ingest':'refresh');
    // Complete small exports immediately, with the durable queue retaining work
    // for scheduler recovery if the request is interrupted.
    const processed=await processOne(job.id);
    return {job:processed??job};
  }
  if(cmd.type==='preview_record'||cmd.type==='promote_record') {
    const record=await store.loadRecord(access.workspaceId,access.actorId,cmd.recordId),rule=publishedRule(snapshot.rules,'seller_research');
    if(!record || !rule) throw new HttpError('Choose a research record and publish a seller rule.');
    const source=snapshot.sources.find(item=>item.id===record.sourceId);
    if(!source || !sourceCurrent(source,current.state,now)) throw new HttpError('The source permission needs review before import.');
    const evaluated=evaluateRecords(rule,[record],[source],current.state,now)[0];
    if(evaluated.evaluation.decision!=='eligible') throw new HttpError('Resolve this record’s matching conditions before adding it to Acquisition.');
    const importInput={csv:csvForLead(record.lead),source:source.name,sourceDate:record.lead.sourceDate,permissionReference:record.lead.permissionReference,synthetic:source.synthetic};
    const preview=parseImport(current.state,importInput,now).preview;
    if(cmd.type==='preview_record') return {recordId:record.id,previewHash:preview.previewHash,preview};
    if(cmd.previewHash!==preview.previewHash) throw new HttpError('This source record changed. Review its import preview again.',409);
    const transition=execute(current.state,{type:'import_leads',...importInput,previewHash:preview.previewHash},{actorId:access.actorId,role:access.role,now});
    const imported=transition.state.leads.find(lead=>lead.county===record.lead.county&&lead.apn.toLowerCase().replace(/[^a-z0-9]/g,'')===record.lead.apn.toLowerCase().replace(/[^a-z0-9]/g,''));
    if(!imported) throw new HttpError('The reviewed record could not be identified.');
    imported.automationSourceId=source.id;
    await store.promoteRecord(access.workspaceId,access.actorId,record.id,current.version,transition.state,{action:'import_leads',details:{sourceId:source.id,recordId:record.id}},record.contentHash,source.revision,rule.id);
    return {imported:true,leadId:imported.id};
  }
  throw new HttpError('Choose a supported action.');
}
