import { eligibility, FARM_ZIPS, GENERAL_GATES, gateGood, localParts, suppressed, callHours } from './policy';
export { eligibility, FARM_ZIPS, GENERAL_GATES } from './policy';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { profitScenarioCommandSchema, buyerActivityCommandSchema } from '../operations/schemas';
import { buildBuyerPipeline, buyerFollowUpBlockers } from '../operations/buyers';
import type { BuyerActivity } from '../operations/types';
import { csvDownload, parseCsv } from './csv';
import type { AcquisitionState, Batch, BatchItem, Buyer, BuyerMatch, Channel, Command, Context, Contract, Download, GateName, ImportInput, ImportPreview, Lead, Packet, Signals, Summary } from './types';

export class DomainError extends Error {
  constructor(message: string, public readonly status = 400) { super(message); this.name = 'DomainError'; }
}
const text = z.string().trim().min(1).max(2_000);
const optionalText = z.string().trim().max(2_000);
const id = z.string().uuid();
const amount = z.number().finite().nonnegative().max(100_000_000);
const time = z.iso.datetime({ offset: true });
const date = z.iso.date();
const channel = z.enum(['mail', 'call']);
const uniqueIds = (maximum: number) => z.array(id).min(1).max(maximum).refine(values => new Set(values).size === values.length, 'Duplicate recipient ID.');
const importShape = { csv: z.string().min(1).max(1_800_000), source: text, sourceDate: date, permissionReference: text, synthetic: z.boolean().default(false) };
const contactShape = { phone: text, dncStatus: z.enum(['unknown', 'clear', 'blocked']), litigatorStatus: z.enum(['unknown', 'clear', 'blocked']), scrubbedAt: time, recipientTimezone: optionalText, timezoneEvidence: optionalText, evidenceReference: text };
export const commandSchema = z.discriminatedUnion('type', [
  profitScenarioCommandSchema,
  buyerActivityCommandSchema,
  z.strictObject({ type: z.literal('rescore') }),
  z.strictObject({ type: z.literal('record_expense'), category: z.string().trim().min(1).max(100), amount: amount.positive(), occurredAt: time, reference: text, synthetic: z.boolean() }),
  z.strictObject({ type: z.literal('preview_import'), ...importShape }),
  z.strictObject({ type: z.literal('import_leads'), ...importShape, previewHash: z.string().regex(/^[a-f0-9]{64}$/) }),
  z.strictObject({ type: z.literal('set_gate'), gate: z.enum(['counsel', 'channel_policy', 'data_provenance', 'suppression_ops', 'title_escrow', 'technical', 'launch_authorization', 'nod_counsel']), status: z.enum(['approved', 'blocked']), evidence: text, reviewedAt: time, expiresAt: time.nullable().optional() }),
  z.strictObject({ type: z.literal('record_contact'), leadId: id, ...contactShape }),
  z.strictObject({ type: z.literal('suppress'), leadId: id, reason: text }),
  z.strictObject({ type: z.literal('save_template'), channel, name: z.string().trim().min(1).max(100), body: z.string().trim().min(20).max(8_000) }),
  z.strictObject({ type: z.literal('review_template'), templateId: id, approved: z.boolean(), evidence: text }),
  z.strictObject({ type: z.literal('draft_batch'), channel, leadIds: uniqueIds(500), templateId: id }),
  z.strictObject({ type: z.literal('approve_batch'), batchId: id, evidence: text }),
  z.strictObject({ type: z.literal('revoke_batch'), batchId: id, reason: text }),
  z.strictObject({ type: z.literal('export_batch'), batchId: id }),
  z.strictObject({ type: z.literal('record_receipt'), batchId: id, leadId: id, occurredAt: time, outcome: z.enum(['mailed', 'no_answer', 'conversation', 'appointment', 'not_interested', 'wrong_number', 'opt_out']), reference: text, idempotencyKey: z.string().trim().min(1).max(100), cost: amount, notes: optionalText.optional().default('') }),
  z.strictObject({ type: z.literal('record_response'), leadId: id, occurredAt: time, outcome: z.enum(['conversation', 'appointment', 'not_interested', 'wrong_number', 'opt_out']), reference: text, notes: optionalText }),
  z.strictObject({ type: z.literal('qualify_lead'), leadId: id, condition: text, timeline: text, priceExpectation: amount.nullable(), mortgageBalance: amount.nullable(), notes: optionalText }),
  z.strictObject({ type: z.literal('underwrite'), leadId: id, arv: amount.positive(), repairs: amount, closingCosts: amount, assignmentFee: amount, profitPercent: z.number().finite().min(0.1).max(0.5), compReferences: z.array(text).min(3).max(20).refine(values => new Set(values).size === values.length, 'Use at least three distinct sold comparable references.') }),
  z.strictObject({ type: z.literal('record_offer'), leadId: id, amount: amount.positive(), occurredAt: time, reference: text }),
  z.strictObject({ type: z.literal('record_contract'), leadId: id, offerId: id, price: amount.positive(), signedAt: time, reference: text, assignable: z.boolean(), disclosuresReference: text, closingDate: date }),
  z.strictObject({ type: z.literal('extend_contract'), contractId: id, newClosingDate: date, signedAt: time, reference: text }),
  z.strictObject({ type: z.literal('cancel_contract'), contractId: id, endedAt: time, reference: text, reason: text }),
  z.strictObject({ type: z.literal('save_buyer'), id: id.optional(), name: text, email: z.union([z.email(), z.literal('')]), phone: optionalText, zips: z.array(z.string().regex(/^\d{5}$/)).min(1).max(100), minPrice: amount, maxPrice: amount.positive(), propertyTypes: z.array(z.string().trim().min(1).max(50)).min(1).max(20), rehabMax: amount.nullable(), permissionReference: text, permissionAt: time, sourceReference: text, synthetic: z.boolean(), active: z.boolean(), cashPurchases24m: z.number().int().nonnegative().max(100_000).nullable().optional(), lastCashPurchaseDate: date.nullable().optional(), entity: z.boolean().nullable().optional(), purchasedFarmZip: z.boolean().nullable().optional() }),
  z.strictObject({ type: z.literal('match_buyers'), contractId: id }),
  z.strictObject({ type: z.literal('draft_packet'), contractId: id, buyerIds: uniqueIds(10), body: z.string().trim().min(30).max(8_000) }),
  z.strictObject({ type: z.literal('approve_packet'), packetId: id, evidence: text }),
  z.strictObject({ type: z.literal('revoke_packet'), packetId: id, reason: text }),
  z.strictObject({ type: z.literal('export_packet'), packetId: id }),
  z.strictObject({ type: z.literal('record_buyer_receipt'), packetId: id, buyerId: id, occurredAt: time, outcome: z.enum(['delivered', 'interested', 'declined', 'opt_out']), reference: text, idempotencyKey: z.string().trim().min(1).max(100) }),
  z.strictObject({ type: z.literal('record_assignment'), contractId: id, buyerId: id, signedAt: time, reference: text, price: amount.positive(), disclosuresReference: text, depositAmount: amount, depositReference: optionalText }),
  z.strictObject({ type: z.literal('record_close'), contractId: id, closedAt: time, assignmentFee: amount, expenses: amount, reference: text }),
]);

export function initialState(): AcquisitionState {
  return { schemaVersion: 1, leads: [], gates: [], suppressions: [], templates: [], batches: [], receipts: [], responses: [], offers: [], contracts: [], buyers: [], packets: [], buyerReceipts: [], assignments: [], closings: [], expenses: [], audit: [] };
}
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const ms = (value: string) => new Date(value).getTime();
const DAY = 86_400_000;
function fail(message: string): never { throw new DomainError(message); }
function actual(value: string, now: string, label: string) {
  if (!Number.isFinite(ms(value)) || ms(value) > ms(now)) fail(`${label} cannot be in the future.`);
}
function reviewer(context: Context) { if (!['reviewer', 'admin'].includes(context.role)) throw new DomainError('Reviewer permission is required for this approval.', 403); }
function find<T extends { id: string }>(items: T[], key: string, label: string): T { return items.find(item => item.id === key) ?? fail(`${label} was not found in this workspace.`); }
function requireGates(state: AcquisitionState, now: string, names = GENERAL_GATES) {
  for (const name of names) if (!gateGood(state, name, now)) fail(`The ${name} gate needs current approved evidence.`);
}
function phone(value: string) {
  if (!value.trim()) return '';
  const digits = value.replace(/[\s()+.\-]/g, '');
  if (/^1\d{10}$/.test(digits)) return `+${digits}`;
  if (/^\d{10}$/.test(digits)) return `+1${digits}`;
  return fail('Phone must be one complete US number; do not combine multiple numbers.');
}
const normalized = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();
function practiceContact(name: string, selectedPhone: string, email: string, addresses: string[] = []) {
  const marker = /\b(?:fictional|example|test|practice|demo)\b/i;
  if (!marker.test(name) || addresses.some(address => address && !marker.test(address))) fail('Practice records need visibly Fictional, Example, Test, Practice or Demo names and addresses.');
  if (selectedPhone && !/^\+1[2-9]\d{2}55501\d{2}$/.test(selectedPhone)) fail('Practice phones must use the reserved US 555-0100 through 555-0199 range.');
  const domain = email.split('@')[1]?.toLowerCase();
  if (email && !domain?.endsWith('.test') && !domain?.endsWith('.invalid') && !['example.com', 'example.net', 'example.org'].some(reserved => domain === reserved || domain?.endsWith(`.${reserved}`))) fail('Practice emails must use a reserved .test/.invalid or example.com/.net/.org domain.');
}
const parcelKey = (county: string, apn: string) => `${county.toLowerCase()}:${apn.replace(/[^a-z0-9]/gi, '').toLowerCase()}`;
function countyName(raw: string) {
  const value = normalized(raw).replace(/ county$/, '');
  if (value === 'riverside') return 'Riverside';
  if (value === 'san bernardino') return 'San Bernardino';
  return fail('County must be Riverside or San Bernardino for this pilot.');
}
function numeric(raw: string | undefined, label: string, max = 100_000_000): number | null {
  if (!raw?.trim()) return null;
  const clean = raw.replace(/[$,%]/g, '');
  if (!/^\d+(\.\d+)?$/.test(clean)) fail(`${label} must be a nonnegative number or blank for unknown.`);
  const value = Number(clean);
  if (!Number.isFinite(value) || value > max) fail(`${label} is outside the supported range.`);
  return value;
}
function flag(raw: string | undefined, label: string): boolean | null {
  if (!raw?.trim()) return null;
  if (['true', 'yes', '1'].includes(raw.toLowerCase())) return true;
  if (['false', 'no', '0'].includes(raw.toLowerCase())) return false;
  return fail(`${label} must be true/false, yes/no, 1/0 or blank for unknown.`);
}
export function scoreSignals(signals: Signals) {
  const breakdown: Record<string, number> = {};
  if ((signals.tax_delinquent_years ?? 0) >= 2) breakdown.tax_delinquent = 3;
  if (signals.nod) breakdown.nod = 4;
  if (signals.vacant) breakdown.vacant = 3;
  if (signals.absentee) breakdown.absentee = 2;
  if ((signals.equity_pct ?? 0) >= 50) breakdown.equity_50 = 2;
  if ((signals.equity_pct ?? 0) >= 70) breakdown.equity_70_bonus = 1;
  if ((signals.years_owned ?? 0) >= 10) breakdown.ownership_10 = 1;
  if (signals.inherited) breakdown.inherited = 2;
  if (signals.code_violations) breakdown.code_violations = 2;
  return { score: Object.values(breakdown).reduce((total, points) => total + points, 0), breakdown };
}
export function parseImport(state: AcquisitionState, input: ImportInput, now: string): { leads: Lead[]; preview: ImportPreview } {
  actual(input.sourceDate, now, 'Source date');
  if (!input.synthetic) requireGates(state, now, ['data_provenance']);
  let rows: Record<string, string>[];
  try { rows = parseCsv(input.csv); } catch (error) { fail(error instanceof Error ? error.message : 'Invalid CSV.'); }
  const previewHash = digest({ csv: input.csv, source: input.source, sourceDate: input.sourceDate, permissionReference: input.permissionReference, synthetic: !!input.synthetic });
  const seen = new Set<string>();
  let newCount = 0, updatedCount = 0;
  const leads = rows.map((row, index): Lead => {
    const county = countyName(row.county);
    if (!/^[a-z0-9\- .]{1,80}$/i.test(row.apn) || !/[a-z0-9]/i.test(row.apn)) fail(`Row ${index + 2}: invalid APN.`);
    const key = parcelKey(county, row.apn);
    if (seen.has(key)) fail(`Duplicate county/APN in CSV row ${index + 2}. Resolve conflicting source rows before importing.`);
    seen.add(key);
    const existing = state.leads.find(item => parcelKey(item.county, item.apn) === key);
    if (existing && existing.synthetic !== !!input.synthetic) fail('Synthetic and real records cannot overwrite each other; use a separate workspace or distinct fictional APNs.');
    if (existing) updatedCount++; else newCount++;
    const signals: Signals = { tax_delinquent_years: numeric(row.tax_delinquent_years, 'Tax delinquent years', 100), nod: flag(row.nod, 'NOD'), vacant: flag(row.vacant, 'Vacant'), absentee: flag(row.absentee, 'Absentee'), equity_pct: numeric(row.equity_pct, 'Equity percent', 100), years_owned: numeric(row.years_owned, 'Years owned', 200), inherited: flag(row.inherited, 'Inherited'), code_violations: flag(row.code_violations, 'Code violations') };
    const zip = row.zip ?? '';
    if (zip && !/^\d{5}$/.test(zip)) fail(`Row ${index + 2}: ZIP must be five digits.`);
    const email = row.email ?? '';
    if (email && !z.email().safeParse(email).success) fail(`Row ${index + 2}: invalid email.`);
    const selectedPhone = phone(row.phone ?? '');
    if (input.synthetic) practiceContact(row.owner_name, selectedPhone, email, [row.address, row.mailing_address ?? '']);
    const sameOwner = existing && normalized(existing.ownerName) === normalized(row.owner_name) && existing.phone === selectedPhone && normalized(existing.mailingAddress) === normalized(row.mailing_address ?? '');
    if (existing && !sameOwner && state.contracts.some(contract => contract.leadId === existing.id)) fail('This parcel has a recorded contract. Resolve the ownership change with the operator before replacing its source record.');
    const extra = ['beds', 'baths', 'sqft', 'year_built', 'last_sale_date', 'last_sale_price'].filter(key => row[key]).map(key => `${key}: ${row[key]}`).join('; ');
    return { ...(existing?.automationSourceId ? {automationSourceId:existing.automationSourceId} : {}), id: existing?.id ?? randomUUID(), county, apn: row.apn, address: row.address, city: row.city ?? '', zip, ownerName: row.owner_name, mailingAddress: row.mailing_address ?? '', phone: selectedPhone, email, propertyType: (row.property_type ?? '').trim().toUpperCase(), estimatedValue: numeric(row.estimated_value, 'Estimated value'), signals, ...scoreSignals(signals), source: input.source, sourceDate: input.sourceDate, permissionReference: input.permissionReference, importHash: previewHash, synthetic: !!input.synthetic, importedAt: existing?.importedAt ?? now, updatedAt: now, notes: [row.notes ?? '', extra].filter(Boolean).join('\n'), contact: sameOwner ? existing.contact : null, qualification: sameOwner ? existing.qualification : null, underwriting: sameOwner ? existing.underwriting : null };
  });
  if (state.leads.length + newCount > 5_000) fail('Workspace exceeds the 5,000-lead pilot limit.');
  return { leads, preview: { previewHash, count: leads.length, newCount, updatedCount, eligibleScoreCount: leads.filter(item => item.score >= 8).length, synthetic: !!input.synthetic, rows: leads.map(lead => ({ county: lead.county, apn: lead.apn, ownerName: lead.ownerName, address: lead.address, score: lead.score, unknownSignals: Object.entries(lead.signals).filter(([, value]) => value === null).map(([key]) => key), warnings: [!FARM_ZIPS.includes(lead.zip) ? 'Outside starter farm' : '', lead.signals.nod ? 'NOD specialist evidence required' : '', !lead.mailingAddress ? 'Owner mailing address missing' : '', !lead.phone ? 'No phone selected for scrub' : '', lead.signals.inherited ? 'Inherited/property authority review needed' : ''].filter(Boolean) })) } };
}
function render(body: string, lead: Lead) {
  const values: Record<string, string> = { owner_name: lead.ownerName, address: lead.address, zip: lead.zip };
  return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => values[key] ?? fail(`Unsupported template field: ${key}.`));
}
function gateSnapshot(state: AcquisitionState, leads: Lead[]) {
  const names = [...GENERAL_GATES, ...(leads.some(lead => lead.signals.nod) ? ['nod_counsel' as const] : [])];
  return names.map(name => state.gates.find(item => item.name === name) ?? null);
}
function batchSnapshot(state: AcquisitionState, batch: Pick<Batch, 'templateId' | 'items'>) {
  const template = find(state.templates, batch.templateId, 'Template');
  const leads = batch.items.map(item => find(state.leads, item.leadId, 'Lead'));
  return digest({ template, items: batch.items, leads: leads.map(lead => digest(lead)), gates: gateSnapshot(state, leads) });
}
function validateBatch(state: AcquisitionState, batch: Batch, now: string, hours = true) {
  if (batch.status === 'revoked') fail('Batch approval has been revoked.');
  const template = find(state.templates, batch.templateId, 'Template');
  if (template.status !== 'approved') fail('Template is no longer approved.');
  for (const item of batch.items) {
    const lead = find(state.leads, item.leadId, 'Lead');
    const reasons = eligibility(state, lead, batch.channel, now, hours);
    if (reasons.length) fail(`${lead.ownerName}: ${reasons.join(' ')}`);
    if (item.fingerprint !== digest(lead)) fail('Lead/contact evidence changed after batch review. Create and approve a new batch.');
  }
  if (batchSnapshot(state, batch) !== batch.snapshotHash) fail('Batch snapshot changed: review a new batch after any gate, template or recipient change.');
}
function requireApproval(batch: Pick<Batch, 'status' | 'approvedAt' | 'expiresAt'>, at: string) {
  if (batch.status !== 'approved' || !batch.approvedAt || !batch.expiresAt) fail('A current batch/packet approval is required.');
  if (ms(at) < ms(batch.approvedAt)) fail('Action timestamp is before approval.');
  if (ms(at) >= ms(batch.expiresAt)) fail('Approval expired after 24 hours. Create and review a new batch/packet.');
}
function mustHaveExport(record: { exportedAt: string[]; approvedAt: string | null; expiresAt: string | null }, at: string) {
  if (!record.exportedAt.some(value => ms(value) <= ms(at))) fail('Record actual activity only after exporting the reviewed batch/packet.');
  if (!record.approvedAt || !record.expiresAt || ms(at) < ms(record.approvedAt) || ms(at) >= ms(record.expiresAt)) fail('Actual activity must fall within the reviewed export approval period.');
}
function addSuppression(state: AcquisitionState, lead: Pick<Lead, 'id' | 'phone' | 'email' | 'ownerName' | 'mailingAddress'>, reason: string, context: Context) {
  if (!state.suppressions.some(item => item.leadId === lead.id && item.phone === lead.phone)) state.suppressions.push({ id: randomUUID(), leadId: lead.id, phone: lead.phone, email: lead.email, ownerName: lead.ownerName, mailingAddress: lead.mailingAddress, reason, createdAt: context.now, actorId: context.actorId });
}
function contractReady(state: AcquisitionState, contract: Contract, now: string) {
  const lead = find(state.leads, contract.leadId, 'Lead');
  if (!contract.synthetic) requireGates(state, now);
  if (lead.signals.nod && !contract.synthetic) requireGates(state, now, ['nod_counsel']);
  if (contract.termination) fail('This contract has been cancelled.');
  if (contract.closingDate < localParts(now).day) fail('Contract closing date has passed. Record a documented extension before preparing a packet.');
  if (state.assignments.some(item => item.contractId === contract.id) || state.closings.some(item => item.contractId === contract.id)) fail('This contract is already assigned or closed.');
  return lead;
}
function buyerAllowed(state: AcquisitionState, buyer: Buyer, contract: Contract) {
  if (!buyer.active || !buyer.permissionReference || buyer.synthetic !== contract.synthetic) return false;
  return !state.buyerReceipts.some(item => item.buyerId === buyer.id && item.outcome === 'opt_out') && !state.suppressions.some(item => (!!item.phone && item.phone === buyer.phone) || (!!item.email && item.email.toLowerCase() === buyer.email.toLowerCase()));
}
export function buyerActivityScore(buyer: Buyer, now: string) {
  const cutoff = new Date(now); cutoff.setUTCMonth(cutoff.getUTCMonth() - 6);
  return (buyer.lastCashPurchaseDate && ms(buyer.lastCashPurchaseDate) >= cutoff.getTime() && ms(buyer.lastCashPurchaseDate) <= ms(now) ? 3 : 0) + ((buyer.cashPurchases24m ?? 0) >= 3 ? 3 : 0) + (buyer.purchasedFarmZip ? 2 : 0) + (buyer.entity ? 1 : 0);
}
export function matchBuyers(state: AcquisitionState, contract: Contract, now: string): BuyerMatch[] {
  const lead = contractReady(state, contract, now);
  const ask = contract.price + (lead.underwriting?.assignmentFee ?? 0);
  return state.buyers.filter(buyer => buyerAllowed(state, buyer, contract) && ms(buyer.permissionAt) <= ms(now) && buyer.zips.includes(lead.zip) && buyer.minPrice <= ask && buyer.maxPrice >= ask && buyer.propertyTypes.map(value => value.toUpperCase()).includes(lead.propertyType) && (buyer.rehabMax === null || buyer.rehabMax >= (lead.underwriting?.repairs ?? 0))).map(buyer => ({ buyerId: buyer.id, name: buyer.name, score: 9 + (buyer.rehabMax !== null ? 1 : 0), activityScore: buyerActivityScore(buyer, now), reasons: ['Target ZIP matches', 'Asking price fits buy box', 'Property type matches', ...(buyer.rehabMax !== null ? ['Rehab budget fits'] : [])] })).sort((a, b) => b.score - a.score || b.activityScore - a.activityScore || a.name.localeCompare(b.name)).slice(0, 10);
}
function packetSnapshot(state: AcquisitionState, packet: Pick<Packet, 'contractId' | 'buyerIds' | 'body'>) {
  const contract = find(state.contracts, packet.contractId, 'Contract');
  const lead = find(state.leads, contract.leadId, 'Lead');
  return digest({ contract, lead, buyers: packet.buyerIds.map(key => find(state.buyers, key, 'Buyer')), body: packet.body, gates: gateSnapshot(state, [lead]) });
}
function validatePacket(state: AcquisitionState, packet: Packet, now: string) {
  if (packet.status === 'revoked') fail('Packet approval is revoked.');
  const contract = find(state.contracts, packet.contractId, 'Contract');
  contractReady(state, contract, now);
  const matches = matchBuyers(state, contract, now);
  for (const buyerId of packet.buyerIds) if (!matches.some(match => match.buyerId === buyerId)) fail('Buyer permission or buy-box fit changed. Prepare a new packet.');
  if (packetSnapshot(state, packet) !== packet.snapshotHash) fail('Contract, buyer, gate or packet snapshot changed. Prepare a new packet.');
}

export function execute(original: AcquisitionState, input: unknown, context: Context): { state: AcquisitionState; result?: unknown } {
  if (original.schemaVersion !== 1) fail('Unsupported Acquisition state version.');
  if (!context.actorId.trim() || !['operator', 'reviewer', 'admin'].includes(context.role) || !time.safeParse(context.now).success) throw new DomainError('Authenticated workspace context is required.', 403);
  const parsed = commandSchema.safeParse(input);
  if (!parsed.success) fail(`Check the form fields: ${parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).slice(0, 4).join('; ')}`);
  const command = parsed.data as Command;
  const state = structuredClone(original);
  const now = context.now;
  let result: unknown;
  switch (command.type) {
    case 'save_profit_scenario': {
      find(state.leads, command.leadId, 'Lead');
      const scenarios = state.profitScenarios ??= [];
      const previous = scenarios.findIndex(item => item.leadId === command.leadId && item.name === command.name);
      if (previous < 0 && scenarios.length >= 15_000) fail('The workspace scenario capacity has been reached.');
      const record = { id: previous < 0 ? randomUUID() : scenarios[previous].id, leadId: command.leadId, name: command.name, inputs: command.inputs, assumptions: command.assumptions, recordedAt: now, actorId: context.actorId };
      if (previous < 0) scenarios.push(record); else scenarios[previous] = record;
      result = record; break;
    }
    case 'record_buyer_activity': {
      const activities = state.buyerActivities ??= [];
      const previous = activities.find(item => item.idempotencyKey === command.idempotencyKey);
      if (previous) {
        const keys = ['contractId','buyerId','kind','occurredAt','dueAt','amount','reference','notes','completesTaskId','withdrawsOfferId'] as const;
        if (keys.some(key => previous[key] !== command[key])) fail('Idempotency key is already used for different buyer activity.');
        return { state: original, result: previous };
      }
      const contract = find(state.contracts, command.contractId, 'Contract');
      const buyer = find(state.buyers, command.buyerId, 'Buyer');
      if (contract.synthetic !== buyer.synthetic) fail('Buyer and contract must use the same real or practice record class.');
      const eventAt = command.occurredAt ?? now;
      if (ms(eventAt) < ms(contract.signedAt)) fail('Buyer activity cannot precede the signed contract.');
      const reviewedRelationship = state.packets.some(packet => packet.contractId === contract.id && packet.buyerIds.includes(buyer.id) && packet.approvedAt && ms(packet.approvedAt) <= ms(eventAt));
      const assignedRelationship = state.assignments.some(item => item.contractId === contract.id && item.buyerId === buyer.id && ms(item.signedAt) <= ms(eventAt));
      if (!reviewedRelationship && !assignedRelationship) fail('Review a buyer packet for this contract before tracking this buyer relationship.');
      const pipeline = buildBuyerPipeline(state, now, contract.synthetic).find(item => item.contractId === contract.id && item.buyerId === buyer.id);
      if (command.kind === 'follow_up_planned') {
        const reasons = buyerFollowUpBlockers(state, contract, buyer, now);
        if (pipeline?.stage === 'declined') reasons.push('Buyer declined this deal. Record a new permitted response before planning contact.');
        if (reasons.length) fail(reasons.join(' '));
        if (ms(command.dueAt!) < ms(now)) fail('A new follow-up plan cannot be due in the past.');
        if (localParts(command.dueAt!).day > contract.closingDate) fail('Plan the buyer follow-up no later than the contract closing date.');
      } else {
        actual(command.occurredAt!, now, 'Buyer activity date');
      }
      if (command.completesTaskId) {
        const task = find(activities, command.completesTaskId, 'Planned follow-up');
        if (task.kind !== 'follow_up_planned' || task.contractId !== contract.id || task.buyerId !== buyer.id || pipeline?.plannedTaskId !== task.id) fail('Only this buyer relationship\'s current open task can be completed.');
        if (ms(command.occurredAt!) < ms(task.recordedAt)) fail('Actual follow-up cannot precede the planned task.');
      }
      if (command.withdrawsOfferId) {
        const offer = find(activities, command.withdrawsOfferId, 'Buyer offer');
        if (offer.kind !== 'offer_received' || offer.contractId !== contract.id || offer.buyerId !== buyer.id || pipeline?.latestOffer?.activityId !== offer.id) fail('Only this buyer relationship\'s current offer can be withdrawn.');
        if (ms(command.occurredAt!) < ms(offer.occurredAt!)) fail('Withdrawal cannot precede the offer.');
      }
      if (activities.length >= 20_000) fail('The workspace buyer activity capacity has been reached.');
      const { type: _type, ...fields } = command;
      const record: BuyerActivity = { ...fields, id: randomUUID(), synthetic: contract.synthetic, recordedAt: now, actorId: context.actorId };
      activities.push(record); result = record; break;
    }
    case 'rescore': {
      let changed = 0;
      for (const lead of state.leads) { const scored = scoreSignals(lead.signals); if (scored.score !== lead.score || digest(scored.breakdown) !== digest(lead.breakdown)) { Object.assign(lead, scored, { updatedAt: now }); changed++; } }
      result = { rescored: state.leads.length, changed, imported: 0, source: 'Existing workspace records only' }; break;
    }
    case 'record_expense': {
      actual(command.occurredAt, now, 'Expense date');
      if (state.expenses.some(item => item.category === command.category && item.reference === command.reference)) fail('This category and expense reference is already recorded.');
      state.expenses.push({ id: randomUUID(), category: command.category, amount: command.amount, occurredAt: command.occurredAt, reference: command.reference, synthetic: command.synthetic, recordedAt: now }); result = state.expenses.at(-1); break;
    }
    case 'preview_import': return { state: original, result: parseImport(state, command, now).preview };
    case 'import_leads': {
      const imported = parseImport(state, command, now);
      if (imported.preview.previewHash !== command.previewHash) fail('CSV or source details changed since preview. Preview the file again.');
      for (const lead of imported.leads) { const index = state.leads.findIndex(item => item.id === lead.id); if (index === -1) state.leads.push(lead); else state.leads[index] = lead; }
      result = imported.preview;
      break;
    }
    case 'set_gate': {
      reviewer(context); actual(command.reviewedAt, now, 'Evidence review date');
      if (command.expiresAt && ms(command.expiresAt) <= ms(now)) fail('Evidence expiration must be in the future.');
      const gate = { name: command.gate, status: command.status, evidence: command.evidence, reviewedAt: command.reviewedAt, recordedAt: now, reviewerId: context.actorId, expiresAt: command.expiresAt ?? null, revision: randomUUID() };
      const index = state.gates.findIndex(item => item.name === command.gate); if (index === -1) state.gates.push(gate); else state.gates[index] = gate;
      break;
    }
    case 'record_contact': {
      const lead = find(state.leads, command.leadId, 'Lead');
      actual(command.scrubbedAt, now, 'Scrub date');
      const selectedPhone = phone(command.phone);
      if (!selectedPhone || selectedPhone !== lead.phone) fail('Scrub evidence must match the selected phone imported for this owner.');
      lead.contact = { phone: selectedPhone, dncStatus: command.dncStatus, litigatorStatus: command.litigatorStatus, scrubbedAt: command.scrubbedAt, recipientTimezone: command.recipientTimezone, timezoneEvidence: command.timezoneEvidence, evidenceReference: command.evidenceReference, recordedAt: now, recordedBy: context.actorId };
      lead.updatedAt = now;
      break;
    }
    case 'suppress': addSuppression(state, find(state.leads, command.leadId, 'Lead'), command.reason, context); break;
    case 'save_template': {
      const placeholders = [...command.body.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map(match => match[1]);
      if (placeholders.some(field => !['owner_name', 'address', 'zip'].includes(field))) fail('Supported template fields are {{owner_name}}, {{address}} and {{zip}}.');
      const revision = Math.max(0, ...state.templates.filter(item => item.name === command.name && item.channel === command.channel).map(item => item.revision)) + 1;
      state.templates.push({ id: randomUUID(), channel: command.channel, name: command.name, body: command.body, revision, status: 'draft', createdAt: now, createdBy: context.actorId, reviewedAt: null, reviewerId: null, evidence: null });
      result = state.templates.at(-1);
      break;
    }
    case 'review_template': {
      reviewer(context); const template = find(state.templates, command.templateId, 'Template');
      if (command.approved && (!/principal\s+buyer/i.test(template.body) || !/assign/i.test(template.body))) fail('The template must disclose principal buyer status and assignment intent before review approval.');
      if (template.status === 'retired' && command.approved) fail('Retired templates cannot be reactivated; create a new revision.');
      template.status = command.approved ? 'approved' : 'retired'; template.reviewedAt = now; template.reviewerId = context.actorId; template.evidence = command.evidence;
      break;
    }
    case 'draft_batch': {
      const template = find(state.templates, command.templateId, 'Template');
      if (template.status !== 'approved' || template.channel !== command.channel) fail('Choose an approved template for this channel.');
      const leads = command.leadIds.map(key => find(state.leads, key, 'Lead'));
      if (new Set(leads.map(lead => lead.synthetic)).size > 1) fail('Do not mix synthetic and real recipients in a batch.');
      const items: BatchItem[] = leads.map(lead => {
        const reasons = eligibility(state, lead, command.channel, now, false); if (reasons.length) fail(`${lead.ownerName}: ${reasons.join(' ')}`);
        return { leadId: lead.id, ownerName: lead.ownerName, address: lead.address, mailingAddress: lead.mailingAddress, phone: lead.phone, email: lead.email, content: `${lead.synthetic ? 'SYNTHETIC EXERCISE — DO NOT CONTACT\n' : ''}${render(template.body, lead)}`, fingerprint: digest(lead), contactEvidence: structuredClone(lead.contact!), source: lead.source, sourceDate: lead.sourceDate, permissionReference: lead.permissionReference };
      });
      if (command.channel === 'call' && new Set(items.map(item => item.phone)).size !== items.length) fail('A calling batch may contain only one entry per phone number.');
      const batch: Batch = { id: randomUUID(), channel: command.channel, templateId: template.id, templateSnapshot: structuredClone(template), gateEvidence: structuredClone(gateSnapshot(state, leads).filter(item => item !== null)), items, snapshotHash: '', status: 'draft', createdAt: now, createdBy: context.actorId, approvedAt: null, approvedBy: null, approvalEvidence: null, expiresAt: null, exportedAt: [], revokedReason: null };
      batch.snapshotHash = batchSnapshot(state, batch); state.batches.push(batch); result = batch;
      break;
    }
    case 'approve_batch': {
      reviewer(context); const batch = find(state.batches, command.batchId, 'Batch');
      if (batch.status !== 'draft') fail('Only a draft batch can be approved. Create a new batch for a new approval window.');
      validateBatch(state, batch, now); batch.status = 'approved'; batch.approvedAt = now; batch.approvedBy = context.actorId; batch.approvalEvidence = command.evidence; batch.expiresAt = new Date(ms(now) + DAY).toISOString();
      break;
    }
    case 'revoke_batch': { const batch = find(state.batches, command.batchId, 'Batch'); batch.status = 'revoked'; batch.revokedReason = command.reason; break; }
    case 'export_batch': {
      const batch = find(state.batches, command.batchId, 'Batch'); requireApproval(batch, now); validateBatch(state, batch, now);
      batch.exportedAt.push(now);
      const rows = batch.items.map(item => [item.leadId, item.ownerName, item.address, find(state.leads, item.leadId, 'Lead').synthetic ? 'PRACTICE ONLY — NO DELIVERY' : batch.channel === 'mail' ? item.mailingAddress : item.phone, item.content, batch.id, batch.snapshotHash, batch.expiresAt!]);
      result = { filename: `sangam-${batch.channel}-${batch.id}.csv`, mimeType: 'text/csv;charset=utf-8', content: csvDownload(['lead_id', 'owner_name', 'property_address', batch.channel === 'mail' ? 'owner_mailing_address' : 'phone', batch.channel === 'mail' ? 'reviewed_letter' : 'reviewed_call_script', 'batch_id', 'approved_snapshot', 'use_before'], rows) } satisfies Download;
      break;
    }
    case 'record_receipt': {
      const previous = state.receipts.find(item => item.idempotencyKey === command.idempotencyKey);
      if (previous) {
        const fields = ['batchId', 'leadId', 'occurredAt', 'outcome', 'reference', 'cost', 'notes'] as const;
        if (fields.some(field => previous[field] !== (command[field] ?? ''))) fail('Idempotency key is already used for different activity.');
        return { state: original, result: previous };
      }
      actual(command.occurredAt, now, 'Activity date');
      const batch = find(state.batches, command.batchId, 'Batch'), lead = find(state.leads, command.leadId, 'Lead');
      const recipient = batch.items.find(item => item.leadId === lead.id);
      if (!recipient) fail('Lead is not a recipient in this batch.');
      mustHaveExport(batch, command.occurredAt);
      if (batch.channel === 'mail' && command.outcome !== 'mailed') fail('Mail handoff receipts must record mailed; record response details in qualification.');
      if (batch.channel === 'call') {
        if (command.outcome === 'mailed') fail('A call receipt cannot be marked mailed.');
        if (!callHours(command.occurredAt)) fail('Actual calling must fall within local calling hours.');
        const duplicate = state.receipts.some(item => item.channel === 'call' && item.destination === recipient.phone && localParts(item.occurredAt).day === localParts(command.occurredAt).day);
        if (duplicate) fail('Daily limit: only one call attempt per contact is allowed.');
      }
      if (state.receipts.some(item => item.batchId === batch.id && item.leadId === lead.id)) fail('This recipient already has an activity receipt for this batch.');
      const receipt = { id: randomUUID(), batchId: batch.id, leadId: lead.id, channel: batch.channel, destination: batch.channel === 'call' ? recipient.phone : recipient.mailingAddress, occurredAt: command.occurredAt, outcome: command.outcome, reference: command.reference, idempotencyKey: command.idempotencyKey, cost: command.cost, notes: command.notes ?? '', synthetic: lead.synthetic, recordedAt: now, actorId: context.actorId };
      state.receipts.push(receipt);
      if (command.outcome === 'opt_out') addSuppression(state, { ...recipient, id: lead.id }, 'Manual call opt-out', context);
      if (command.outcome === 'wrong_number' && recipient.phone === lead.phone) { lead.contact = null; lead.updatedAt = now; }
      result = receipt;
      break;
    }
    case 'record_response': {
      actual(command.occurredAt, now, 'Response date'); const lead = find(state.leads, command.leadId, 'Lead');
      if (state.responses.some(item => item.leadId === lead.id && item.reference === command.reference)) fail('This response reference is already recorded.');
      const prior = state.receipts.filter(item => item.leadId === lead.id && ms(item.occurredAt) <= ms(command.occurredAt)).sort((a, b) => ms(b.occurredAt) - ms(a.occurredAt))[0];
      if (!prior && command.outcome !== 'opt_out') fail('Record the actual prior mail/call receipt before recording its response.');
      const recipient = prior ? find(state.batches, prior.batchId, 'Batch').items.find(item => item.leadId === lead.id)! : null;
      if (command.outcome === 'opt_out') addSuppression(state, recipient ? { ...recipient, id: lead.id } : lead, 'Inbound owner opt-out', context);
      if (command.outcome === 'wrong_number' && (!recipient || recipient.phone === lead.phone)) { lead.contact = null; lead.updatedAt = now; }
      state.responses.push({ id: randomUUID(), leadId: lead.id, occurredAt: command.occurredAt, outcome: command.outcome, reference: command.reference, notes: command.notes, synthetic: lead.synthetic, recordedAt: now }); result = state.responses.at(-1); break;
    }
    case 'qualify_lead': {
      const lead = find(state.leads, command.leadId, 'Lead'); lead.qualification = { condition: command.condition, timeline: command.timeline, priceExpectation: command.priceExpectation, mortgageBalance: command.mortgageBalance, notes: command.notes, recordedAt: now }; lead.updatedAt = now; break;
    }
    case 'underwrite': {
      const lead = find(state.leads, command.leadId, 'Lead');
      const mao = Math.round((command.arv * (1 - command.profitPercent) - command.repairs - command.closingCosts - command.assignmentFee) * 100) / 100;
      lead.underwriting = { arv: command.arv, repairs: command.repairs, closingCosts: command.closingCosts, assignmentFee: command.assignmentFee, profitPercent: command.profitPercent, compReferences: command.compReferences, mao, recordedAt: now }; lead.updatedAt = now; break;
    }
    case 'record_offer': {
      actual(command.occurredAt, now, 'Offer date'); const lead = find(state.leads, command.leadId, 'Lead');
      if (!lead.underwriting) fail('Record underwriting and three sold comparable references before an offer.');
      if (!lead.synthetic) requireGates(state, now);
      if (lead.signals.nod && !lead.synthetic) requireGates(state, now, ['nod_counsel']);
      if (state.offers.some(item => item.leadId === lead.id && item.reference === command.reference)) fail('This offer reference is already recorded.');
      state.offers.push({ id: randomUUID(), leadId: lead.id, amount: command.amount, occurredAt: command.occurredAt, reference: command.reference, synthetic: lead.synthetic, recordedAt: now }); result = state.offers.at(-1); break;
    }
    case 'record_contract': {
      actual(command.signedAt, now, 'Signed date'); const lead = find(state.leads, command.leadId, 'Lead');
      const offer = find(state.offers, command.offerId, 'Offer'); if (offer.leadId !== lead.id) fail('Offer belongs to another lead.');
      if (ms(command.signedAt) < ms(offer.occurredAt)) fail('Contract cannot precede its recorded offer.');
      if (!command.assignable) fail('Written assignability is required for an assignment contract.');
      if (command.closingDate < localParts(command.signedAt).day) fail('Closing date cannot precede the signed contract.');
      if (!lead.synthetic) requireGates(state, now);
      if (lead.signals.nod && !lead.synthetic) requireGates(state, now, ['nod_counsel']);
      if (state.contracts.some(item => item.leadId === lead.id && (!item.termination || ms(item.termination.endedAt) > ms(command.signedAt)))) fail('A contract is already active for this lead at that signed date. Record the actual cancellation before a later replacement contract.');
      const contract: Contract = { id: randomUUID(), leadId: lead.id, offerId: offer.id, price: command.price, signedAt: command.signedAt, reference: command.reference, assignable: true, disclosuresReference: command.disclosuresReference, closingDate: command.closingDate, amendments: [], termination: null, synthetic: lead.synthetic, createdAt: now };
      state.contracts.push(contract); result = contract; break;
    }
    case 'extend_contract': {
      actual(command.signedAt, now, 'Extension signed date'); const contract = find(state.contracts, command.contractId, 'Contract');
      if (contract.termination || state.closings.some(item => item.contractId === contract.id)) fail('A cancelled or closed contract cannot be extended.');
      if (ms(command.signedAt) < ms(contract.signedAt) || command.newClosingDate <= contract.closingDate || command.newClosingDate < localParts(command.signedAt).day) fail('Extension must follow the purchase contract and move closing to a later date.');
      contract.amendments.push({ newClosingDate: command.newClosingDate, signedAt: command.signedAt, reference: command.reference, recordedAt: now }); contract.closingDate = command.newClosingDate; break;
    }
    case 'cancel_contract': {
      actual(command.endedAt, now, 'Cancellation date'); const contract = find(state.contracts, command.contractId, 'Contract');
      if (contract.termination || state.closings.some(item => item.contractId === contract.id)) fail('Contract is already cancelled or closed.');
      if (ms(command.endedAt) < ms(contract.signedAt)) fail('Cancellation cannot precede the purchase contract.');
      contract.termination = { endedAt: command.endedAt, reference: command.reference, reason: command.reason, recordedAt: now }; break;
    }
    case 'save_buyer': {
      actual(command.permissionAt, now, 'Buyer permission date'); if (command.minPrice > command.maxPrice) fail('Minimum buyer price cannot exceed maximum.');
      if (command.lastCashPurchaseDate) actual(command.lastCashPurchaseDate, now, 'Last cash purchase date');
      if (!command.email && !command.phone) fail('Buyer needs a contact destination.');
      const normalizedPhone = phone(command.phone);
      if (command.synthetic) practiceContact(command.name, normalizedPhone, command.email);
      if (command.id && find(state.buyers, command.id, 'Buyer').synthetic !== command.synthetic) fail('A buyer cannot switch between practice and real data.');
      const buyer: Buyer = { id: command.id ?? randomUUID(), name: command.name, email: command.email.toLowerCase(), phone: normalizedPhone, zips: [...new Set(command.zips)], minPrice: command.minPrice, maxPrice: command.maxPrice, propertyTypes: [...new Set(command.propertyTypes.map(value => value.toUpperCase()))], rehabMax: command.rehabMax, permissionReference: command.permissionReference, permissionAt: command.permissionAt, sourceReference: command.sourceReference, synthetic: command.synthetic, active: command.active, cashPurchases24m: command.cashPurchases24m ?? null, lastCashPurchaseDate: command.lastCashPurchaseDate ?? null, entity: command.entity ?? null, purchasedFarmZip: command.purchasedFarmZip ?? null, updatedAt: now };
      if (state.buyers.some(item => item.id !== buyer.id && ((!!buyer.email && item.email === buyer.email) || (!!buyer.phone && item.phone === buyer.phone)))) fail('A buyer with this contact already exists; update its existing profile.');
      const index = state.buyers.findIndex(item => item.id === buyer.id); if (index === -1) state.buyers.push(buyer); else state.buyers[index] = buyer; result = buyer; break;
    }
    case 'match_buyers': return { state: original, result: matchBuyers(state, find(state.contracts, command.contractId, 'Contract'), now) };
    case 'draft_packet': {
      const contract = find(state.contracts, command.contractId, 'Contract');
      const matches = matchBuyers(state, contract, now);
      for (const buyerId of command.buyerIds) if (!matches.some(match => match.buyerId === buyerId)) fail('Select only currently permitted buyers from the top ten matches.');
      if (!/contractual\s+interest|equitable\s+interest/i.test(command.body) || !/assign/i.test(command.body)) fail('Packet must identify the contractual/equitable interest and intended assignment.');
      const packet: Packet = { id: randomUUID(), contractId: contract.id, contractSnapshot: structuredClone(contract), buyersSnapshot: structuredClone(command.buyerIds.map(key => find(state.buyers, key, 'Buyer'))), gateEvidence: structuredClone(gateSnapshot(state, [find(state.leads, contract.leadId, 'Lead')]).filter(item => item !== null)), buyerIds: command.buyerIds, body: command.body, snapshotHash: '', status: 'draft', createdAt: now, approvedAt: null, approvedBy: null, approvalEvidence: null, expiresAt: null, exportedAt: [] };
      packet.snapshotHash = packetSnapshot(state, packet); state.packets.push(packet); result = packet; break;
    }
    case 'approve_packet': {
      reviewer(context); const packet = find(state.packets, command.packetId, 'Packet');
      if (packet.status !== 'draft') fail('Only a draft packet can receive a new approval.');
      validatePacket(state, packet, now); packet.status = 'approved'; packet.approvedAt = now; packet.approvedBy = context.actorId; packet.approvalEvidence = command.evidence; packet.expiresAt = new Date(ms(now) + DAY).toISOString(); break;
    }
    case 'revoke_packet': find(state.packets, command.packetId, 'Packet').status = 'revoked'; break;
    case 'export_packet': {
      const packet = find(state.packets, command.packetId, 'Packet'); requireApproval(packet, now); validatePacket(state, packet, now);
      const contract = find(state.contracts, packet.contractId, 'Contract'), lead = find(state.leads, contract.leadId, 'Lead');
      const ask = contract.price + (lead.underwriting?.assignmentFee ?? 0);
      packet.exportedAt.push(now);
      result = { filename: `sangam-assignment-${packet.id}.csv`, mimeType: 'text/csv;charset=utf-8', content: csvDownload(['packet_id', 'buyer_id', 'buyer_name', 'email', 'phone', 'property_address', 'interest', 'purchase_contract_reference', 'disclosures_reference', 'proposed_total_price', 'reviewed_message', 'approved_snapshot', 'use_before'], packet.buyerIds.map(key => { const buyer = find(state.buyers, key, 'Buyer'); return [packet.id, buyer.id, buyer.name, contract.synthetic ? 'PRACTICE ONLY — NO DELIVERY' : buyer.email, contract.synthetic ? 'PRACTICE ONLY — NO DELIVERY' : buyer.phone, lead.address, 'Contractual interest only; no ownership representation', contract.reference, contract.disclosuresReference, ask, `${contract.synthetic ? 'SYNTHETIC EXERCISE — DO NOT CONTACT\n' : ''}${packet.body}`, packet.snapshotHash, packet.expiresAt]; })) } satisfies Download;
      break;
    }
    case 'record_buyer_receipt': {
      const previous = state.buyerReceipts.find(item => item.idempotencyKey === command.idempotencyKey);
      if (previous) {
        if (['packetId', 'buyerId', 'occurredAt', 'outcome', 'reference'].some(key => previous[key as keyof typeof previous] !== command[key as keyof typeof command])) fail('Idempotency key is already used for different buyer activity.');
        return { state: original, result: previous };
      }
      actual(command.occurredAt, now, 'Buyer activity date'); const packet = find(state.packets, command.packetId, 'Packet');
      if (!packet.buyerIds.includes(command.buyerId)) fail('Buyer was not included in this packet.');
      if (command.outcome === 'delivered') mustHaveExport(packet, command.occurredAt);
      else if (!packet.exportedAt.some(at => ms(at) <= ms(command.occurredAt))) fail('Record a response only after the packet was actually exported.');
      if (state.buyerReceipts.some(item => item.packetId === packet.id && item.buyerId === command.buyerId && item.outcome === command.outcome)) fail('This buyer outcome is already recorded for the packet.');
      const contract = find(state.contracts, packet.contractId, 'Contract');
      state.buyerReceipts.push({ id: randomUUID(), packetId: packet.id, buyerId: command.buyerId, occurredAt: command.occurredAt, outcome: command.outcome, reference: command.reference, idempotencyKey: command.idempotencyKey, synthetic: contract.synthetic, recordedAt: now });
      if (command.outcome === 'opt_out') {
        find(state.buyers, command.buyerId, 'Buyer').active = false;
        const contactedBuyer = find(packet.buyersSnapshot, command.buyerId, 'Reviewed buyer');
        state.suppressions.push({ id: randomUUID(), leadId: '', buyerId: contactedBuyer.id, phone: contactedBuyer.phone, email: contactedBuyer.email, ownerName: contactedBuyer.name, mailingAddress: '', reason: 'Buyer opt-out from reviewed packet', createdAt: now, actorId: context.actorId });
      }
      result = state.buyerReceipts.at(-1); break;
    }
    case 'record_assignment': {
      actual(command.signedAt, now, 'Assignment date'); const contract = find(state.contracts, command.contractId, 'Contract');
      contractReady(state, contract, now); const buyer = find(state.buyers, command.buyerId, 'Buyer');
      if (!buyerAllowed(state, buyer, contract)) fail('Buyer permission is not current.');
      if (ms(command.signedAt) < ms(contract.signedAt)) fail('Assignment cannot precede the purchase contract.');
      if (command.depositAmount > 0 && !command.depositReference) fail('An actual deposit needs its escrow/payment reference.');
      state.assignments.push({ id: randomUUID(), contractId: contract.id, buyerId: buyer.id, signedAt: command.signedAt, reference: command.reference, price: command.price, disclosuresReference: command.disclosuresReference, depositAmount: command.depositAmount, depositReference: command.depositReference }); result = state.assignments.at(-1); break;
    }
    case 'record_close': {
      actual(command.closedAt, now, 'Closing date'); const contract = find(state.contracts, command.contractId, 'Contract');
      if (contract.termination) fail('A cancelled contract cannot be closed.');
      const assignment = state.assignments.find(item => item.contractId === contract.id);
      if (!assignment) fail('Record the executed assignment before closing.');
      if (ms(command.closedAt) < ms(assignment.signedAt)) fail('Closing cannot precede assignment.');
      if (state.closings.some(item => item.contractId === contract.id)) fail('Closing is already recorded for this contract.');
      state.closings.push({ id: randomUUID(), contractId: contract.id, closedAt: command.closedAt, assignmentFee: command.assignmentFee, expenses: command.expenses, reference: command.reference, synthetic: contract.synthetic }); result = state.closings.at(-1); break;
    }
  }
  state.audit.push({ id: randomUUID(), action: command.type, at: now, actorId: context.actorId, detail: result && typeof result === 'object' && 'id' in result ? String(result.id) : command.type === 'import_leads' ? `Imported ${(result as ImportPreview).count} rows` : 'Recorded by authenticated workspace operator' });
  if (Buffer.byteLength(JSON.stringify(state), 'utf8') > 32 * 1024 * 1024) fail('Workspace reached the 32 MiB pilot storage limit. Arrange a supported migration before adding more records.');
  return { state, result };
}

export function summarize(state: AcquisitionState, now: string): Summary {
  const actualReceipts = state.receipts.filter(item => !item.synthetic && ms(item.occurredAt) <= ms(now));
  const launch = actualReceipts.map(item => item.occurredAt).sort((a, b) => ms(a) - ms(b))[0] ?? null;
  const end = launch ? ms(launch) + 90 * DAY : 0;
  const inPilot = (value: string) => !!launch && ms(value) >= ms(launch) && ms(value) < end && ms(value) <= ms(now);
  const receipts = actualReceipts.filter(item => inPilot(item.occurredAt));
  const realLeads = state.leads.filter(item => !item.synthetic);
  const followUps = realLeads.flatMap(lead => {
    if (suppressed(state, lead) || state.contracts.some(item => item.leadId === lead.id && !item.termination)) return [];
    const times = actualReceipts.filter(item => item.leadId === lead.id).map(item => ms(item.occurredAt)).sort((a, b) => a - b);
    if (!times.length) return [];
    const first = times[0], last = times.at(-1)!;
    const day = [7, 21, 45, 90, 180].find(offset => first + offset * DAY > last);
    return day === undefined ? [] : [{ leadId: lead.id, ownerName: lead.ownerName, dueAt: new Date(first + day * DAY).toISOString() }];
  }).sort((a, b) => ms(a.dueAt) - ms(b.dueAt));
  const buyerAlertsDue = state.contracts.filter(contract => !contract.synthetic && !contract.termination && !state.assignments.some(item => item.contractId === contract.id) && !state.closings.some(item => item.contractId === contract.id)).map(contract => {
    const packets = state.packets.filter(packet => packet.contractId === contract.id).map(packet => packet.id);
    const delivered = new Set(state.buyerReceipts.filter(item => packets.includes(item.packetId) && ['delivered', 'interested'].includes(item.outcome) && ms(item.occurredAt) <= ms(contract.signedAt) + DAY).map(item => item.buyerId)).size;
    return { contractId: contract.id, dueAt: new Date(ms(contract.signedAt) + DAY).toISOString(), delivered, required: 10 };
  }).filter(item => item.delivered < item.required);
  const responses = state.responses.filter(item => !item.synthetic && inPilot(item.occurredAt));
  const conversations = receipts.filter(item => ['conversation', 'appointment'].includes(item.outcome)).length + responses.filter(item => ['conversation', 'appointment'].includes(item.outcome)).length;
  const appointments = receipts.filter(item => item.outcome === 'appointment').length + responses.filter(item => item.outcome === 'appointment').length;
  const offers = state.offers.filter(item => !item.synthetic && inPilot(item.occurredAt)).length;
  const contracts = state.contracts.filter(item => !item.synthetic && inPilot(item.signedAt)).length;
  // Setup costs count even before outreach; duplicate receipt/closing costs must not be re-entered as expenses.
  const spend = Math.round((receipts.reduce((total, item) => total + item.cost, 0) + state.closings.filter(item => !item.synthetic && inPilot(item.closedAt)).reduce((total, item) => total + item.expenses, 0) + state.expenses.filter(item => !item.synthetic && ms(item.occurredAt) <= ms(now) && (!launch || ms(item.occurredAt) < end)).reduce((total, item) => total + item.amount, 0)) * 100) / 100;
  const per = (count: number) => count ? Math.round(spend / count * 100) / 100 : null;
  return { launchedAt: launch, day: launch ? Math.floor((ms(now) - ms(launch)) / DAY) + 1 : null, daysRemaining: launch ? Math.max(0, Math.ceil((end - ms(now)) / DAY)) : null, targets: { leads: 2000, offers: 20, contracts: 1 }, progress: { leads: new Set(receipts.map(item => item.leadId)).size, offers: state.offers.filter(item => !item.synthetic && inPilot(item.occurredAt)).length, contracts: state.contracts.filter(item => !item.synthetic && inPilot(item.signedAt)).length, conversations, appointments, assignmentFees: state.closings.filter(item => !item.synthetic && inPilot(item.closedAt)).reduce((total, item) => total + item.assignmentFee, 0), spend }, totalLeads: state.leads.length, realLeads: realLeads.length, syntheticLeads: state.leads.length - realLeads.length, scoreQualified: realLeads.filter(item => item.score >= 8).length, mailReady: realLeads.filter(item => eligibility(state, item, 'mail', now).length === 0).length, callReady: realLeads.filter(item => eligibility(state, item, 'call', now).length === 0).length, nextBlockedGate: GENERAL_GATES.find(name => !gateGood(state, name, now)) ?? null, followUps, buyerAlertsDue, outbound: 'disabled', costPer: { conversation: per(conversations), offer: per(offers), contract: per(contracts) }, readiness: { allGeneralGatesApproved: GENERAL_GATES.every(name => gateGood(state, name, now)), approvedTemplates: state.templates.filter(item => item.status === 'approved').length } };
}
