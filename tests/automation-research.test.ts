import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState, parseImport} from '../src/acquisition/domain';
import type {AcquisitionState, Buyer, Contract, Lead} from '../src/acquisition/types';
import {buyerDecisions, csvForLead, dataHash, decisionCounts, evaluateRecords, isSuppressed, provenanceCurrent, recordKey, sellerDecision, sourceCurrent, sourceGrant} from '../src/automation/research';
import {createBuyerRule, createSellerRule} from '../src/automation/rules';
import type {RuleSet} from '../src/automation/engine-types';
import type {RuleVersion, Source, SourceRecord} from '../src/automation/store';

const now='2026-10-28T16:00:00.000Z';
const workspaceId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const sourceId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const csv='county,apn,address,city,zip,owner_name,mailing_address,phone,email,property_type,estimated_value,equity_pct,tax_delinquent_years,years_owned,nod,vacant,absentee,inherited,code_violations,notes\nRiverside,TEST-001,"100 Fictional Ave, Unit 2",Riverside,92501,Fictional Owner,"100 Fictional Ave, Unit 2",+19515550100,fictional@example.com,SFR,400000,70,2,11,false,true,true,false,false,"=SUM(1,2)"';
function stateFixture():AcquisitionState {
  const state=initialState();
  state.gates.push({revision:'fixture-provenance-v1',name:'data_provenance',status:'approved',evidence:'FICTIONAL source evidence',reviewedAt:'2026-10-27T16:00:00.000Z',recordedAt:'2026-10-27T16:00:00.000Z',reviewerId:'fixture-reviewer',expiresAt:'2026-12-01T00:00:00.000Z'});
  return state;
}
function sourceFixture(overrides:Partial<Source>={}):Source {
  return {id:sourceId,workspaceId,revision:1,name:'FICTIONAL authorized export',kind:'upload',status:'approved',permissionReference:'FICTIONAL export permission',rightsExpiresAt:'2026-12-01T00:00:00.000Z',synthetic:false,enabled:true,scheduleHours:24,maxRows:500,monthlyRowCap:10000,config:{},updatedAt:now,updatedBy:'fixture-admin',...overrides};
}
function leadFixture(source=sourceFixture()):Lead {
  const lead=parseImport(stateFixture(),{csv,source:source.name,sourceDate:'2026-10-27',permissionReference:source.permissionReference,synthetic:source.synthetic},now).leads[0];
  lead.id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  lead.underwriting={arv:400000,repairs:50000,closingCosts:10000,assignmentFee:15000,profitPercent:0.2,compReferences:['FICTIONAL1','FICTIONAL2','FICTIONAL3'],mao:250000,recordedAt:now};
  return lead;
}
function sourceRecord(source=sourceFixture(),lead=leadFixture(source)):SourceRecord {
  return {id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',workspaceId,sourceId:source.id,recordKey:recordKey(lead),contentHash:dataHash(lead),lead,lastRunId:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',updatedAt:now};
}
function ruleVersion(rule=createSellerRule(workspaceId)):RuleVersion {
  return {id:'ffffffff-ffff-4fff-8fff-ffffffffffff',workspaceId,ruleId:rule.id,revision:rule.revision,purpose:rule.purpose,status:'published',rule,createdAt:now,createdBy:'fixture-admin'};
}
function contractFixture(lead=leadFixture()):Contract {
  return {id:'11111111-1111-4111-8111-111111111111',leadId:lead.id,offerId:'22222222-2222-4222-8222-222222222222',price:270000,signedAt:now,reference:'FICTIONAL signed contract',assignable:true,disclosuresReference:'FICTIONAL disclosure',closingDate:'2026-11-30',amendments:[],termination:null,synthetic:lead.synthetic,createdAt:now};
}
function buyerFixture(overrides:Partial<Buyer>={}):Buyer {
  return {id:'33333333-3333-4333-8333-333333333333',name:'Fictional buyer',email:'buyer@example.com',phone:'+19515550101',zips:['92501'],minPrice:200000,maxPrice:300000,propertyTypes:['SFR'],rehabMax:75000,permissionReference:'FICTIONAL buyer permission',permissionAt:now,sourceReference:'FICTIONAL manual profile',synthetic:false,active:true,cashPurchases24m:4,lastCashPurchaseDate:'2026-10-01',entity:true,purchasedFarmZip:true,updatedAt:now,...overrides};
}
function withContract(lead=leadFixture()):AcquisitionState {
  const state=stateFixture(); state.leads.push(lead); state.contracts.push(contractFixture(lead)); state.buyers.push(buyerFixture({synthetic:lead.synthetic})); return state;
}

test('source permission is independent of scheduling and requires current provenance and finite real-data rights',()=>{
  const state=stateFixture(), source=sourceFixture();
  assert.equal(sourceCurrent(source,state,now),true);
  assert.equal(sourceCurrent({...source,enabled:false},state,now),true);
  for(const status of ['draft','paused','revoked'] as const) assert.equal(sourceCurrent({...source,status},state,now),false);
  for(const overrides of [{permissionReference:''},{rightsExpiresAt:null},{rightsExpiresAt:now},{rightsExpiresAt:'2026-10-01T00:00:00.000Z'}]) assert.equal(sourceCurrent({...source,...overrides},state,now),false);
  assert.equal(sourceCurrent(source,initialState(),now),false);
  assert.equal(sourceCurrent({...source,synthetic:true,rightsExpiresAt:null},initialState(),now),true);
});
test('future, expired and replaced provenance gates cannot grant real source use',()=>{
  const state=stateFixture();
  assert.equal(provenanceCurrent(state,now),true);
  state.gates[0].reviewedAt='2026-10-29T00:00:00.000Z'; assert.equal(provenanceCurrent(state,now),false);
  state.gates[0].reviewedAt='2026-10-27T00:00:00.000Z'; state.gates[0].expiresAt=now; assert.equal(provenanceCurrent(state,now),false);
  state.gates.push({...state.gates[0],status:'blocked',expiresAt:null}); assert.equal(provenanceCurrent(state,now),false);
  assert.equal(sourceGrant(sourceFixture(),state,now).status,'revoked');
});
test('source observation dates stay anchored to the export and old or future data produces review',()=>{
  const source=sourceFixture(), record=sourceRecord(source), rule=createSellerRule(workspaceId), state=stateFixture();
  assert.equal(sellerDecision(rule,record,source,state,now).evaluation.decision,'eligible');
  for(const sourceDate of ['2026-08-01','2026-10-29']) {
    const changed={...record,lead:{...record.lead,sourceDate,updatedAt:now,importedAt:now}};
    assert.equal(sellerDecision(rule,changed,source,state,now).evaluation.decision,'review');
  }
  assert.equal(record.lead.sourceDate,'2026-10-27');
});
test('source expiry, revocation and changed permission references immediately hold seller decisions',()=>{
  const source=sourceFixture(), record=sourceRecord(source), rule=createSellerRule(workspaceId), state=stateFixture();
  for(const changed of [{...source,status:'revoked' as const},{...source,rightsExpiresAt:now},{...source,permissionReference:'different grant'}]) assert.equal(sellerDecision(rule,record,changed,state,now).evaluation.decision,'review');
  assert.equal(sellerDecision(rule,record,source,initialState(),now).evaluation.decision,'review');
});
test('source rows and rule versions cannot be relabeled across workspace, source or revision boundaries',()=>{
  const source=sourceFixture(), record=sourceRecord(source), rule=createSellerRule(workspaceId), state=stateFixture();
  assert.throws(()=>sellerDecision(rule,{...record,workspaceId:'99999999-9999-4999-8999-999999999999'},source,state,now),/workspace|scope/i);
  assert.throws(()=>sellerDecision(rule,{...record,sourceId:'99999999-9999-4999-8999-999999999999'},source,state,now),/source|scope/i);
  assert.throws(()=>evaluateRecords({...ruleVersion(rule),revision:2},[record],[source],state,now),/revision|version/i);
  assert.throws(()=>evaluateRecords({...ruleVersion(rule),purpose:'buyer_fit'},[record],[source],state,now),/purpose|version/i);
});
test('suppression follows contact identity and owner mailing address as well as internal IDs',()=>{
  const state=stateFixture(), source=sourceFixture(), record=sourceRecord(source), lead=record.lead, buyer=buyerFixture();
  for(const match of [{leadId:lead.id},{phone:lead.phone},{email:lead.email.toUpperCase()},{ownerName:'  FICTIONAL  OWNER ',mailingAddress:lead.mailingAddress.toUpperCase()},{buyerId:buyer.id},{phone:buyer.phone}]) {
    state.suppressions=[{id:'fixture',leadId:'',phone:'',email:'',ownerName:'',mailingAddress:'',reason:'FICTIONAL optout',createdAt:now,actorId:'fixture',...match}];
    assert.equal(isSuppressed(state,lead,buyer),true);
  }
  state.suppressions=[{id:'fixture',leadId:lead.id,phone:'',email:'',ownerName:'',mailingAddress:'',reason:'FICTIONAL optout',createdAt:now,actorId:'fixture'}];
  assert.equal(sellerDecision(createSellerRule(workspaceId),record,source,state,now).evaluation.decision,'excluded');
});
test('internal CSV transport roundtrips normalized facts exactly without spreadsheet escaping altering phones or text',()=>{
  const source=sourceFixture(), lead=leadFixture(source);
  lead.notes='=SUM(1,2)\nQuoted "note", and a comma';
  const encoded=csvForLead(lead);
  const roundtrip=parseImport(stateFixture(),{csv:encoded,source:lead.source,sourceDate:lead.sourceDate,permissionReference:lead.permissionReference,synthetic:lead.synthetic},now).leads[0];
  for(const field of ['county','apn','address','city','zip','ownerName','mailingAddress','phone','email','propertyType','estimatedValue','notes','source','sourceDate','permissionReference','synthetic'] as const) assert.deepEqual(roundtrip[field],lead[field],field);
  assert.deepEqual(roundtrip.signals,lead.signals); assert.equal(roundtrip.score,lead.score);
});
test('source hashes ignore workflow state but change with source facts and permissions',()=>{
  const lead=leadFixture();
  assert.equal(dataHash(lead),dataHash({...lead,id:'other',importedAt:'2026-10-01',updatedAt:'2026-10-01',underwriting:null,qualification:null,contact:null}));
  assert.notEqual(dataHash(lead),dataHash({...lead,sourceDate:'2026-10-26'}));
  assert.notEqual(dataHash(lead),dataHash({...lead,permissionReference:'new permission'}));
  assert.notEqual(dataHash(lead),dataHash({...lead,signals:{...lead.signals,vacant:false}}));
});
test('custom rules asking for an unobserved registered attribute safely return review',()=>{
  const rule=createSellerRule(workspaceId);
  rule.attributes['property.lot_sqft']={type:'number',unit:'sqft',label:'Lot area',maxAgeDays:30};
  rule.eligibility={kind:'predicate',id:'large-lot',label:'Lot is at least 4000 square feet',attribute:'property.lot_sqft',op:'gte',right:{kind:'literal',value:4000,unit:'sqft'}};
  const source=sourceFixture(), record=sourceRecord(source);
  const result=evaluateRecords(ruleVersion(rule),[record],[source],stateFixture(),now);
  assert.equal(result[0].evaluation.decision,'review'); assert.equal(result[0].evaluation.hardEligibility,'unknown');
  assert.match(JSON.stringify(result[0].evaluation.eligibilityTrace),/no observation supplied/i);
  assert.deepEqual(decisionCounts(result),{eligible:0,review:1,excluded:0});
});
test('manual acquisition sources require current workspace provenance and retain source-date freshness',()=>{
  const state=withContract(), rule=createBuyerRule(workspaceId);
  assert.equal(buyerDecisions(rule,state,[],[],now)[0].evaluation.decision,'eligible');
  state.gates=[]; assert.equal(buyerDecisions(rule,state,[],[],now)[0].evaluation.decision,'review');
  state.gates=stateFixture().gates; state.leads[0].sourceDate='2026-08-01'; assert.equal(buyerDecisions(rule,state,[],[],now)[0].evaluation.decision,'review');
});
test('promoted source binding survives removed or changed source records and never becomes legacy manual permission',()=>{
  const source=sourceFixture(), lead=leadFixture(source);
  (lead as Lead & {automationSourceId?:string}).automationSourceId=source.id;
  const state=withContract(lead), rule=createBuyerRule(workspaceId);
  assert.equal(buyerDecisions(rule,state,[source],[],now)[0].evaluation.decision,'eligible');
  assert.equal(buyerDecisions(rule,state,[{...source,status:'revoked'}],[],now)[0].evaluation.decision,'review');
  assert.equal(buyerDecisions(rule,state,[],[],now)[0].evaluation.decision,'review');
  assert.equal(buyerDecisions(rule,state,[{...source,permissionReference:'new grant'}],[],now)[0].evaluation.decision,'review');
});
test('buyer matching ranks valid fits by conservative activity score and keeps missing rehab below eligible matches',()=>{
  const state=withContract(), rule=createBuyerRule(workspaceId);
  state.buyers=[buyerFixture({id:'low',cashPurchases24m:0,lastCashPurchaseDate:'2026-01-01',entity:false,purchasedFarmZip:false}),buyerFixture({id:'hold',rehabMax:null}),buyerFixture({id:'high'}),buyerFixture({id:'excluded',maxPrice:280000})];
  const results=buyerDecisions(rule,state,[],[],now);
  assert.deepEqual(results.map(result=>result.buyerId),['high','low','hold','excluded']);
  assert.deepEqual(results.map(result=>result.evaluation.observedScore),[9,0,9,9]);
  assert.deepEqual(decisionCounts(results),{eligible:2,review:1,excluded:1});
  assert.equal(results[0].evaluation.action,'research_candidate_only');
  assert.throws(()=>buyerDecisions(rule,state,[],[],now,'nonexistent-contract'),/contract/i);
});

test('matching cannot associate a real promoted lead with a practice source',()=>{
  const source=sourceFixture(), lead=leadFixture(source);
  lead.automationSourceId=source.id;
  const state=withContract(lead);
  const result=buyerDecisions(createBuyerRule(workspaceId),state,[{...source,synthetic:true}],[],now);
  assert.equal(result[0].evaluation.decision,'excluded');
});
