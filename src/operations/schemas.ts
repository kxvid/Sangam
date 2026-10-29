import { z } from 'zod';
const id = z.string().uuid();
const text = z.string().trim().min(1).max(2000);
const money = z.number().finite().nonnegative().max(100_000_000).refine(value => Math.abs(value * 100 - Math.round(value * 100)) < 0.00001, 'Use at most two decimal places.');
const percentage = z.number().finite().min(0).max(1);
const timestamp = z.iso.datetime({ offset: true });
export const profitInputsSchema = z.strictObject({
  arv: money.nullable(), repairs: money.nullable(), rehabContingencyPercent: percentage.nullable(),
  buyerClosingHoldingCosts: money.nullable(), buyerProfitPercent: percentage.nullable(),
  sellerPrice: money.nullable(), buyerPrice: money.nullable(), targetAssignmentFee: money.nullable(),
  operatorClosingCosts: money.nullable(), marketingBudget: money.nullable(), otherDealCosts: money.nullable(),
});
export const profitScenarioCommandSchema = z.strictObject({
  type: z.literal('save_profit_scenario'), leadId: id, name: z.enum(['base', 'downside', 'upside']),
  inputs: profitInputsSchema, assumptions: text,
});
export const buyerActivityCommandSchema = z.strictObject({
  type: z.literal('record_buyer_activity'), contractId: id, buyerId: id,
  kind: z.enum(['follow_up_planned', 'conversation', 'offer_received', 'offer_withdrawn']),
  occurredAt: timestamp.nullable(), dueAt: timestamp.nullable(), amount: money.positive().nullable(),
  reference: text, notes: z.string().trim().max(2000), completesTaskId: id.nullable(), withdrawsOfferId: id.nullable(),
  idempotencyKey: z.string().trim().min(1).max(100),
}).superRefine((value, context) => {
  const issue = (path: string, message: string) => context.addIssue({ code: 'custom', path: [path], message });
  if (value.kind === 'follow_up_planned') {
    if (!value.dueAt) issue('dueAt', 'A planned follow-up needs its due date.');
    for (const key of ['occurredAt', 'amount', 'completesTaskId', 'withdrawsOfferId'] as const) if (value[key] !== null) issue(key, 'Planning cannot record an actual outcome.');
  } else {
    if (!value.occurredAt) issue('occurredAt', 'Actual activity needs the actual event time.');
    if (value.dueAt !== null) issue('dueAt', 'Use a separate plan for the next follow-up.');
    if (value.kind === 'offer_received' ? value.amount === null : value.amount !== null) issue('amount', 'Only a received offer has an actual total purchase amount.');
    if (value.kind === 'offer_withdrawn' ? value.withdrawsOfferId === null : value.withdrawsOfferId !== null) issue('withdrawsOfferId', 'Only a withdrawal identifies the current offer being withdrawn.');
    if (value.kind === 'offer_withdrawn' && value.completesTaskId) issue('completesTaskId', 'A withdrawal cannot complete a follow-up task.');
  }
});
