import {readCommandRequest,json,HttpError} from '@/src/acquisition/http';
import {DomainError} from '@/src/acquisition/domain';
import {AccessError,requireWorkspace} from '@/src/lib/access';
import {loadAcquisition,saveAcquisition} from '@/src/lib/acquisition-store';
import {loadAutomation,commitAcquisition} from '@/src/automation/store';
import {leadSourceChecks} from '@/src/automation/manual-boundary';
import {prepareAddressLookup} from '@/src/public-data/request';
import {lookupCensusAddress,PublicDataError} from '@/src/public-data';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request:Request) {
  let committed=false;
  try {
    const body=await readCommandRequest(request,8_000);
    const access=await requireWorkspace(body.workspaceId);
    const current=await loadAcquisition(body.workspaceId,access.actorId);
    if(current.version!==body.version)throw new HttpError('Refresh the workspace before looking up an address.',409);
    const now=new Date().toISOString();
    const prepared=prepareAddressLookup(current.state,body.command,{actorId:access.actorId,role:access.role,now});
    const lead=current.state.leads.find(item=>item.id===prepared.request.propertyId)!;
    const sources=lead.automationSourceId?(await loadAutomation(body.workspaceId,access.actorId)).sources:[];
    const checks=leadSourceChecks(current.state,[lead.id],sources,now);
    if(checks.length)await commitAcquisition(body.workspaceId,access.actorId,current.version,prepared.state,{action:'public_data_lookup'},checks);
    else await saveAcquisition(body.workspaceId,access.actorId,current.version,prepared.state,{action:'public_data_lookup'});
    committed=true;
    const result=await lookupCensusAddress(prepared.request,{signal:request.signal});
    // This result is a suggestion only, not a silent address/signal update.
    return json({result,workspaceChanged:true},200,request);
  } catch(error) {
    if(error instanceof HttpError||error instanceof AccessError||error instanceof DomainError)return json({error:error.message,workspaceChanged:committed},error.status);
    if(error instanceof PublicDataError)return json({error:error.message,workspaceChanged:committed},502);
    return json({error:'The address lookup could not be completed. Refresh before retrying.',workspaceChanged:committed},503);
  }
}
