import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';
import { serverDatabase } from './supabase';

export type WorkspaceRole = 'operator' | 'reviewer' | 'admin';
export type Workspace = { id: string; name: string; role: WorkspaceRole };
export class AccessError extends Error {
  constructor(public status: number, message: string) { super(message); this.name = 'AccessError'; }
}

async function actor(): Promise<string> {
  if (!process.env.CLERK_SECRET_KEY || !process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    throw new AccessError(503, 'Sign-in is not configured. Ask the workspace administrator to finish setup.');
  }
  const { userId } = await auth();
  if (!userId) throw new AccessError(401, 'Sign in to access your workspace.');
  return userId;
}

export function databaseFailure(error: { code?: string } | null): never {
  if (error?.code === '40001') throw new AccessError(409, 'This workspace changed. Refresh and review before trying again.');
  if (error?.code === '42501') throw new AccessError(403, 'Workspace access or the required role is unavailable.');
  if (error?.code === '22023' || error?.code === '23514') throw new AccessError(400, 'The workspace could not save this change. Check its size and values.');
  throw new AccessError(503, 'Workspace storage is unavailable. No change was confirmed.');
}

export async function listWorkspaces(): Promise<Workspace[]> {
  const actorId = await actor();
  try {
    const { data, error } = await serverDatabase().rpc('actor_workspaces', { p_actor: actorId });
    if (error) databaseFailure(error);
    return z.array(z.object({id:z.string().uuid(),name:z.string(),role:z.enum(['operator','reviewer','admin'])})).parse(data);
  } catch (error) {
    if (error instanceof AccessError) throw error;
    throw new AccessError(503, 'Workspace storage is not configured or unavailable.');
  }
}

export async function requireWorkspace(workspaceId: string): Promise<{actorId:string; workspaceId:string; role:WorkspaceRole; workspace:{id:string;name:string}}> {
  if (!z.string().uuid().safeParse(workspaceId).success) throw new AccessError(400, 'Choose a valid workspace.');
  const actorId = await actor();
  try {
    const { data, error } = await serverDatabase().rpc('workspace_context', { p_workspace: workspaceId, p_actor: actorId });
    if (error) databaseFailure(error);
    const workspace = z.object({id:z.string().uuid(),name:z.string(),role:z.enum(['operator','reviewer','admin'])}).parse(data);
    return {actorId, workspaceId,role:workspace.role,workspace:{id:workspace.id,name:workspace.name}};
  } catch (error) {
    if (error instanceof AccessError) throw error;
    throw new AccessError(503, 'Workspace storage is not configured or unavailable.');
  }
}
