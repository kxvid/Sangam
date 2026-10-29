import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initialState, execute } from '../src/acquisition/domain';
import { automationCommandSchema } from '../src/automation/contracts';
import { csvForLead, dataHash } from '../src/automation/research';
import { createSellerRule } from '../src/automation/rules';
import { processClaim } from '../src/automation/worker';
import { validCronAuthorization } from '../src/automation/cron-auth';
import type { LeasedJob,SourceRecord } from '../src/automation/store';

const now='2026-10-28T18:00:00.000Z', workspaceId=randomUUID(),sourceId=randomUUID();
const csv='county,apn,address,city,zip,owner_name,mailing_address,phone,email,property_type,estimated_value,equity_pct,tax_delinquent_years,years_owned,nod,vacant,absentee,inherited,code_violations,notes\nRiverside,TEST-900,100 Fictional Way,Riverside,92503,Practice Owner,100 Fictional Way,+15555550100,practice@example.invalid,SFR,400000,75,2,12,false,true,true,false,false,fictional\n';
function claim():LeasedJob {return {id:randomUUID(),workspaceId,sourceId,sourceRevision:1,kind:'ingest',status:'leased',requestKey:'fixture',attempts:1,recordCount:0,errorCode:null,createdAt:now,completedAt:null,nextAttemptAt:now,leaseExpiresAt:'2026-10-28T18:01:00.000Z',leaseToken:randomUUID(),
  source:{id:sourceId,workspaceId,revision:1,name:'Practice export',kind:'upload',status:'approved',permissionReference:'Fictional source for tests only',rightsExpiresAt:null,synthetic:true,enabled:true,scheduleHours:24,maxRows:500,monthlyRowCap:10000,config:{},updatedAt:now,updatedBy:'fixture'},
  input:{csv,sourceDate:'2026-10-28'},records:[],rules:[{id:randomUUID(),workspaceId,ruleId:'ie-seller-motivation',revision:1,purpose:'seller_research',status:'published',rule:createSellerRule(workspaceId),createdAt:now,createdBy:'fixture'}],acquisitionState:initialState(),acquisitionVersion:0};}

test('uploaded exports are scored without editing acquisition or recording business activity',()=>{
  const job=claim(),before=JSON.stringify(job.acquisitionState),result=processClaim(job,now);
  assert.equal(result.records.length,1);assert.equal(result.decisions[0].evaluation.observedScore,12);
  assert.equal(result.decisions[0].evaluation.decision,'eligible');
  assert.equal(result.decisions[0].recordId,result.records[0].id);
  assert.equal(JSON.stringify(job.acquisitionState),before);
});
test('repeat uploads preserve both record and lead identity while refresh preserves dates and exact facts',()=>{
  const job=claim(),first=processClaim(job,now);job.records=first.records;
  const repeat=processClaim(job,now);assert.equal(repeat.records[0].id,first.records[0].id);assert.equal(repeat.records[0].lead.id,first.records[0].lead.id);
  job.kind='refresh';job.input={};const refreshed=processClaim(job,'2026-10-29T18:00:00.000Z');
  assert.deepEqual(refreshed.records,job.records);assert.equal(refreshed.records[0].lead.sourceDate,'2026-10-28');
  assert.equal(refreshed.records[0].contentHash,dataHash(first.records[0].lead));
});
test('withdrawn permission, missing rules and row caps hold work without producing records',()=>{
  const revoked=claim();revoked.source.status='revoked';assert.throws(()=>processClaim(revoked,now),/SOURCE_NOT_CURRENT/);
  const noRule=claim();noRule.rules=[];assert.throws(()=>processClaim(noRule,now),/PUBLISH_SELLER_RULE/);
  const capped=claim();capped.source.maxRows=0;assert.throws(()=>processClaim(capped,now),/ROW_LIMIT_EXCEEDED/);
});
test('date input transports to Acquisition as a date, preserving a successful reviewed promotion',()=>{
  const command=automationCommandSchema.parse({type:'upload_source',sourceId,csv,sourceDate:'2026-10-28T07:00:00.000Z',requestKey:'date-check'});
  assert.equal(command.type,'upload_source');if(command.type!=='upload_source')return;
  assert.equal(command.sourceDate,'2026-10-28');
  const job=claim();job.input={csv:command.csv,sourceDate:command.sourceDate};const lead=processClaim(job,now).records[0].lead;
  const input={csv:csvForLead(lead),source:lead.source,sourceDate:lead.sourceDate,permissionReference:lead.permissionReference,synthetic:true};
  const context={actorId:'fixture',role:'admin' as const,now};
  const preview=execute(initialState(),{type:'preview_import',...input},context).result as {previewHash:string};
  const promoted=execute(initialState(),{type:'import_leads',...input,previewHash:preview.previewHash},context);
  assert.equal(promoted.state.leads.length,1);
});
test('scheduler rejects absent, weak, malformed and wrong credentials',()=>{
  const secret='a'.repeat(64);
  assert.equal(validCronAuthorization(null,secret),false);assert.equal(validCronAuthorization(`Bearer ${secret}`,undefined),false);
  assert.equal(validCronAuthorization('Bearer short','short'),false);assert.equal(validCronAuthorization(`Bearer ${'b'.repeat(64)}`,secret),false);
  assert.equal(validCronAuthorization(`Bearer ${secret}`,secret),true);
});
test('500-row processing remains bounded and preserves missing fields as unknown',()=>{
  const job=claim();const rows=Array.from({length:500},(_,index)=>`Riverside,TEST-${index},${index} Fictional Way,Riverside,92503,Practice Owner ${index},${index} Fictional Way,,,SFR,,75,2,12,false,true,true,,,fictional`);
  job.input.csv=csv.split('\n')[0]+'\n'+rows.join('\n')+'\n';
  const result=processClaim(job,now);
  assert.equal(result.records.length,500);assert.equal(result.decisions.length,500);
  assert.ok(Buffer.byteLength(JSON.stringify(result.decisions))<12_000_000);
  assert.equal(result.records[0].lead.signals.inherited,null);
});
