import {AccessError, listWorkspaces} from '@/src/lib/access';
import {json} from '@/src/acquisition/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try { return json({workspaces: await listWorkspaces()}); }
  catch (error) {
    if (error instanceof AccessError) return json({error: error.message}, error.status);
    return json({error:'Workspace access is not configured. Contact your administrator.'}, 503);
  }
}
