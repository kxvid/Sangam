import type { AcquisitionState, Command, Lead } from '../acquisition/types';
import { DomainError } from '../acquisition/domain';
import { sourceCurrent } from './research';
import type { Source } from './store';

export const SOURCE_BOUND_ACTIONS=new Set(['draft_batch','approve_batch','export_batch','match_buyers','draft_packet','approve_packet','export_packet']);
/** Determine the exact source grants touched by a new manual preparation/export.
 * Historic receipt recording remains available after revocation. */
export function sourceChecks(state:AcquisitionState,command:Command,sources:Source[],now:string) {
  if(!SOURCE_BOUND_ACTIONS.has(command.type)) return [];
  let leadIds:string[]=[];
  if(command.type==='draft_batch') leadIds=command.leadIds;
  else if(command.type==='approve_batch'||command.type==='export_batch') leadIds=state.batches.find(item=>item.id===command.batchId)?.items.map(item=>item.leadId)??[];
  else {
    const contractId=command.type==='match_buyers'||command.type==='draft_packet'?command.contractId:
      command.type==='approve_packet'||command.type==='export_packet'?state.packets.find(item=>item.id===command.packetId)?.contractId:null;
    const leadId=state.contracts.find(item=>item.id===contractId)?.leadId;
    if(leadId)leadIds=[leadId];
  }
  return leadSourceChecks(state,leadIds,sources,now);
}

/** Current grant checks also protect operator-requested external enrichment. */
export function leadSourceChecks(state:AcquisitionState,leadIds:string[],sources:Source[],now:string) {
  const leads=leadIds.map(id=>state.leads.find(item=>item.id===id)).filter((lead):lead is Lead=>!!lead);
  const checks=new Map<string,{id:string;revision:number;permissionReference:string}>();
  for(const lead of leads) {
    if(!lead.automationSourceId)continue;
    const source=sources.find(item=>item.id===lead.automationSourceId);
    if(!source || !sourceCurrent(source,state,now) || source.permissionReference!==lead.permissionReference || source.synthetic!==lead.synthetic) throw new DomainError('This lead’s source permission changed or expired. Review the source before preparing or exporting outreach.');
    checks.set(source.id,{id:source.id,revision:source.revision,permissionReference:lead.permissionReference});
  }
  return [...checks.values()];
}
