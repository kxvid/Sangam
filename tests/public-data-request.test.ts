import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialState,parseImport,summarize} from '../src/acquisition/domain';
import {prepareAddressLookup} from '../src/public-data/request';
const now='2026-10-29T18:00:00.000Z';
const context={actorId:'operator',role:'operator' as const,now};
function fixture(){
  const state=initialState();
  state.leads=parseImport(state,{csv:'county,apn,address,city,owner_name,zip\nRiverside,TEST-1,100 Fictional Street,Riverside,Practice Owner,92503\n',source:'Practice',sourceDate:'2026-10-28',permissionReference:'Fictional only',synthetic:true},now).leads;
  return state;
}
test('address lookup reservation never creates a business event or transmits owner details',()=>{
  const state=fixture(),before=summarize(state,now);
  const result=prepareAddressLookup(state,{type:'lookup_address',leadId:state.leads[0].id,confirmAddressDisclosure:true},context);
  assert.equal(state.audit.length,0);assert.equal(result.state.audit.length,1);
  assert.deepEqual(summarize(result.state,now),before);
  assert.deepEqual(Object.keys(result.request.address).sort(),['city','state','street','zip']);
  assert.equal(JSON.stringify(result.request).includes('Practice Owner'),false);
});
test('lookup requires exact confirmation, own lead, current rights and nonsuppression',()=>{
  const state=fixture(),command={type:'lookup_address',leadId:state.leads[0].id,confirmAddressDisclosure:true};
  assert.throws(()=>prepareAddressLookup(state,{...command,confirmAddressDisclosure:false},context),/confirm/);
  assert.throws(()=>prepareAddressLookup(state,{...command,url:'https://private.invalid'},context),/confirm/);
  assert.throws(()=>prepareAddressLookup(state,{...command,leadId:'11111111-1111-4111-8111-111111111111'},context),/not found/);
  state.leads[0].synthetic=false;
  assert.throws(()=>prepareAddressLookup(state,command,context),/permission/);
  state.leads[0].synthetic=true;
  state.suppressions.push({id:'s',leadId:command.leadId,phone:'',email:'',ownerName:'',mailingAddress:'',reason:'opt out',createdAt:now,actorId:'operator'});
  assert.throws(()=>prepareAddressLookup(state,command,context),/Suppressed/);
});
test('rolling lookup limits reserve failed requests, enforce cooldown and expire correctly',()=>{
  const state=fixture(),command={type:'lookup_address',leadId:state.leads[0].id,confirmAddressDisclosure:true};
  const reserved=prepareAddressLookup(state,command,context).state;
  assert.throws(()=>prepareAddressLookup(reserved,command,context),/just checked/);
  assert.doesNotThrow(()=>prepareAddressLookup(reserved,command,{...context,now:'2026-10-29T18:01:01.000Z'}));
  state.audit=Array.from({length:20},(_,i)=>({id:String(i),action:'public_data_lookup',at:'2026-10-29T17:00:00.000Z',actorId:'operator',detail:String(i)}));
  assert.throws(()=>prepareAddressLookup(state,command,context),/20 address/);
  assert.doesNotThrow(()=>prepareAddressLookup(state,command,{...context,now:'2026-10-30T17:00:01.000Z'}));
});
