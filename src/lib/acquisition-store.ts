import { initialState } from '../acquisition/domain';
import type { AcquisitionState } from '../acquisition/types';
import { AccessError, databaseFailure } from './access';
import { serverDatabase } from './supabase';

export async function loadAcquisition(workspaceId:string,actorId:string): Promise<{state:AcquisitionState;version:number}> {
  try {
    const {data,error}=await serverDatabase().rpc('acquisition_load',{p_workspace:workspaceId,p_actor:actorId});
    if(error) databaseFailure(error);
    if(!data || !Number.isSafeInteger(data.version) || data.version<0 || (data.state && data.state.schemaVersion!==1)) {
      throw new AccessError(503,'The workspace data version needs administrator review.');
    }
    return {state:data.state ?? initialState(),version:data.version};
  } catch(error) {
    if(error instanceof AccessError) throw error;
    throw new AccessError(503,'Workspace storage is unavailable.');
  }
}

export async function saveAcquisition(workspaceId:string,actorId:string,expectedVersion:number,state:AcquisitionState,audit:{action:string;details?:Record<string,unknown>}):Promise<number> {
  try {
    const {data,error}=await serverDatabase().rpc('acquisition_save',{
      p_workspace:workspaceId,p_actor:actorId,p_expected:expectedVersion,p_state:state,p_audit:audit,
    });
    if(error) databaseFailure(error);
    if(!Number.isSafeInteger(data) || data!==expectedVersion+1) throw new AccessError(503,'Save result is unconfirmed. Refresh before making another change.');
    return data;
  } catch(error) {
    if(error instanceof AccessError) throw error;
    throw new AccessError(503,'Workspace save is unconfirmed. Refresh before trying again.');
  }
}
