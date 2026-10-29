import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {DomainError} from '../acquisition/domain';
import {gateGood, suppressed} from '../acquisition/policy';
import type {AcquisitionState, Context} from '../acquisition/types';
import type {CensusLookupRequest} from './census';

const lookupCommand=z.strictObject({type:z.literal('lookup_address'),leadId:z.string().uuid(),confirmAddressDisclosure:z.literal(true)});
/** A durable reservation is saved through CAS before any network request. Failed requests count too. */
export function prepareAddressLookup(original:AcquisitionState,input:unknown,context:Context):{state:AcquisitionState;request:CensusLookupRequest} {
  const parsed=lookupCommand.safeParse(input);
  if(!parsed.success)throw new DomainError('Select one property and confirm its address lookup.');
  const lead=original.leads.find(item=>item.id===parsed.data.leadId);
  if(!lead)throw new DomainError('The property was not found in this workspace.',404);
  if(!lead.synthetic&&!gateGood(original,'data_provenance',context.now))throw new DomainError('Current data-source permission is required before address enrichment.');
  if(suppressed(original,lead))throw new DomainError('Suppressed records cannot be enriched.');
  if(!['Riverside','San Bernardino'].includes(lead.county)||!lead.address.trim()||!lead.city.trim()||!/^\d{5}$/.test(lead.zip))throw new DomainError('A complete Inland Empire property address is required.');
  const recent=original.audit.filter(item=>item.action==='public_data_lookup'&&Date.parse(item.at)>Date.parse(context.now)-86_400_000);
  if(recent.length>=20)throw new DomainError('The workspace has used its 20 address lookups for the last 24 hours. Try again later.',429);
  if(recent.some(item=>item.detail===lead.id&&Date.parse(item.at)>Date.parse(context.now)-60_000))throw new DomainError('This property was just checked. Wait a minute before retrying.',429);
  const state=structuredClone(original);
  state.audit.push({id:randomUUID(),action:'public_data_lookup',at:context.now,actorId:context.actorId,detail:lead.id});
  if(Buffer.byteLength(JSON.stringify(state))>32*1024*1024)throw new DomainError('The workspace has reached its storage allowance.');
  return {state,request:{requestKind:'operator_address_lookup',propertyId:lead.id,requestedBy:context.actorId,address:{street:lead.address,city:lead.city,state:'CA',zip:lead.zip}}};
}
