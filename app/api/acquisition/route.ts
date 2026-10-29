import {execute, summarize, DomainError} from '@/src/acquisition/domain';
import {AccessError, requireWorkspace} from '@/src/lib/access';
import {loadAcquisition, saveAcquisition} from '@/src/lib/acquisition-store';
import {HttpError, json, readCommandRequest, workspaceId} from '@/src/acquisition/http';

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
    return json({...current, summary: summarize(current.state, new Date().toISOString()), workspace: access.workspace, role: access.role},200,request);
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
    // Even previews pass through CAS: membership and concurrent changes are
    // checked at the final transactional boundary, with a metadata-only audit.
    // Construct the bounded response before committing, so an oversize result
    // cannot save a transition the operator never receives.
    const response = json({state: transition.state, version: current.version + 1, summary: summarize(transition.state, now), result: transition.result, workspace: access.workspace, role: access.role},200,request);
    await saveAcquisition(body.workspaceId, access.actorId, current.version, transition.state, {action});
    return response;
  } catch (error) { return failure(error); }
}
