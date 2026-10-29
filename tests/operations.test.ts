import test from 'node:test';
import assert from 'node:assert/strict';
import { execute, initialState, summarize } from '../src/acquisition/domain';
import { eligibility as browserEligibility } from '../src/acquisition/policy';
import { eligibility } from '../src/acquisition/domain';
import type { AcquisitionState, Command, Context, ImportPreview, Receipt, SellerResponse } from '../src/acquisition/types';
import { calculateProfitScenario, buildBuyerPipeline, buildDailyQueue, buildMarketReadiness } from '../src/operations';
import type { BuyerActivityInput, ProfitInputs } from '../src/operations';

const now = '2026-10-29T16:00:00.000Z';
const earlier = '2026-10-28T16:00:00.000Z';
const context: Context = { actorId: 'operator-test', role: 'admin', now };
const id = '12345678-1234-4234-8234-123456789abc';
const profit: ProfitInputs = { arv: 500000, repairs: 50000, rehabContingencyPercent: 0.15,
  buyerClosingHoldingCosts: 25000, buyerProfitPercent: 0.2, sellerPrice: 300000,
  buyerPrice: 315000, targetAssignmentFee: 15000, operatorClosingCosts: 1500,
  marketingBudget: 500, otherDealCosts: 1000 };
const run = (state: AcquisitionState, command: Command, ctx = context) => execute(state, command, ctx);
function leadFixture(synthetic = false) {
  let state = initialState();
  for (const gate of ['counsel','channel_policy','data_provenance','suppression_ops','title_escrow','technical','launch_authorization'] as const) state = run(state, { type: 'set_gate', gate, status: 'approved', evidence: `fictional-${gate}`, reviewedAt: earlier }).state;
  const input = { csv: 'county,apn,address,city,zip,owner_name,mailing_address,phone,property_type,equity_pct,tax_delinquent_years,vacant,absentee,years_owned,nod\nRiverside,001-002,123 Fictional Avenue,Riverside,92501,Fictional Seller,"123 Fictional Avenue, Riverside CA 92501",9515550100,SFR,75,2,true,true,12,false', source: 'Fictional authorized export', sourceDate: '2026-10-27', permissionReference: 'fictional-source', synthetic };
  const preview = run(state, { type: 'preview_import', ...input }).result as ImportPreview;
  state = run(state, { type: 'import_leads', ...input, previewHash: preview.previewHash }).state;
  state = run(state, { type: 'record_contact', leadId: state.leads[0].id, phone: '9515550100', dncStatus: 'clear', litigatorStatus: 'clear', scrubbedAt: earlier, recipientTimezone: 'America/Los_Angeles', timezoneEvidence: 'fictional-local-owner', evidenceReference: 'fictional-scrub' }).state;
  return state;
}
function dealFixture(synthetic = false) {
  let state = leadFixture(synthetic);
  const leadId = state.leads[0].id;
  state = run(state, { type: 'underwrite', leadId, arv: 500000, repairs: 50000, closingCosts: 25000, assignmentFee: 15000, profitPercent: 0.2, compReferences: ['fictional-comp-1','fictional-comp-2','fictional-comp-3'] }).state;
  state = run(state, { type: 'record_offer', leadId, amount: 300000, occurredAt: earlier, reference: 'fictional-offer' }).state;
  state = run(state, { type: 'record_contract', leadId, offerId: state.offers[0].id, price: 300000, signedAt: earlier, reference: 'fictional-contract', assignable: true, disclosuresReference: 'fictional-disclosures', closingDate: '2026-11-10' }).state;
  state = run(state, { type: 'save_buyer', name: 'Fictional Buyer', email: 'buyer@example.com', phone: '9515550101', zips: ['92501'], minPrice: 0, maxPrice: 500000, propertyTypes: ['SFR'], rehabMax: 75000, permissionReference: 'fictional-buyer-permission', permissionAt: earlier, sourceReference: 'fictional-buyer-source', synthetic, active: true }).state;
  state = run(state, { type: 'draft_packet', contractId: state.contracts[0].id, buyerIds: [state.buyers[0].id], body: 'Fictional contractual interest for assignment; not ownership of this property.' }).state;
  state = run(state, { type: 'approve_packet', packetId: state.packets[0].id, evidence: 'fictional-packet-review' }).state;
  return state;
}
function activity(state: AcquisitionState, fields: Partial<BuyerActivityInput> = {}): Command {
  return { type: 'record_buyer_activity', contractId: state.contracts[0].id, buyerId: state.buyers[0].id,
    kind: 'follow_up_planned', occurredAt: null, dueAt: '2026-10-30T16:00:00.000Z', amount: null,
    reference: 'fictional-next-step', notes: '', completesTaskId: null, withdrawsOfferId: null,
    idempotencyKey: 'activity-1', ...fields };
}
function receipt(state: AcquisitionState, fields: Partial<Receipt> = {}): Receipt {
  return { id, batchId: id, leadId: state.leads[0].id, channel: 'mail', destination: 'Fictional mailing destination', occurredAt: now, outcome: 'mailed', reference: 'fictional-mail-receipt', idempotencyKey: 'fictional-receipt', cost: 1, notes: '', synthetic: state.leads[0].synthetic, recordedAt: now, actorId: context.actorId, ...fields };
}

test('profit calculation exposes buyer ceiling, contingency and operator net without booking revenue', () => {
  const before = structuredClone(profit);
  const result = calculateProfitScenario(profit);
  assert.equal(result.rehabContingency, 7500);
  assert.equal(result.buyerCeiling, 317500);
  assert.equal(result.maximumSellerOffer, 302500);
  assert.equal(result.assignmentSpread, 15000);
  assert.equal(result.projectedNet, 12000);
  assert.equal(result.buyerHeadroom, 2500);
  assert.deepEqual(profit, before);
});
test('unknown inputs propagate only to dependent values; entered zero and losses are visible', () => {
  const unknown = calculateProfitScenario({ ...profit, arv: null, otherDealCosts: null });
  assert.equal(unknown.buyerCeiling, null); assert.equal(unknown.assignmentSpread, 15000); assert.equal(unknown.projectedNet, null);
  assert.deepEqual(unknown.missing, ['arv', 'otherDealCosts']);
  const zero = calculateProfitScenario({ ...profit, otherDealCosts: 0, marketingBudget: 0, operatorClosingCosts: 0 });
  assert.equal(zero.projectedNet, 15000);
  const loss = calculateProfitScenario({ ...profit, buyerPrice: 299999.99 });
  assert.equal(loss.assignmentSpread, -0.01); assert.equal(loss.projectedNet, -3000.01);
  assert.match(loss.warnings.join(' '), /projected loss/);
  assert.equal(calculateProfitScenario({ ...profit, repairs: -500 }).buyerCeiling, null);
  assert.equal(calculateProfitScenario({ ...profit, buyerProfitPercent: Infinity }).buyerCeiling, null);
});
test('saving scenarios upgrades old documents additively and leaves operational evidence unchanged', () => {
  const original = dealFixture();
  assert.equal(original.profitScenarios, undefined);
  const command: Command = { type: 'save_profit_scenario', leadId: original.leads[0].id, name: 'base', inputs: profit, assumptions: 'Fictional planning inputs, not paid costs.' };
  let state = run(original, command).state;
  state = run(state, { ...command, inputs: { ...profit, buyerPrice: 320000 } }).state;
  assert.equal(state.profitScenarios?.length, 1);
  assert.equal(state.profitScenarios?.[0].inputs.buyerPrice, 320000);
  for (const key of ['leads','offers','contracts','packets','assignments','closings','expenses'] as const) assert.deepEqual(state[key], original[key]);
  assert.deepEqual(summarize(state, now), summarize(original, now));
  assert.equal(JSON.parse(JSON.stringify(state)).schemaVersion, 1);
  assert.throws(() => run(state, { ...command, inputs: { ...profit, repairs: 0.001 } }), /decimal/);
  assert.throws(() => run(state, { ...command, inputs: { ...profit, buyerProfitPercent: 1.1 } }), /form fields/);
  assert.throws(() => run(state, { ...command, leadId: id }), /not found/);
});
test('buyer planning is distinct from actual delivery, launch, contracts and money, and idempotent', () => {
  const original = dealFixture();
  const command = activity(original);
  const first = run(original, command).state;
  const again = run(first, command).state;
  assert.equal(again.buyerActivities?.length, 1);
  assert.deepEqual(summarize(first, now), summarize(original, now));
  const row = buildBuyerPipeline(first, now)[0];
  assert.equal(row.nextDueAt, '2026-10-30T16:00:00.000Z');
  assert.equal(row.stage, 'prepared'); assert.equal(row.lastActivityAt, null);
  assert.throws(() => run(first, activity(first, { notes: 'different' })), /Idempotency/);
  assert.throws(() => run(first, activity(first, { idempotencyKey: 'bad', amount: 1 })), /Planning cannot/);
  assert.throws(() => run(first, activity(first, { idempotencyKey: 'bad', dueAt: '2026-11-11T16:00:00.000Z' })), /no later than/);
});
test('buyer follow-up completion, new plan and offer withdrawal keep the actual history', () => {
  let state = dealFixture();
  state = run(state, activity(state)).state;
  const task = state.buyerActivities![0];
  state = run(state, activity(state, { idempotencyKey: 'offer-1', kind: 'offer_received', occurredAt: now, dueAt: null, amount: 315000, reference: 'fictional-actual-offer', completesTaskId: task.id })).state;
  let row = buildBuyerPipeline(state, now)[0];
  assert.equal(row.nextDueAt, null); assert.equal(row.plannedTaskId, null); assert.equal(row.stage, 'offered'); assert.equal(row.latestOffer?.amount, 315000);
  const firstOffer = state.buyerActivities!.at(-1)!;
  state = run(state, activity(state, { idempotencyKey: 'offer-2', kind: 'offer_received', occurredAt: now, dueAt: null, amount: 318000 })).state;
  const secondOffer = state.buyerActivities!.at(-1)!;
  assert.throws(() => run(state, activity(state, { idempotencyKey: 'wrong-withdraw', kind: 'offer_withdrawn', occurredAt: now, dueAt: null, withdrawsOfferId: firstOffer.id })), /current offer/);
  state = run(state, activity(state, { idempotencyKey: 'withdraw-2', kind: 'offer_withdrawn', occurredAt: now, dueAt: null, withdrawsOfferId: secondOffer.id })).state;
  row = buildBuyerPipeline(state, now)[0]; assert.equal(row.latestOffer, null); assert.equal(row.stage, 'prepared');
  assert.equal(state.offers.length, 1); assert.equal(state.assignments.length, 0); assert.equal(state.closings.length, 0);
  assert.equal(summarize(state, now).launchedAt, null);
});
test('buyer activity rejects cross-relationship references, invented relationships and future actual events', () => {
  let state = dealFixture();
  assert.throws(() => run(state, activity(state, { buyerId: id })), /not found/);
  const unreviewed = structuredClone(state); unreviewed.packets[0].approvedAt = null;
  assert.deepEqual(buildBuyerPipeline(unreviewed, now), []);
  assert.throws(() => run(unreviewed, activity(unreviewed)), /Review a buyer packet/);
  assert.throws(() => run(state, activity(state, { kind: 'conversation', dueAt: null, occurredAt: '2026-10-30T00:00:00.000Z' })), /future/);
  state = run(state, activity(state)).state;
  const foreignTask = { ...state.buyerActivities![0], id, buyerId: id };
  state.buyerActivities!.push(foreignTask);
  assert.throws(() => run(state, activity(state, { idempotencyKey: 'cross-complete', kind: 'conversation', occurredAt: now, dueAt: null, completesTaskId: id })), /current open task/);
  state.buyers[0].synthetic = true;
  assert.throws(() => run(state, activity(state, { idempotencyKey: 'mixed' })), /same real or practice/);
});
test('suppression, decline and elapsed contracts stop new plans while permitting actual late evidence', () => {
  const state = dealFixture();
  state.suppressions.push({ id, leadId: '', buyerId: state.buyers[0].id, phone: '', email: '', ownerName: '', mailingAddress: '', reason: 'fictional-opt-out', createdAt: now, actorId: context.actorId });
  assert.throws(() => run(state, activity(state)), /suppressed/);
  let saved = run(state, activity(state, { kind: 'conversation', occurredAt: now, dueAt: null })).state;
  assert.equal(buildBuyerPipeline(saved, now)[0].stage, 'suppressed');
  assert.equal(buildDailyQueue(saved, summarize(saved, now), now).some(item => item.id.startsWith('buyer-follow-up:')), false);
  saved = dealFixture(); saved.contracts[0].closingDate = '2026-10-28';
  assert.throws(() => run(saved, activity(saved)), /closing date/);
  saved = run(saved, activity(saved, { kind: 'conversation', occurredAt: now, dueAt: null })).state;
  assert.equal(buildBuyerPipeline(saved, now)[0].stage, 'contract_ended');
  const declined = dealFixture(); declined.buyerReceipts.push({ id, packetId: declined.packets[0].id, buyerId: declined.buyers[0].id, occurredAt: now, outcome: 'declined', reference: 'fictional-decline', idempotencyKey: 'decline', synthetic: false, recordedAt: now });
  assert.throws(() => run(declined, activity(declined)), /declined/);
});
test('practice history is inspectable explicitly and excluded from real operational projections', () => {
  let state = dealFixture(true); state = run(state, activity(state)).state;
  assert.equal(buildBuyerPipeline(state, now).length, 0);
  assert.equal(buildBuyerPipeline(state, now, true).length, 1);
  assert.equal(buildDailyQueue(state, summarize(state, now), now).filter(item => !item.id.startsWith('gate:')).length, 0);
  assert.equal(buildMarketReadiness(state, summarize(state, now), now).funnel.realLeads, 0);
});
test('queue uses one shared eligibility policy and explains blocked and future seller work', () => {
  let state = leadFixture();
  assert.equal(browserEligibility, eligibility);
  let rows = buildDailyQueue(state, summarize(state, now), now);
  assert.equal(rows[0].state, 'ready'); assert.equal(rows[0].priority, 70);
  state.leads[0].contact = null;
  rows = buildDailyQueue(state, summarize(state, now), now);
  assert.equal(rows[0].state, 'blocked'); assert.match(rows[0].blockers.join(' '), /scrub/);
  state = leadFixture(); state.receipts.push(receipt(state));
  rows = buildDailyQueue(state, summarize(state, now), now);
  assert.equal(rows[0].state, 'upcoming'); assert.equal(rows[0].dueAt, '2026-11-05T16:00:00.000Z');
  const later = '2026-11-06T16:00:00.000Z';
  rows = buildDailyQueue(state, summarize(state, later), later);
  assert.equal(rows[0].state, 'ready'); assert.equal(rows[0].priority, 60);
  state.suppressions.push({ id, leadId: state.leads[0].id, phone: '', email: '', ownerName: '', mailingAddress: '', reason: 'fictional-opt-out', createdAt: now, actorId: context.actorId });
  assert.equal(buildDailyQueue(state, summarize(state, now), now).length, 0);
});
test('queue prioritizes closing deadlines using the Pacific calendar through DST', () => {
  const state = dealFixture(); state.contracts[0].closingDate = '2026-11-01';
  const before = '2026-11-02T07:30:00.000Z'; // Still Nov 1 in Los Angeles after the fallback.
  let rows = buildDailyQueue(state, summarize(state, before), before);
  assert.equal(rows[0].priority, 10); assert.match(rows[0].title, /approaching/);
  const after = '2026-11-02T08:30:00.000Z';
  rows = buildDailyQueue(state, summarize(state, after), after);
  assert.equal(rows[0].priority, 0); assert.match(rows[0].title, /elapsed/);
  assert.equal(rows.some(item => item.id.startsWith('buyer-alert:')), false);
  assert.deepEqual(buildDailyQueue(state, summarize(state, after), after), rows);
});
test('server-provided source holds block manual preparation without rewriting recorded facts', () => {
  let state = leadFixture();
  const sourceHolds = { [state.leads[0].id]: 'This source permission has been revoked.' };
  let queue = buildDailyQueue(state, summarize(state, now), now, false, sourceHolds);
  assert.equal(queue[0].state, 'blocked'); assert.match(queue[0].blockers.join(' '), /revoked/);
  let readiness = buildMarketReadiness(state, summarize(state, now), now, sourceHolds);
  assert.equal(readiness.checklist.find(item => item.id === 'recipients')?.status, 'not_recorded');
  assert.equal(readiness.checklist.find(item => item.id === 'source-holds')?.status, 'blocked');
  state = dealFixture(); state = run(state, activity(state)).state;
  const dealHolds = { [state.leads[0].id]: 'Current source permission is paused.' };
  const buyer = buildBuyerPipeline(state, now, false, dealHolds)[0];
  assert.equal(buyer.stage, 'prepared'); assert.match(buyer.blockers.join(' '), /paused/);
  queue = buildDailyQueue(state, summarize(state, now), now, false, dealHolds);
  assert.equal(queue.find(item => item.id.startsWith('buyer-alert:'))?.state, 'blocked');
  assert.equal(queue.find(item => item.id.startsWith('buyer-follow-up:'))?.state, 'blocked');
  readiness = buildMarketReadiness(state, summarize(state, now), now, dealHolds);
  assert.equal(readiness.funnel.activeContracts, 1);
});
test('qualified underwritten seller advances to human offer preparation without fabricating an offer', () => {
  let state = leadFixture(); const leadId = state.leads[0].id;
  state = run(state, { type: 'qualify_lead', leadId, condition: 'Fictional inspection notes', timeline: 'Fictional next month', priceExpectation: 300000, mortgageBalance: null, notes: '' }).state;
  state = run(state, { type: 'underwrite', leadId, arv: 500000, repairs: 50000, closingCosts: 25000, assignmentFee: 15000, profitPercent: 0.2, compReferences: ['fictional-comp-1','fictional-comp-2','fictional-comp-3'] }).state;
  const queue = buildDailyQueue(state, summarize(state, now), now);
  assert.equal(queue[0].id, `prepare-offer:${leadId}`); assert.equal(queue[0].priority, 55);
  assert.equal(state.offers.length, 0); assert.equal(summarize(state, now).launchedAt, null);
});
test('funnel counts unique leads while actual cash excludes buyer offers, deposits and practice costs', () => {
  const state = dealFixture();
  state.receipts.push(receipt(state, { outcome: 'conversation', cost: 2 }));
  const response: SellerResponse = { id, leadId: state.leads[0].id, occurredAt: now, outcome: 'appointment', reference: 'fictional-reply', notes: '', synthetic: false, recordedAt: now };
  state.responses.push(response, { ...response, id: 'another-response' });
  state.expenses.push({ id, category: 'Setup', amount: 100, occurredAt: earlier, reference: 'fictional-paid-expense', synthetic: false, recordedAt: now }, { id: 'practice-expense', category: 'Practice', amount: 10000, occurredAt: earlier, reference: 'fictional-practice', synthetic: true, recordedAt: now });
  state.assignments.push({ id, contractId: state.contracts[0].id, buyerId: state.buyers[0].id, signedAt: now, reference: 'fictional-assignment', price: 315000, disclosuresReference: 'fictional-disclosures', depositAmount: 10000, depositReference: 'fictional-deposit' });
  let view = buildMarketReadiness(state, summarize(state, now), now);
  assert.equal(view.funnel.conversationLeads, 1); assert.equal(view.funnel.assignedContracts, 1);
  assert.equal(view.actuals.collectedFees, 0); assert.equal(view.actuals.recordedSpend, 102); assert.equal(view.actuals.netRecordedCash, -102);
  state.closings.push({ id, contractId: state.contracts[0].id, closedAt: now, assignmentFee: 15000, expenses: 1000, reference: 'fictional-close', synthetic: false });
  view = buildMarketReadiness(state, summarize(state, now), now);
  assert.equal(view.funnel.closedContracts, 1); assert.equal(view.funnel.activeContracts, 0);
  assert.equal(view.actuals.collectedFees, 15000); assert.equal(view.actuals.recordedSpend, 1102); assert.equal(view.actuals.netRecordedCash, 13898);
});
test('readiness distinguishes ended-contract history and expired evidence without altering pilot metrics', () => {
  let state = dealFixture(); state.receipts.push(receipt(state));
  state = run(state, { type: 'cancel_contract', contractId: state.contracts[0].id, endedAt: now, reference: 'fictional-cancel', reason: 'Fictional termination' }).state;
  state.gates.find(item => item.name === 'data_provenance')!.expiresAt = now;
  const summary = summarize(state, now);
  const view = buildMarketReadiness(state, summary, now);
  assert.equal(view.funnel.activeContracts, 0);
  // Contract was signed before this fixture's actual launch; the unchanged pilot view excludes it.
  assert.equal(view.launch.progress.contracts, 0);
  assert.equal(view.checklist.find(item => item.id === 'gate:data_provenance')?.status, 'blocked');
  assert.equal(view.checklist.find(item => item.id === 'public-subscriptions')?.status, 'not_recorded');
  assert.equal(view.checklist.find(item => item.id === 'gate:technical')?.label, 'Recorded release evidence');
  assert.equal(view.launch, summary);
});
test('current general and NOD evidence gates block buyer contact plans without blocking historical actual replies', () => {
  for (const gateName of ['counsel','channel_policy','data_provenance','suppression_ops','title_escrow','technical','launch_authorization'] as const) {
    let state = dealFixture();
    state = run(state, activity(state)).state;
    state.gates.find(item => item.name === gateName)!.status = 'blocked';
    assert.throws(() => run(state, activity(state, { idempotencyKey: 'new-plan' })), new RegExp(gateName));
    const row = buildBuyerPipeline(state, now)[0];
    assert.equal(row.stage, 'prepared');
    assert.match(row.blockers.join(' '), new RegExp(gateName));
    const queue = buildDailyQueue(state, summarize(state, now), now);
    assert.equal(queue.find(item => item.id.startsWith('buyer-follow-up:'))?.state, 'blocked');
    const recorded = run(state, activity(state, { idempotencyKey: 'late-actual', kind: 'conversation', occurredAt: now, dueAt: null })).state;
    assert.equal(recorded.buyerActivities!.at(-1)!.kind, 'conversation');
  }
  let state = dealFixture(); state = run(state, activity(state)).state;
  state.gates.find(item => item.name === 'counsel')!.expiresAt = now;
  assert.throws(() => run(state, activity(state, { idempotencyKey: 'expired-plan' })), /counsel/);
  state = dealFixture(); state = run(state, activity(state)).state;
  state.leads[0].signals.nod = true;
  assert.throws(() => run(state, activity(state, { idempotencyKey: 'nod-plan' })), /nod_counsel/);
  let queue = buildDailyQueue(state, summarize(state, now), now);
  assert.equal(queue.find(item => item.id.startsWith('buyer-follow-up:'))?.state, 'blocked');
  assert.equal(queue.find(item => item.id.startsWith('buyer-alert:'))?.state, 'blocked');
  state = run(state, { type: 'set_gate', gate: 'nod_counsel', status: 'approved', evidence: 'fictional-specialist', reviewedAt: now }).state;
  state = run(state, activity(state, { idempotencyKey: 'nod-cleared-plan' })).state;
  queue = buildDailyQueue(state, summarize(state, now), now);
  assert.equal(queue.find(item => item.id.startsWith('buyer-follow-up:'))?.state, 'upcoming');
});
test('a closed contract marks only the assigned buyer closed and ends losing relationships', () => {
  const state = dealFixture();
  state.buyers.push({ ...state.buyers[0], id, name: 'Other Fictional Buyer', phone: '+19515550102', email: 'other@example.com' });
  state.packets[0].buyerIds.push(id);
  state.packets[0].buyersSnapshot.push(state.buyers[1]);
  state.assignments.push({ id, contractId: state.contracts[0].id, buyerId: state.buyers[0].id, signedAt: now, reference: 'fictional-assignment', price: 315000, disclosuresReference: 'fictional-disclosures', depositAmount: 0, depositReference: '' });
  state.closings.push({ id, contractId: state.contracts[0].id, closedAt: now, assignmentFee: 15000, expenses: 1000, reference: 'fictional-close', synthetic: false });
  const pipeline = buildBuyerPipeline(state, now);
  assert.equal(pipeline.find(item => item.buyerId === state.buyers[0].id)?.stage, 'closed');
  assert.equal(pipeline.find(item => item.buyerId === id)?.stage, 'contract_ended');
  assert.equal(buildDailyQueue(state, summarize(state, now), now).some(item => item.id.startsWith('buyer-')), false);
});
test('same-time seller declines use recording order and terminal-safe ties instead of receipt-array order', () => {
  const state = leadFixture();
  state.receipts.push(receipt(state, { outcome: 'conversation', occurredAt: earlier, recordedAt: earlier }));
  const decline: SellerResponse = { id: 'decline', leadId: state.leads[0].id, occurredAt: earlier, outcome: 'not_interested', reference: 'fictional-decline', notes: '', synthetic: false, recordedAt: now };
  state.responses.push(decline);
  assert.equal(buildDailyQueue(state, summarize(state, now), now).some(item => item.target.leadId === state.leads[0].id), false);
  // An exact timestamp tie conservatively retains the terminal outcome regardless of collection order.
  state.receipts[0].recordedAt = now;
  assert.equal(buildDailyQueue(state, summarize(state, now), now).some(item => item.target.leadId === state.leads[0].id), false);
  // A genuinely later recorded conversation at the same event time can supersede a non-suppressing decline.
  state.responses[0].recordedAt = earlier;
  assert.equal(buildDailyQueue(state, summarize(state, now), now).some(item => item.id.startsWith('qualify:')), true);
  state.responses.push({ ...decline, id: 'opt-out', outcome: 'opt_out', recordedAt: now });
  assert.equal(buildDailyQueue(state, summarize(state, now), now).some(item => item.target.leadId === state.leads[0].id), false);
});
