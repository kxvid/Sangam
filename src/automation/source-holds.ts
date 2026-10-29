import type {AcquisitionState} from '../acquisition/types';
import {leadSourceChecks} from './manual-boundary';
import {loadAutomation} from './store';

/** Derived readiness only. Transactional source checks still guard every commit. */
export async function loadSourceHolds(workspaceId:string,actorId:string,state:AcquisitionState):Promise<Record<string,string>> {
  const leads=state.leads.filter(lead=>lead.automationSourceId);
  if(!leads.length)return {};
  try {
    const sources=(await loadAutomation(workspaceId,actorId)).sources;
    const now=new Date().toISOString();
    return Object.fromEntries(leads.flatMap(lead=>{
      try {leadSourceChecks(state,[lead.id],sources,now);return [];}
      catch {return [[lead.id,'Source permission is paused, expired or changed. Review Sourcing before preparing contact.']];}
    }));
  } catch {
    return Object.fromEntries(leads.map(lead=>[lead.id,'Source permission could not be checked. Refresh before preparing contact.']));
  }
}
