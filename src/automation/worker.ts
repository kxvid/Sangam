import { randomUUID } from 'node:crypto';
import { DomainError, parseImport } from '../acquisition/domain';
import { AccessError } from '../lib/access';
import { claimRun, failRun, finishRun, type LeasedJob, type SourceRecord } from './store';
import { dataHash, evaluateRecords, publishedRule, recordKey, sourceCurrent } from './research';
import { RuleValidationError } from './decision-tree';

export function processClaim(job:LeasedJob,now:string) {
  if(!sourceCurrent(job.source,job.acquisitionState,now)) throw new DomainError('SOURCE_NOT_CURRENT');
  const rule=publishedRule(job.rules,'seller_research');
  if(!rule) throw new DomainError('PUBLISH_SELLER_RULE');
  let records:SourceRecord[];
  if(job.kind==='ingest') {
    if(!job.input.csv || !job.input.sourceDate) throw new DomainError('EXPORT_INPUT_MISSING');
    const previous={...job.acquisitionState,leads:job.records.map(item=>item.lead)};
    const parsed=parseImport(previous,{csv:job.input.csv,source:job.source.name,sourceDate:job.input.sourceDate,permissionReference:job.source.permissionReference,synthetic:job.source.synthetic},now);
    if(parsed.leads.length>job.source.maxRows) throw new DomainError('ROW_LIMIT_EXCEEDED');
    records=parsed.leads.map(lead=>{
      const key=recordKey(lead), old=job.records.find(item=>item.recordKey===key);
      return {id:old?.id??randomUUID(),workspaceId:job.workspaceId,sourceId:job.source.id,recordKey:key,contentHash:dataHash(lead),lead,lastRunId:job.id,updatedAt:now};
    });
  } else {
    records=job.records;
    if(records.length>job.source.maxRows) throw new DomainError('ROW_LIMIT_EXCEEDED');
  }
  const decisions=evaluateRecords(rule,records,[job.source],job.acquisitionState,now);
  const buyerRule=publishedRule(job.rules,'buyer_fit');
  if(buyerRule) {
    const sourceLeadIds=new Set(job.acquisitionState.leads.filter(lead=>lead.automationSourceId===job.source.id).map(lead=>lead.id));
    const scoped={...job.acquisitionState,contracts:job.acquisitionState.contracts.filter(contract=>sourceLeadIds.has(contract.leadId))};
    decisions.push(...evaluateRecords(buyerRule,records,[job.source],scoped,now));
  }
  return {records,decisions};
}

/** Bounded processor. Lease ownership, source revision and policy are rechecked
 * in the same transaction that commits records. No provider/network collection. */
export async function processOne(runId:string|null=null) {
  const job=await claimRun(runId);
  if(!job) return null;
  try {
    const result=processClaim(job,new Date().toISOString());
    return await finishRun(job.id,job.leaseToken,result.records,result.decisions,job.acquisitionVersion);
  } catch(error) {
    // Fixed codes only: vendor/source CSV and application exceptions can contain
    // private lead details. Those never enter scheduler logs or error responses.
    const known=['SOURCE_NOT_CURRENT','PUBLISH_SELLER_RULE','EXPORT_INPUT_MISSING','ROW_LIMIT_EXCEEDED'];
    const code=error instanceof DomainError && known.includes(error.message)?error.message:
      error instanceof DomainError?'INVALID_EXPORT':error instanceof RuleValidationError?'INVALID_RULE':error instanceof AccessError && error.status===409?'WORKSPACE_CHANGED':'PROCESSING_UNAVAILABLE';
    const retryable=code==='WORKSPACE_CHANGED'||code==='PROCESSING_UNAVAILABLE';
    return await failRun(job.id,job.leaseToken,code,retryable);
  }
}
