import { DomainError } from '@/src/acquisition/domain';
import { HttpError,json,readCommandRequest,workspaceId } from '@/src/acquisition/http';
import { AccessError,requireWorkspace } from '@/src/lib/access';
import { RuleValidationError } from '@/src/automation/decision-tree';
import { command,payload } from '@/src/automation/service';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
function page(request:Request) {const offset=Number(new URL(request.url).searchParams.get('offset')??0);if(!Number.isSafeInteger(offset)||offset<0||offset>5000)throw new HttpError('Choose a valid results page.');return offset;}
function failure(error:unknown) {
  if(error instanceof HttpError||error instanceof AccessError||error instanceof DomainError) return json({error:error.message},error.status);
  if(error instanceof RuleValidationError) return json({error:error.message},400);
  return json({error:'Sourcing could not confirm this change. Refresh to inspect the job before retrying.'},503);
}
export async function GET(request:Request) {
  try {const offset=page(request);const access=await requireWorkspace(workspaceId(new URL(request.url).searchParams.get('workspaceId')));return json(await payload(access,offset),200,request);} catch(error) {return failure(error);}
}
export async function POST(request:Request) {
  try {const offset=page(request);const body=await readCommandRequest(request);const access=await requireWorkspace(body.workspaceId);const result=await command(access,body.command);return json({...await payload(access,offset),result},200,request);} catch(error) {return failure(error);}
}
