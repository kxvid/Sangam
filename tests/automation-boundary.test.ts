import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initialState,parseImport} from '../src/acquisition/domain';
import {sourceChecks} from '../src/automation/manual-boundary';
import {sourceGrant,sellerDecision} from '../src/automation/research';
import {createSellerRule} from '../src/automation/rules';
import type {Source} from '../src/automation/store';
const workspaceId='11111111-1111-4111-8111-111111111111',sourceId='22222222-2222-4222-8222-222222222222';
const now='2026-10-28T18:00:00.000Z';
const source:Source={id:sourceId,workspaceId,revision:1,name:'Practice export',kind:'upload',status:'approved',permissionReference:'Fictional test',rightsExpiresAt:'2026-11-28T18:00:00+00:00',synthetic:true,enabled:true,scheduleHours:24,maxRows:500,monthlyRowCap:10000,config:{},updatedAt:now,updatedBy:'test'};
const state=initialState();
state.leads=parseImport(state,{csv:'county,apn,address,owner_name,zip,equity_pct,tax_delinquent_years,years_owned,nod,vacant,absentee,inherited,code_violations\nRiverside,TEST-1,100 Fictional Street,Practice Owner,92503,75,2,12,false,true,true,false,false\n',source:source.name,sourceDate:'2026-10-28',permissionReference:source.permissionReference,synthetic:true},now).leads;
state.leads[0].automationSourceId=sourceId;
test('DB-shaped expiry timestamps normalize before actual decision engine evaluation',()=>{
  assert.equal(sourceGrant(source,state,now).expiresAt,'2026-11-28T18:00:00.000Z');
  const result=sellerDecision(createSellerRule(workspaceId),{id:state.leads[0].id,workspaceId,sourceId,recordKey:'riverside:test1',contentHash:'a'.repeat(64),lead:state.leads[0],lastRunId:'job',updatedAt:now},source,state,now);
  assert.equal(result.evaluation.decision,'eligible');
});
test('new manual batch preparations bind the current source revision and revoke/expiry block them',()=>{
  const command={type:'draft_batch' as const,channel:'mail' as const,leadIds:[state.leads[0].id],templateId:'test'};
  assert.deepEqual(sourceChecks(state,command,[source],now),[{id:sourceId,revision:1,permissionReference:'Fictional test'}]);
  for(const status of ['revoked','paused','draft'] as const) assert.throws(()=>sourceChecks(state,command,[{...source,status}],now),/source permission/);
  assert.throws(()=>sourceChecks(state,command,[{...source,rightsExpiresAt:'2026-10-27T00:00:00Z'}],now),/source permission/);
  assert.throws(()=>sourceChecks(state,command,[],now),/source permission/);
});
test('historic manual activity can still be recorded after source revocation',()=>{
  const command={type:'record_response' as const,leadId:state.leads[0].id,occurredAt:now,outcome:'conversation' as const,reference:'Actual receipt',notes:''};
  assert.deepEqual(sourceChecks(state,command,[{...source,status:'revoked'}],now),[]);
});
test('the only scheduled path processes uploaded exports, never a sender',()=>{
  const config=JSON.parse(readFileSync('vercel.json','utf8'));
  assert.deepEqual(config.crons,[{path:'/api/cron/sourcing',schedule:'17 * * * *'}]);
});
