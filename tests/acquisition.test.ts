import test from 'node:test';
import assert from 'node:assert/strict';
import { execute, initialState, summarize, scoreSignals, buyerActivityScore, eligibility, DomainError } from '../src/acquisition/domain';
import type { AcquisitionState, Command, Context, GateName, ImportPreview } from '../src/acquisition/types';

const now = '2026-10-28T16:00:00.000Z';
const ctx: Context = { actorId: 'reviewer-1', role: 'reviewer', now };
const gates: GateName[] = ['counsel', 'channel_policy', 'data_provenance', 'suppression_ops', 'title_escrow', 'technical', 'launch_authorization'];
const csv = 'county,apn,address,city,zip,owner_name,mailing_address,phone,property_type,equity_pct,tax_delinquent_years,vacant,absentee,years_owned,nod\nRiverside,001-002,123 Fictional Ave,Riverside,92501,Test Owner,"123 Fictional Ave, Riverside CA 92501",9515550100,SFR,75,2,true,true,12,false';
const input = { csv, source: 'Authorized fixture export', sourceDate: '2026-10-27', permissionReference: 'fixture-permission-1', synthetic: false };
function run(state: AcquisitionState, command: Command, context = ctx) { return execute(state, command, context); }
function ready(): AcquisitionState {
  let state = initialState();
  for (const gate of gates) state = run(state, { type: 'set_gate', gate, status: 'approved', evidence: `fixture-${gate}`, reviewedAt: now }).state;
  const preview = run(state, { type: 'preview_import', ...input }).result as ImportPreview;
  state = run(state, { type: 'import_leads', ...input, previewHash: preview.previewHash }).state;
  return run(state, { type: 'record_contact', leadId: state.leads[0].id, phone: '9515550100', dncStatus: 'clear', litigatorStatus: 'clear', scrubbedAt: '2026-10-27T16:00:00.000Z', recipientTimezone: 'America/Los_Angeles', timezoneEvidence: 'fixture-confirmed-local-residence', evidenceReference: 'fixture-scrub' }).state;
}
function batch(state = ready(), channel: 'mail' | 'call' = 'mail') {
  state = run(state, { type: 'save_template', channel, name: 'First contact', body: 'Hello {{owner_name}}, Kahla Labs LLC seeks to buy {{address}} as a principal buyer and may assign the purchase contract for profit. Reply to the operator.' }).state;
  const templateId = state.templates.at(-1)!.id;
  state = run(state, { type: 'review_template', templateId, approved: true, evidence: 'fixture-template-review' }).state;
  state = run(state, { type: 'draft_batch', channel, leadIds: [state.leads[0].id], templateId }).state;
  return run(state, { type: 'approve_batch', batchId: state.batches.at(-1)!.id, evidence: 'fixture-batch-review' }).state;
}

test('original motivation weights distinguish 50 and 70 percent equity and preserve unknowns', () => {
  assert.equal(scoreSignals({ tax_delinquent_years: 2, nod: true, vacant: true, absentee: true, equity_pct: 70, years_owned: 10, inherited: true, code_violations: true }).score, 20);
  assert.equal(scoreSignals({ tax_delinquent_years: null, nod: null, vacant: null, absentee: true, equity_pct: 50, years_owned: 9, inherited: null, code_violations: null }).score, 4);
  const state = ready();
  assert.equal(state.leads[0].score, 12);
  assert.equal(state.leads[0].signals.inherited, null);
});
test('real CSV import requires source permission and an unchanged reviewed preview', () => {
  assert.throws(() => run(initialState(), { type: 'preview_import', ...input }), /data_provenance/);
  let state = ready();
  const preview = run(state, { type: 'preview_import', ...input }).result as ImportPreview;
  assert.throws(() => run(state, { type: 'import_leads', ...input, csv: csv.replace('Test Owner', 'Different Owner'), previewHash: preview.previewHash }), /preview/i);
  assert.throws(() => run(state, { type: 'preview_import', ...input, sourceDate: '2026-10-29' }), /future/i);
});
test('malformed CSV cannot partially commit or smuggle permission fields', () => {
  const state = ready(); const before = JSON.stringify(state);
  assert.throws(() => run(state, { type: 'preview_import', ...input, csv: csv.replace('county,apn', 'dnc_status,apn') }), /column|header|required/i);
  assert.throws(() => run(state, { type: 'preview_import', ...input, csv: `${csv}\nRiverside,bad` }), /row|columns/i);
  assert.throws(() => run(state, { type: 'preview_import', ...input, csv: csv.replace(',true,true,', ',maybe,true,') }), /boolean|true|false/i);
  assert.equal(JSON.stringify(state), before);
});
test('dedupe uses county and APN; changing owner invalidates contact evidence', () => {
  let state = ready();
  const changed = { ...input, csv: csv.replace('Test Owner', 'New Owner') };
  const preview = run(state, { type: 'preview_import', ...changed }).result as ImportPreview;
  assert.equal(preview.updatedCount, 1);
  state = run(state, { type: 'import_leads', ...changed, previewHash: preview.previewHash }).state;
  assert.equal(state.leads.length, 1); assert.equal(state.leads[0].contact, null);
});
test('operators cannot approve gate evidence or reviewed templates', () => {
  const operator = { ...ctx, role: 'operator' as const };
  assert.throws(() => run(initialState(), { type: 'set_gate', gate: 'counsel', status: 'approved', evidence: 'fixture', reviewedAt: now }, operator), DomainError);
  const state = batch();
  assert.throws(() => run(state, { type: 'approve_batch', batchId: state.batches[0].id, evidence: 'fixture' }, operator), /reviewer|permission/i);
});
test('exports bind approved content and do not start launch; actual receipt is idempotent', () => {
  let state = batch(); const batchId = state.batches[0].id; const leadId = state.leads[0].id;
  const exported = run(state, { type: 'export_batch', batchId }); state = exported.state;
  assert.match((exported.result as {content: string}).content, /Test Owner/);
  assert.equal(summarize(state, now).launchedAt, null);
  const receipt: Command = { type: 'record_receipt', batchId, leadId, occurredAt: now, outcome: 'mailed', reference: 'fixture-mail-vendor-receipt', idempotencyKey: 'receipt-1', cost: 0.57 };
  state = run(state, receipt).state; state = run(state, receipt).state;
  assert.equal(state.receipts.length, 1); assert.equal(summarize(state, now).progress.leads, 1);
  assert.equal(summarize(state, now).launchedAt, now);
  assert.throws(() => run(state, { ...receipt, cost: 4 }), /idempotency/i);
});
test('export fails closed for suppression, stale contact, revoked gate, changed lead, expired approval and retired template', () => {
  const state = batch(); const batchId = state.batches[0].id; const leadId = state.leads[0].id;
  const suppressed = run(state, { type: 'suppress', leadId, reason: 'Owner requested no contact' }).state;
  assert.throws(() => run(suppressed, { type: 'export_batch', batchId }), /suppress/i);
  const revoked = run(state, { type: 'set_gate', gate: 'counsel', status: 'blocked', evidence: 'review withdrawn', reviewedAt: now }).state;
  assert.throws(() => run(revoked, { type: 'export_batch', batchId }), /counsel|gate/i);
  assert.throws(() => run(state, { type: 'export_batch', batchId }, { ...ctx, now: '2026-10-29T16:00:01.000Z' }), /expired/i);
  const retired = run(state, { type: 'review_template', templateId: state.templates[0].id, approved: false, evidence: 'retired' }).state;
  assert.throws(() => run(retired, { type: 'export_batch', batchId }), /template/i);
  const { recordedAt: _recordedAt, recordedBy: _recordedBy, ...contactInput } = state.leads[0].contact!;
  const changed = run(state, { type: 'record_contact', leadId, ...contactInput, evidenceReference: 'new-scrub' }).state;
  assert.throws(() => run(changed, { type: 'export_batch', batchId }), /changed|snapshot/i);
  assert.equal(eligibility(state, state.leads[0], 'mail', '2026-12-01T16:00:00.000Z').some(x => /scrub/i.test(x)), true);
});
test('manual calling enforces local hours, supported recipient timezone and daily attempt cap', () => {
  let state = batch(ready(), 'call'); const batchId = state.batches[0].id; const leadId = state.leads[0].id;
  assert.throws(() => run(state, { type: 'export_batch', batchId }, { ...ctx, now: '2026-10-28T15:59:59.000Z' }), /hours|approval|before/i);
  state = run(state, { type: 'export_batch', batchId }).state;
  state = run(state, { type: 'record_receipt', batchId, leadId, occurredAt: now, outcome: 'no_answer', reference: 'call-log-1', idempotencyKey: 'call-1', cost: 0 }).state;
  assert.throws(() => run(state, { type: 'record_receipt', batchId, leadId, occurredAt: '2026-10-28T17:00:00.000Z', outcome: 'no_answer', reference: 'call-log-2', idempotencyKey: 'call-2', cost: 0 }, { ...ctx, now: '2026-10-28T17:00:00.000Z' }), /daily|one call/i);
});
test('a fabricated mail receipt without an exported approved batch is rejected', () => {
  const state = batch();
  assert.throws(() => run(state, { type: 'record_receipt', batchId: state.batches[0].id, leadId: state.leads[0].id, occurredAt: now, outcome: 'mailed', reference: 'fixture', idempotencyKey: 'unexported', cost: 0 }), /export/i);
});
test('synthetic exercises never start the real clock or count towards real targets', () => {
  let state = initialState();
  const synthetic = { ...input, synthetic: true };
  const preview = run(state, { type: 'preview_import', ...synthetic }).result as ImportPreview;
  state = run(state, { type: 'import_leads', ...synthetic, previewHash: preview.previewHash }).state;
  assert.equal(summarize(state, now).realLeads, 0);
  assert.equal(summarize(state, now).syntheticLeads, 1);
  assert.equal(summarize(state, now).progress.leads, 0);
});

function contracted() {
  let state = batch();
  state = run(state, { type: 'export_batch', batchId: state.batches[0].id }).state;
  const leadId = state.leads[0].id;
  state = run(state, { type: 'record_receipt', batchId: state.batches[0].id, leadId, occurredAt: now, outcome: 'mailed', reference: 'fixture-mail', idempotencyKey: 'mail-contract', cost: 0.57 }).state;
  state = run(state, { type: 'underwrite', leadId, arv: 500000, repairs: 50000, closingCosts: 10000, assignmentFee: 15000, profitPercent: 0.3, compReferences: ['sold-fixture-1', 'sold-fixture-2', 'sold-fixture-3'] }).state;
  assert.equal(state.leads[0].underwriting!.mao, 275000);
  state = run(state, { type: 'record_offer', leadId, amount: 270000, occurredAt: now, reference: 'offer-fixture-1' }).state;
  state = run(state, { type: 'record_contract', leadId, offerId: state.offers[0].id, price: 270000, signedAt: now, reference: 'contract-fixture-1', assignable: true, disclosuresReference: 'seller-disclosures-fixture', closingDate: '2026-11-15' }).state;
  return state;
}
function buyerPacket() {
  let state = contracted();
  state = run(state, { type: 'save_buyer', name: 'Fictional Buyer LLC', email: 'buyer@example.test', phone: '9515550101', zips: ['92501'], minPrice: 200000, maxPrice: 400000, propertyTypes: ['SFR'], rehabMax: 75000, permissionReference: 'permission-fixture', permissionAt: now, sourceReference: 'buyer-source-fixture', synthetic: false, active: true }).state;
  const contractId = state.contracts[0].id, buyerId = state.buyers[0].id;
  state = run(state, { type: 'draft_packet', contractId, buyerIds: [buyerId], body: 'Kahla Labs LLC offers only its contractual interest for assignment. The purchase agreement and required disclosures are available for your independent review.' }).state;
  state = run(state, { type: 'approve_packet', packetId: state.packets[0].id, evidence: 'packet-review-fixture' }).state;
  return state;
}
test('gate revocation and reapproval do not resurrect the previous exact batch approval', () => {
  let state = batch();
  state = run(state, { type: 'set_gate', gate: 'counsel', status: 'blocked', evidence: 'withdrawn', reviewedAt: now }).state;
  state = run(state, { type: 'set_gate', gate: 'counsel', status: 'approved', evidence: 'fixture-counsel', reviewedAt: now }).state;
  assert.throws(() => run(state, { type: 'export_batch', batchId: state.batches[0].id }), /snapshot|changed/i);
});
test('batch retains actual approved scrub and gate evidence for later audit', () => {
  const state = batch();
  assert.equal(state.batches[0].items[0].contactEvidence.evidenceReference, 'fixture-scrub');
  assert.equal(state.batches[0].gateEvidence.find(item => item.name === 'counsel')?.evidence, 'fixture-counsel');
  assert.match(state.batches[0].templateSnapshot.body, /principal buyer/);
});
test('NOD lead cannot be exported before specialist evidence and suppressed phone cannot move to another parcel', () => {
  let state = ready();
  const nodInput = { ...input, csv: csv.replace('12,false', '12,true') };
  const preview = run(state, { type: 'preview_import', ...nodInput }).result as ImportPreview;
  state = run(state, { type: 'import_leads', ...nodInput, previewHash: preview.previewHash }).state;
  assert.equal(eligibility(state, state.leads[0], 'mail', now).some(reason => reason.includes('nod_counsel')), true);
  state = run(state, { type: 'suppress', leadId: state.leads[0].id, reason: 'no further contact' }).state;
  const second = { ...input, csv: csv.replace('001-002', '001-003').replace('Test Owner', 'Second Owner') };
  const next = run(state, { type: 'preview_import', ...second }).result as ImportPreview;
  state = run(state, { type: 'import_leads', ...second, previewHash: next.previewHash }).state;
  assert.equal(eligibility(state, state.leads[1], 'mail', now).some(reason => /suppressed/.test(reason)), true);
});
test('complete manual assignment flow produces evidence, truthful targets and collected-fee accounting', () => {
  let state = buyerPacket(); const contractId = state.contracts[0].id, buyerId = state.buyers[0].id, packetId = state.packets[0].id;
  const matches = run(state, { type: 'match_buyers', contractId }).result as Array<{buyerId: string}>;
  assert.deepEqual(matches.map(item => item.buyerId), [buyerId]);
  state = run(state, { type: 'export_packet', packetId }).state;
  state = run(state, { type: 'record_buyer_receipt', packetId, buyerId, occurredAt: now, outcome: 'delivered', reference: 'manual-delivery-fixture', idempotencyKey: 'buyer-delivery-1' }).state;
  state = run(state, { type: 'record_assignment', contractId, buyerId, signedAt: now, reference: 'assignment-fixture', price: 285000, disclosuresReference: 'end-buyer-disclosures-fixture', depositAmount: 5000, depositReference: 'escrow-deposit-fixture' }).state;
  state = run(state, { type: 'record_close', contractId, closedAt: now, assignmentFee: 15000, expenses: 300, reference: 'closing-statement-fixture' }).state;
  const summary = summarize(state, now);
  assert.equal(summary.progress.contracts, 1); assert.equal(summary.progress.offers, 1);
  assert.equal(summary.progress.assignmentFees, 15000); assert.equal(summary.progress.spend, 300.57);
  assert.throws(() => run(state, { type: 'export_packet', packetId }), /assigned|closed/i);
});
test('buyer revocation invalidates an already approved packet before download', () => {
  let state = buyerPacket();
  const { updatedAt: _updatedAt, ...buyer } = state.buyers[0];
  state = run(state, { type: 'save_buyer', ...buyer, active: false }).state;
  assert.throws(() => run(state, { type: 'export_packet', packetId: state.packets[0].id }), /permission|fit|changed/i);
});
test('empty contract evidence and future actual activity cannot create business milestones', () => {
  const state = contracted();
  assert.throws(() => run(state, { type: 'record_close', contractId: state.contracts[0].id, closedAt: now, assignmentFee: 15000, expenses: 0, reference: '' }), /form/i);
  assert.throws(() => run(state, { type: 'record_offer', leadId: state.leads[0].id, amount: 1, occurredAt: '2026-10-29T16:00:00Z', reference: 'future' }), /future/i);
  assert.throws(() => run(state, { type: 'record_close', contractId: state.contracts[0].id, closedAt: now, assignmentFee: 15000, expenses: 0, reference: 'no-assignment' }), /assignment/i);
});
test('90-day counters exclude events beyond day90 while actual launch remains anchored', () => {
  const state = contracted();
  assert.equal(summarize(state, '2027-02-01T16:00:00Z').daysRemaining, 0);
  assert.equal(summarize(state, '2027-02-01T16:00:00Z').progress.contracts, 1);
  assert.equal(summarize(state, '2027-02-01T16:00:00Z').launchedAt, now);
});
test('CSV export neutralizes formula injection from a source owner name', () => {
  let state = ready(); const changed = { ...input, csv: csv.replace('Test Owner', '=HYPERLINK(""http://example.test"")') };
  // A quoted RFC4180 field is required for embedded quotes.
  changed.csv = changed.csv.replace('=HYPERLINK(""http://example.test"")', '"=HYPERLINK(""http://example.test"")"');
  const preview = run(state, { type: 'preview_import', ...changed }).result as ImportPreview;
  state = run(state, { type: 'import_leads', ...changed, previewHash: preview.previewHash }).state;
  state = run(state, { type: 'record_contact', leadId: state.leads[0].id, phone: '9515550100', dncStatus: 'clear', litigatorStatus: 'clear', scrubbedAt: now, recipientTimezone: 'America/Los_Angeles', timezoneEvidence: 'fixture-local', evidenceReference: 'fixture-scrub' }).state;
  state = batch(state);
  const output = run(state, { type: 'export_batch', batchId: state.batches[0].id }).result as {content: string};
  assert.match(output.content, /"'=HYPERLINK/);
});
test('a late buyer opt-out suppresses the originally contacted destination even after profile edits', () => {
  let state = buyerPacket(); const packetId = state.packets[0].id, buyerId = state.buyers[0].id;
  state = run(state, { type: 'export_packet', packetId }).state;
  const { updatedAt: _updatedAt, ...buyer } = state.buyers[0];
  state = run(state, { type: 'save_buyer', ...buyer, email: 'changed@example.test', phone: '9515550109' }).state;
  const later = { ...ctx, now: '2026-10-31T16:00:00.000Z' };
  state = run(state, { type: 'record_buyer_receipt', packetId, buyerId, occurredAt: later.now, outcome: 'opt_out', reference: 'late-stop-fixture', idempotencyKey: 'buyer-stop-1' }, later).state;
  assert.equal(state.suppressions.some(item => item.phone === '+19515550101' && item.email === 'buyer@example.test'), true);
  state = run(state, { type: 'save_buyer', ...buyer, id: undefined, name: 'Recreated buyer', active: true }, later).state;
  const matches = run(state, { type: 'match_buyers', contractId: state.contracts[0].id }, later).result as Array<{buyerId: string}>;
  assert.equal(matches.length, 0);
});
test('historical call caps remain attached to the called phone after a parcel is reimported', () => {
  let state = batch(ready(), 'call'); const batchId = state.batches[0].id, leadId = state.leads[0].id;
  state = run(state, { type: 'export_batch', batchId }).state;
  state = run(state, { type: 'record_receipt', batchId, leadId, occurredAt: now, outcome: 'no_answer', reference: 'old-phone-call', idempotencyKey: 'old-phone-call', cost: 0 }).state;
  for (const change of [csv.replace('9515550100', '9515550109'), csv.replace('001-002', '001-003')]) {
    const nextInput = { ...input, csv: change };
    const preview = run(state, { type: 'preview_import', ...nextInput }).result as ImportPreview;
    state = run(state, { type: 'import_leads', ...nextInput, previewHash: preview.previewHash }).state;
  }
  const second = state.leads[1];
  state = run(state, { type: 'record_contact', leadId: second.id, phone: second.phone, dncStatus: 'clear', litigatorStatus: 'clear', scrubbedAt: now, recipientTimezone: 'America/Los_Angeles', timezoneEvidence: 'fixture-local', evidenceReference: 'fixture-scrub' }).state;
  assert.equal(eligibility(state, state.leads[1], 'call', now).some(reason => /daily/.test(reason)), true);
});
test('a wrong-number outcome requires fresh contact evidence before further calling', () => {
  let state = batch(ready(), 'call'); const batchId = state.batches[0].id, leadId = state.leads[0].id;
  state = run(state, { type: 'export_batch', batchId }).state;
  state = run(state, { type: 'record_receipt', batchId, leadId, occurredAt: now, outcome: 'wrong_number', reference: 'wrong-number-call', idempotencyKey: 'wrong-number-call', cost: 0 }).state;
  assert.equal(state.leads[0].contact, null);
  assert.equal(eligibility(state, state.leads[0], 'call', '2026-10-29T16:00:00Z').some(reason => /scrub/.test(reason)), true);
});
test('documented closing extensions retain history and invalidate prior packet approval', () => {
  let state = buyerPacket(); const contractId = state.contracts[0].id;
  state = run(state, { type: 'extend_contract', contractId, newClosingDate: '2026-11-20', signedAt: now, reference: 'extension-fixture' }).state;
  assert.equal(state.contracts[0].amendments[0].reference, 'extension-fixture');
  assert.throws(() => run(state, { type: 'export_packet', packetId: state.packets[0].id }), /snapshot/i);
  state = run(state, { type: 'cancel_contract', contractId, endedAt: now, reference: 'cancellation-fixture', reason: 'Seller and buyer executed cancellation' }).state;
  assert.throws(() => run(state, { type: 'match_buyers', contractId }), /cancelled/);
});
test('inbound replies count conversations without counting another outbound touch', () => {
  let state = contracted();
  const later = { ...ctx, now: '2026-11-01T16:00:00Z' };
  state = run(state, { type: 'record_response', leadId: state.leads[0].id, occurredAt: later.now, outcome: 'conversation', reference: 'mail-reply-fixture', notes: 'Actual inbound reply' }, later).state;
  assert.equal(summarize(state, later.now).progress.conversations, 1);
  assert.equal(summarize(state, later.now).progress.leads, 1);
});
test('buyer activity score uses observed purchases, not merely preferred farm ZIPs', () => {
  const buyer = buyerPacket().buyers[0];
  assert.equal(buyerActivityScore(buyer, now), 0);
  assert.equal(buyerActivityScore({ ...buyer, lastCashPurchaseDate: '2026-09-01', cashPurchases24m: 3, purchasedFarmZip: true, entity: true }, now), 9);
});
test('operating and setup expenses affect cost KPIs without inventing launch or double-entering a reference', () => {
  let state = run(initialState(), { type: 'record_expense', category: 'Attorney', amount: 400, occurredAt: '2026-10-27T16:00:00Z', reference: 'invoice-fixture-1', synthetic: false }).state;
  assert.equal(summarize(state, now).launchedAt, null);
  assert.equal(summarize(state, now).progress.spend, 400);
  assert.equal(summarize(state, now).costPer.contract, null);
  assert.throws(() => run(state, { type: 'record_expense', category: 'Attorney', amount: 400, occurredAt: '2026-10-27T16:00:00Z', reference: 'invoice-fixture-1', synthetic: false }), /already recorded/);
  const full = contracted(); full.expenses = state.expenses;
  assert.equal(summarize(full, now).costPer.contract, 400.57);
  assert.equal(summarize(full, now).costPer.offer, 400.57);
});
test('rescoring only refreshes local scores and leaves contact evidence and launch untouched', () => {
  const original = ready(); original.leads[0].score = 0;
  const result = run(original, { type: 'rescore' });
  assert.equal(result.state.leads[0].score, 12);
  assert.equal(result.state.leads[0].contact?.evidenceReference, 'fixture-scrub');
  assert.deepEqual(result.result, { rescored: 1, changed: 1, imported: 0, source: 'Existing workspace records only' });
  assert.equal(summarize(result.state, now).launchedAt, null);
});
test('practice mode rejects actual destinations and exports non-deliverable mail and call destinations', () => {
  const synthetic = { ...input, synthetic: true };
  for (const badCsv of [csv.replace('9515550100', '9512221234'), csv.replace('Test Owner', 'Actual Person'), csv.replace('123 Fictional Ave', '123 Actual Ave')]) {
    assert.throws(() => run(initialState(), { type: 'preview_import', ...synthetic, csv: badCsv }), /Practice/);
  }
  let state = initialState();
  const preview = run(state, { type: 'preview_import', ...synthetic }).result as ImportPreview;
  state = run(state, { type: 'import_leads', ...synthetic, previewHash: preview.previewHash }).state;
  state = run(state, { type: 'record_contact', leadId: state.leads[0].id, phone: '9515550100', dncStatus: 'clear', litigatorStatus: 'clear', scrubbedAt: now, recipientTimezone: 'America/Los_Angeles', timezoneEvidence: 'practice', evidenceReference: 'practice' }).state;
  for (const channel of ['mail', 'call'] as const) {
    const prepared = batch(state, channel);
    const output = run(prepared, { type: 'export_batch', batchId: prepared.batches[0].id }).result as {content: string};
    assert.match(output.content, /PRACTICE ONLY — NO DELIVERY/);
    assert.doesNotMatch(output.content, /19515550100/);
    assert.doesNotMatch(output.content, /123 Fictional Ave, Riverside CA 92501/);
  }
});
test('practice buyer data cannot carry nonreserved email or escape a masked assignment packet', () => {
  let state = buyerPacket(); const buyer = state.buyers[0];
  const { updatedAt: _updatedAt, ...buyerInput } = buyer;
  assert.throws(() => run(state, { type: 'save_buyer', ...buyerInput, id: undefined, synthetic: true, email: 'person@actual-business.com' }), /Practice emails/);
  // Derive a separate fictional workspace fixture, with no real gates and no real target progress.
  state.leads[0].synthetic = true; state.contracts[0].synthetic = true; state.buyers[0].synthetic = true; state.packets = [];
  state = run(state, { type: 'draft_packet', contractId: state.contracts[0].id, buyerIds: [buyer.id], body: 'This fictional exercise offers a contractual interest for assignment only; do not contact anybody.' }).state;
  state = run(state, { type: 'approve_packet', packetId: state.packets[0].id, evidence: 'fictional-review' }).state;
  const output = run(state, { type: 'export_packet', packetId: state.packets[0].id }).result as {content: string};
  assert.match(output.content, /PRACTICE ONLY — NO DELIVERY/);
  assert.doesNotMatch(output.content, /buyer@example.test|19515550101/);
});
test('winter contract expiration follows Los Angeles calendar midnight, not a fixed summer offset', () => {
  const state = buyerPacket(), contractId = state.contracts[0].id;
  const beforeLocalMidnight = { ...ctx, now: '2026-11-16T07:30:00Z' };
  assert.equal((run(state, { type: 'match_buyers', contractId }, beforeLocalMidnight).result as unknown[]).length, 1);
  assert.throws(() => run(state, { type: 'match_buyers', contractId }, { ...ctx, now: '2026-11-16T08:00:00Z' }), /closing date has passed/);
});
test('a documented cancellation allows a later new contract without erasing signed history', () => {
  let state = contracted(); const leadId = state.leads[0].id;
  state = run(state, { type: 'cancel_contract', contractId: state.contracts[0].id, endedAt: now, reference: 'mutual-cancellation', reason: 'Terms renegotiated' }).state;
  state = run(state, { type: 'record_contract', leadId, offerId: state.offers[0].id, price: 265000, signedAt: now, reference: 'new-executed-contract', assignable: true, disclosuresReference: 'new-disclosures', closingDate: '2026-11-18' }).state;
  assert.equal(state.contracts.length, 2);
  assert.equal(state.contracts[0].termination?.reference, 'mutual-cancellation');
  assert.equal(state.contracts[1].termination, null);
});
