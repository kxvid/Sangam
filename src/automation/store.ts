import type { AcquisitionState, Lead } from '../acquisition/types';
import { initialState } from '../acquisition/domain';
import { AccessError, databaseFailure } from '../lib/access';
import { serverDatabase } from '../lib/supabase';

export type SourceInput = {
  id?: string; name: string; kind: 'upload'; status: 'draft' | 'approved' | 'paused' | 'revoked';
  permissionReference: string; rightsExpiresAt: string | null; synthetic: boolean;
  enabled: boolean; scheduleHours: number; maxRows: number; monthlyRowCap: number;
  config: { sourceDate?: string; [key: string]: unknown };
};
export type Source = Omit<SourceInput, 'id'> & { id: string; workspaceId: string; revision: number; updatedAt: string; updatedBy: string };
export type RuleInput = { ruleId: string; revision: number; purpose: 'seller_research' | 'buyer_fit'; status: 'draft' | 'published'; rule: unknown };
export type RuleVersion = Omit<RuleInput, 'status'> & { id: string; workspaceId: string; status: 'draft' | 'published' | 'retired'; createdAt: string; createdBy: string };
export type Job = {
  id: string; workspaceId: string; sourceId: string; sourceRevision: number; kind: 'ingest' | 'refresh';
  status: 'queued' | 'leased' | 'retry_wait' | 'completed' | 'held' | 'dead_letter';
  requestKey: string; attempts: number; recordCount: number; errorCode: string | null;
  createdAt: string; completedAt: string | null; nextAttemptAt: string; leaseExpiresAt: string | null;
};
export type SourceRecord = { id: string; workspaceId: string; sourceId: string; recordKey: string; contentHash: string; lead: Lead; lastRunId: string; updatedAt: string };
export type RecordInput = Pick<SourceRecord, 'id' | 'recordKey' | 'contentHash' | 'lead'>;
export type DecisionRun = { id: string; workspaceId: string; ruleVersionId: string | null; jobId: string | null; results: unknown[]; createdAt: string };
export type AutomationSnapshot = { sources: Source[]; rules: RuleVersion[]; jobs: Job[]; records: SourceRecord[]; recordCount: number; decisions: DecisionRun[]; recordLimit: number; recordOffset: number };
export type LeasedJob = Job & { leaseToken: string; source: Source; input: { csv?: string; sourceDate?: string }; records: SourceRecord[]; rules: RuleVersion[]; acquisitionState: AcquisitionState; acquisitionVersion: number };

async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  try {
    const { data, error } = await serverDatabase().rpc(name, args);
    if (error) {
      if (error.code === 'P0001') throw new AccessError(409, 'The source or job is no longer ready. Refresh to inspect its status and permission evidence.');
      databaseFailure(error);
    }
    return data as T;
  } catch (error) {
    if (error instanceof AccessError) throw error;
    throw new AccessError(503, 'Automation storage is unavailable. Refresh before retrying.');
  }
}

export const loadAutomation = (workspaceId: string, actorId: string, offset = 0) => rpc<AutomationSnapshot>('automation_load', { p_workspace: workspaceId, p_actor: actorId, p_offset: offset });
export const saveSource = (workspaceId: string, actorId: string, expectedRevision: number, source: SourceInput) => rpc<Source>('automation_save_source', { p_workspace: workspaceId, p_actor: actorId, p_expected: expectedRevision, p_source: source });
export const saveRule = (workspaceId: string, actorId: string, rule: RuleInput) => rpc<RuleVersion>('automation_save_rule', { p_workspace: workspaceId, p_actor: actorId, p_rule: rule });
export const publishRule = (workspaceId: string, actorId: string, ruleVersionId: string) => rpc<RuleVersion>('automation_publish_rule', { p_workspace: workspaceId, p_actor: actorId, p_rule_version: ruleVersionId });
export const enqueueRun = (workspaceId: string, actorId: string, sourceId: string, requestKey: string, input: { csv?: string; sourceDate?: string } = {}, kind: 'ingest' | 'refresh' = 'ingest') => rpc<Job>('automation_enqueue', { p_workspace: workspaceId, p_actor: actorId, p_source: sourceId, p_key: requestKey, p_input: input, p_kind: kind });
export async function claimRun(runId: string | null = null): Promise<LeasedJob | null> {
  const result = await rpc<LeasedJob | null>('automation_claim', { p_run: runId });
  if (result) result.acquisitionState ??= initialState();
  return result;
}
export const finishRun = (runId: string, leaseToken: string, records: RecordInput[], decisions: unknown[], expectedAcquisitionVersion: number) => rpc<Job>('automation_finish', { p_run: runId, p_token: leaseToken, p_records: records, p_decisions: decisions, p_acquisition_version: expectedAcquisitionVersion });
export const failRun = (runId: string, leaseToken: string, code: string, retryable: boolean) => rpc<Job>('automation_fail', { p_run: runId, p_token: leaseToken, p_code: code, p_retryable: retryable });
export const enqueueDueRuns = () => rpc<number>('automation_enqueue_due');
export const saveDecisions = (workspaceId: string, actorId: string, ruleVersionId: string, results: unknown[], expectedAcquisitionVersion: number) => rpc<DecisionRun>('automation_save_decisions', { p_workspace: workspaceId, p_actor: actorId, p_rule_version: ruleVersionId, p_results: results, p_acquisition_version: expectedAcquisitionVersion });
export const promoteRecord = (workspaceId: string, actorId: string, recordId: string, expectedAcquisitionVersion: number, state: AcquisitionState, audit: { action: string; details?: Record<string, unknown> }, expectedRecordHash: string, expectedSourceRevision: number, expectedRuleVersionId: string) => rpc<number>('automation_promote_record', { p_workspace: workspaceId, p_actor: actorId, p_record: recordId, p_expected: expectedAcquisitionVersion, p_state: state, p_audit: audit, p_record_hash: expectedRecordHash, p_source_revision: expectedSourceRevision, p_rule_version: expectedRuleVersionId });

export const loadRecord = (workspaceId: string, actorId: string, recordId: string) => rpc<SourceRecord | null>('automation_load_record', { p_workspace: workspaceId, p_actor: actorId, p_record: recordId });
export type SourceRevision = { id: string; revision: number; permissionReference: string };
export const commitAcquisition = (workspaceId: string, actorId: string, expectedVersion: number, state: AcquisitionState, audit: { action: string; details?: Record<string, unknown> }, sourceRevisions: SourceRevision[]) => rpc<number>('automation_commit_acquisition', { p_workspace: workspaceId, p_actor: actorId, p_expected: expectedVersion, p_state: state, p_audit: audit, p_source_revisions: sourceRevisions });
