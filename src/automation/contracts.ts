import { z } from 'zod';
import type { AcquisitionState, Role } from '../acquisition/types';
import type { AutomationSnapshot } from './store';
import type { Evaluation, RuleSet, Snapshot, Trace } from './engine-types';

export type DecisionItem = {
  recordId: string; sourceId: string; sourceRevision: number; leadId: string;
  name: string; address: string; purpose: 'seller_research' | 'buyer_fit';
  contractId?: string; buyerId?: string; evaluation: Evaluation & {snapshot?:Snapshot;platformTrace?:Trace;platformHash?:string};
};
export type AutomationPayload = AutomationSnapshot & {
  workspace: {id:string; name:string}; role: Role;
  acquisition: Pick<AcquisitionState,'leads'|'contracts'|'buyers'> & {version:number};
  defaults: {seller:RuleSet;buyer:RuleSet}; result?: unknown;
};
const id = z.string().uuid();
const text = z.string().trim().min(1).max(2000);
const timestamp = z.string().datetime({offset:true}).transform(value => new Date(value).toISOString());
const sourceDate = z.union([z.iso.date(),z.string().datetime({offset:true})]).transform(value=>value.slice(0,10));
export const sourceSchema = z.object({
  id: id.optional(), name: z.string().trim().min(1).max(160), kind: z.literal('upload'),
  status: z.enum(['draft','approved','paused','revoked']), permissionReference: z.string().trim().max(2000),
  rightsExpiresAt: timestamp.nullable(), synthetic: z.boolean(), enabled: z.boolean(),
  scheduleHours: z.number().int().min(24).max(720), maxRows: z.number().int().min(1).max(500),
  monthlyRowCap: z.number().int().min(1).max(10000), config: z.object({}).strict().default({}),
}).strict();
export const automationCommandSchema = z.discriminatedUnion('type',[
  z.object({type:z.literal('save_source'),expectedRevision:z.number().int().nonnegative(),source:sourceSchema}).strict(),
  z.object({type:z.literal('upload_source'),sourceId:id,csv:z.string().min(1).max(1_800_000),sourceDate,requestKey:text}).strict(),
  z.object({type:z.literal('run_source'),sourceId:id,requestKey:text}).strict(),
  z.object({type:z.literal('create_rule'),purpose:z.enum(['seller_research','buyer_fit']),farmZips:z.array(z.string().regex(/^\d{5}$/)).min(1).max(100).optional(),minimumScore:z.number().int().min(0).max(1000).optional()}).strict(),
  z.object({type:z.literal('save_rule'),rule:z.unknown()}).strict(),
  z.object({type:z.literal('publish_rule'),ruleVersionId:id}).strict(),
  z.object({type:z.literal('dry_run_rule'),ruleVersionId:id,offset:z.number().int().min(0).max(5000).optional()}).strict(),
  z.object({type:z.literal('evaluate'),offset:z.number().int().min(0).max(5000).optional()}).strict(),
  z.object({type:z.literal('match_buyers'),contractId:id}).strict(),
  z.object({type:z.literal('preview_record'),recordId:id}).strict(),
  z.object({type:z.literal('promote_record'),recordId:id,previewHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict(),
]);
export type AutomationCommand = z.infer<typeof automationCommandSchema>;
