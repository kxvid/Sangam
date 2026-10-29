import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {initialState, summarize, execute} from '../src/acquisition/domain';
import {json} from '../src/acquisition/http';
import type {Lead, Receipt} from '../src/acquisition/types';

test('the 2000-lead pilot and 3000 touch history remain usable within response limits', async()=>{
  // Fictional test-only records exercise the real summary and transport. No
  // production import/gate/receipt is created by this capacity fixture.
  const state = initialState();
  const now='2026-10-28T17:00:00.000Z';
  for(let i=0;i<2000;i++) {
    const selectedPhone=`+1951555${String(i).padStart(4,'0')}`;
    const lead:Lead={
      id:randomUUID(),county:'Riverside',apn:`CAPACITY-${i}`,address:`${i} Fictional Test Street`,city:'Riverside',zip:'92501',
      ownerName:`Fictional Test Owner ${i}`,mailingAddress:`${i} Fictional Test Street, Riverside CA 92501`,phone:selectedPhone,email:'',propertyType:'SFR',estimatedValue:400000,
      signals:{tax_delinquent_years:2,nod:false,vacant:true,absentee:true,equity_pct:75,years_owned:12,inherited:null,code_violations:null},score:12,
      breakdown:{tax_delinquent:3,vacant:3,absentee:2,equity_50:2,equity_70_bonus:1,ownership_10:1},source:'Fictional capacity fixture',sourceDate:'2026-10-20',permissionReference:'TEST ONLY',importHash:'0'.repeat(64),synthetic:false,importedAt:now,updatedAt:now,notes:'Fixture only',
      contact:{phone:selectedPhone,dncStatus:'clear',litigatorStatus:'clear',scrubbedAt:'2026-10-20T16:00:00.000Z',recipientTimezone:'America/Los_Angeles',timezoneEvidence:'TEST ONLY',evidenceReference:'TEST ONLY',recordedAt:now,recordedBy:'test'},qualification:null,underwriting:null,
    };
    state.leads.push(lead);
  }
  for(let i=0;i<3000;i++) {
    const lead=state.leads[i%2000];
    const receipt:Receipt={id:randomUUID(),batchId:randomUUID(),leadId:lead.id,channel:'call',destination:lead.phone,occurredAt:i<2000?'2026-10-20T16:00:00.000Z':'2026-10-27T16:00:00.000Z',outcome:i%10===0?'conversation':'no_answer',reference:`Fictional-${i}`,idempotencyKey:`test-${i}`,cost:0.25,notes:'Fictional test history',synthetic:false,recordedAt:now,actorId:'test'};
    state.receipts.push(receipt);
  }
  const started=performance.now();
  const summary=summarize(state,now);
  const elapsed=performance.now()-started;
  assert.equal(summary.progress.leads,2000);
  assert.equal(summary.progress.conversations,300);
  assert.equal(summary.progress.spend,750);
  assert.equal(summary.costPer.conversation,2.5);
  assert.ok(elapsed<10000, `Pilot summary took ${elapsed}ms; avoid repeated nested record searches.`);
  const response=json({state,version:1,summary},200,new Request('https://sangam.example',{headers:{'accept-encoding':'gzip'}}));
  assert.ok((await response.arrayBuffer()).byteLength<4_000_000);
  // No external data fetch is needed to refresh motivation scores.
  const refreshed=execute(state,{type:'rescore'},{actorId:'test',role:'operator',now});
  assert.equal(refreshed.state.leads.length,2000);
  assert.equal(refreshed.state.leads[0].score,12);
  console.log(`Capacity fixture: 2,000 leads / 3,000 touches; summary ${Math.round(elapsed)}ms.`);
});
