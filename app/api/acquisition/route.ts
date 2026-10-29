import {execute, summarize, DomainError} from '@/src/acquisition/domain';
import {AccessError, requireWorkspace} from '@/src/lib/access';
import {loadAcquisition, saveAcquisition} from '@/src/lib/acquisition-store';
import {HttpError, json, readCommandRequest, workspaceId} from '@/src/acquisition/http';
import { after } from 'next/server';
import { runEvaluations } from '@/src/automation/service';
import { SOURCE_BOUND_ACTIONS,sourceChecks } from '@/src/automation/manual-boundary';
import { loadAutomation,commitAcquisition } from '@/src/automation/store';
import type { Command } from '@/src/acquisition/types';
import {loadSourceHolds} from '@/src/automation/source-holds';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function failure(error: unknown) {
  if (error instanceof HttpError || error instanceof AccessError || error instanceof DomainError) return json({error: error.message}, error.status);
  // Provider errors can contain private request details. Do not return/log them.
  return json({error: 'The workspace could not be saved or loaded. Refresh before retrying; contact your administrator if this continues.'}, 503);
}

export async function GET(request: Request) {
  try {
    const id = workspaceId(new URL(request.url).searchParams.get('workspaceId'));
    const access = await requireWorkspace(id);
    const current = await loadAcquisition(id, access.actorId);
    const now = new Date().toISOString();
    const sourceHolds=await loadSourceHolds(id,access.actorId,current.state);
    return json({...current, asOf: now, sourceHolds, summary: summarize(current.state, now), workspace: access.workspace, role: access.role},200,request);
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    const body = await readCommandRequest(request);
    const access = await requireWorkspace(body.workspaceId);
    const current = await loadAcquisition(body.workspaceId, access.actorId);
    if (current.version !== body.version) throw new HttpError('Someone changed this workspace. Refresh and review the latest records before trying again.', 409);
    const now = new Date().toISOString();
    const transition = execute(current.state, body.command, {actorId: access.actorId, role: access.role, now});
    const action = (body.command as {type?: string}).type ?? 'unknown';
    const boundSources=SOURCE_BOUND_ACTIONS.has(action)?sourceChecks(transition.state,body.command as Command,(await loadAutomation(body.workspaceId,access.actorId)).sources,now):[];
    // Even previews pass through CAS: membership and concurrent changes are
    // checked at the final transactional boundary, with a metadata-only audit.
    // Construct the bounded response before committing, so an oversize result
    // cannot save a transition the operator never receives.
    const sourceHolds=await loadSourceHolds(body.workspaceId,access.actorId,transition.state);
    const response = json({state: transition.state, version: current.version + 1, asOf: now, sourceHolds, summary: summarize(transition.state, now), result: transition.result, workspace: access.workspace, role: access.role},200,request);
    if(boundSources.length) await commitAcquisition(body.workspaceId,access.actorId,current.version,transition.state,{action},boundSources);
    else await saveAcquisition(body.workspaceId, access.actorId, current.version, transition.state, {action});
    if(['save_buyer','record_contract','extend_contract','cancel_contract','record_assignment','record_close','underwrite','suppress','record_buyer_receipt'].includes(action)) {
      // Matching follows an operator's saved change. Membership, current source
      // grants and the saved state version are rechecked by the matching service.
      after(async()=>{try{await runEvaluations(access);}catch{/* The manual save succeeded; matching can be rerun from Jobs. */}});
    }
    return response;
  } catch (error) { return failure(error); }
}
