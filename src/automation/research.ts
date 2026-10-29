import { createHash } from 'node:crypto';
import type { AcquisitionState, Buyer, Contract, Lead } from '../acquisition/types';
import { DomainError } from '../acquisition/domain';
import { evaluateBuyer, evaluateSeller } from './adapters';
import { validateRuleSet } from './decision-tree';
import type { RuleSet, SourceGrant } from './engine-types';
import type { Source, SourceRecord, RuleVersion } from './store';
import type { DecisionItem } from './contracts';

export const recordKey = (lead:Pick<Lead,'county'|'apn'>) => `${lead.county.toLowerCase()}:${lead.apn.toLowerCase().replace(/[^a-z0-9]/g,'')}`;
const norm = (value:string) => value.trim().toLowerCase().replace(/\s+/g,' ');
export function isSuppressed(state:AcquisitionState, lead:Lead, buyer?:Buyer):boolean {
  return state.suppressions.some(item => item.leadId === lead.id || (buyer && item.buyerId === buyer.id)
    || (!!item.phone && [lead.phone,buyer?.phone].includes(item.phone))
    || (!!item.email && [lead.email,buyer?.email].some(value=>value && norm(value)===norm(item.email)))
    || (!!item.mailingAddress && norm(item.ownerName)===norm(lead.ownerName) && norm(item.mailingAddress)===norm(lead.mailingAddress)));
}
export function provenanceCurrent(state:AcquisitionState, now:string):boolean {
  const gate=[...state.gates].reverse().find(item=>item.name==='data_provenance');
  return !!gate && gate.status==='approved' && Date.parse(gate.reviewedAt)<=Date.parse(now)
    && (gate.expiresAt===null || Date.parse(gate.expiresAt)>Date.parse(now));
}
export function sourceCurrent(source:Source, state:AcquisitionState, now:string):boolean {
  return source.status==='approved' && !!source.permissionReference.trim()
    && (source.rightsExpiresAt===null ? source.synthetic : Date.parse(source.rightsExpiresAt)>Date.parse(now))
    && (source.synthetic || provenanceCurrent(state,now));
}
export function sourceGrant(source:Source, state:AcquisitionState, now:string):SourceGrant {
  return {workspaceId:source.workspaceId,sourceId:source.id,status:sourceCurrent(source,state,now)?'approved':'revoked',
    purposes:['seller_research','buyer_fit'],permissionReference:source.permissionReference,expiresAt:source.rightsExpiresAt===null?null:new Date(source.rightsExpiresAt).toISOString()};
}
export function publishedRule(rules:RuleVersion[],purpose:RuleSet['purpose']):RuleVersion | undefined {
  return rules.find(rule=>rule.status==='published' && rule.purpose===purpose);
}
export function sellerDecision(rule:RuleSet, record:SourceRecord, source:Source, state:AcquisitionState, now:string):DecisionItem {
  if(record.workspaceId!==source.workspaceId || source.workspaceId!==rule.workspaceId || record.sourceId!==source.id) throw new DomainError('Source record and rule workspace do not match.');
  return {recordId:record.id,sourceId:source.id,sourceRevision:source.revision,leadId:record.lead.id,name:record.lead.ownerName,address:record.lead.address,purpose:'seller_research',
    evaluation:evaluateSeller(rule,record.lead,{workspaceId:source.workspaceId,asOf:now,sourceGrants:[sourceGrant(source,state,now)],sourceId:source.id,suppressed:isSuppressed(state,record.lead),expectedSynthetic:source.synthetic})};
}
function manualSource(lead:Lead,workspaceId:string):Source {
  return {id:`manual-${lead.id}`,workspaceId,revision:0,name:lead.source,kind:'upload',status:'approved',permissionReference:lead.permissionReference,
    rightsExpiresAt:null,synthetic:lead.synthetic,enabled:false,scheduleHours:24,maxRows:500,monthlyRowCap:10000,config:{},updatedAt:lead.updatedAt,updatedBy:'existing-acquisition-record'};
}
export function buyerDecisions(rule:RuleSet,state:AcquisitionState,sources:Source[],records:SourceRecord[],now:string,contractId?:string):DecisionItem[] {
  const contracts = contractId ? state.contracts.filter(item=>item.id===contractId) : state.contracts.filter(item=>!item.termination && !state.closings.some(close=>close.contractId===item.id) && !state.assignments.some(assignment=>assignment.contractId===item.id));
  if(contractId && !contracts.length) throw new DomainError('Choose a contract in this workspace.');
  if(contracts.length*state.buyers.length>500) throw new DomainError('This matching run exceeds 500 pairs. Select one contract or reduce the active buyer list.');
  return contracts.flatMap((contract:Contract)=>{
    const lead=state.leads.find(item=>item.id===contract.leadId);
    if(!lead) return [];
    const existing=records.find(item=>recordKey(item.lead)===recordKey(lead) && item.lead.source===lead.source && item.lead.permissionReference===lead.permissionReference);
    const originId=lead.automationSourceId ?? existing?.sourceId;
    const configuredSource=sources.find(item=>item.id===originId);
    // Legacy manual records retain their recorded source evidence and current
    // workspace provenance gate. Never fall back after a source was revoked.
    const source=configuredSource ?? manualSource(lead,rule.workspaceId);
    const grant=configuredSource ? sourceGrant(source,state,now) : {
      workspaceId:rule.workspaceId,sourceId:source.id,status:!originId && (lead.synthetic || provenanceCurrent(state,now))?'approved' as const:'revoked' as const,
      purposes:['buyer_fit' as const],permissionReference:lead.permissionReference,expiresAt:null,
    };
    return state.buyers.map(buyer=>{
      const buyerSourceId=`buyer-${buyer.id}`;
      const buyerGrant:SourceGrant={workspaceId:rule.workspaceId,sourceId:buyerSourceId,status:buyer.sourceReference.trim() && (buyer.synthetic || provenanceCurrent(state,now))?'approved':'revoked',purposes:['buyer_fit'],permissionReference:buyer.permissionReference,expiresAt:null};
      return {recordId:`${contract.id}:${buyer.id}`,sourceId:source.id,sourceRevision:source.revision,leadId:lead.id,buyerId:buyer.id,contractId:contract.id,name:buyer.name,address:lead.address,purpose:'buyer_fit' as const,
        evaluation:evaluateBuyer(rule,buyer,lead,contract,{workspaceId:rule.workspaceId,asOf:now,sourceGrants:[grant,buyerGrant],sourceId:source.id,buyerSourceId,suppressed:isSuppressed(state,lead,buyer),expectedSynthetic:configuredSource?.synthetic??lead.synthetic,
          contractUnavailable:state.assignments.some(item=>item.contractId===contract.id)||state.closings.some(item=>item.contractId===contract.id)})};
    });
  }).sort((a,b)=>{
    const order={eligible:0,review:1,excluded:2};
    return order[a.evaluation.decision]-order[b.evaluation.decision] || b.evaluation.scoreRange.minimum-a.evaluation.scoreRange.minimum || a.recordId.localeCompare(b.recordId);
  });
}
export function evaluateRecords(ruleVersion:RuleVersion,records:SourceRecord[],sources:Source[],state:AcquisitionState,now:string,contractId?:string):DecisionItem[] {
  const rule=validateRuleSet(ruleVersion.rule);
  if(ruleVersion.workspaceId!==rule.workspaceId || ruleVersion.purpose!==rule.purpose || ruleVersion.ruleId!==rule.id || ruleVersion.revision!==rule.revision) throw new DomainError('Rule version metadata does not match the rule.');
  if(rule.purpose==='buyer_fit') return buyerDecisions(rule,state,sources,records,now,contractId);
  return records.map(record=>{
    const source=sources.find(item=>item.id===record.sourceId);
    if(!source) throw new DomainError('A record has no current source configuration.');
    return sellerDecision(rule,record,source,state,now);
  });
}
export function decisionCounts(results:DecisionItem[]) { return results.reduce((counts,item)=>{counts[item.evaluation.decision]++;return counts;},{eligible:0,review:0,excluded:0}); }
export function dataHash(lead:Lead):string {
  const {id,importedAt,updatedAt,contact,qualification,underwriting,...data}=lead;
  void id; void importedAt; void updatedAt; void contact; void qualification; void underwriting;
  return createHash('sha256').update(JSON.stringify(data)).digest('hex');
}
export function csvForLead(lead:Lead):string {
  const headers=['county','apn','address','city','zip','owner_name','mailing_address','phone','email','property_type','estimated_value','equity_pct','tax_delinquent_years','years_owned','nod','vacant','absentee','inherited','code_violations','notes'];
  const flag=(value:boolean|null)=>value===null?'':String(value);
  // Internal parser handoff, never a spreadsheet download: preserve exact text.
  // Human exports still use csvDownload's formula escaping in Acquisition.
  const rows=[headers,[lead.county,lead.apn,lead.address,lead.city,lead.zip,lead.ownerName,lead.mailingAddress,lead.phone,lead.email,lead.propertyType,lead.estimatedValue,
    lead.signals.equity_pct,lead.signals.tax_delinquent_years,lead.signals.years_owned,flag(lead.signals.nod),flag(lead.signals.vacant),flag(lead.signals.absentee),flag(lead.signals.inherited),flag(lead.signals.code_violations),lead.notes]];
  return rows.map(row=>row.map(value=>'"'+String(value??'').replace(/"/g,'""')+'"').join(',')).join('\r\n')+'\r\n';
}
