import type { AcquisitionState, Channel, GateName, Lead } from './types';

export const FARM_ZIPS = ['92501', '92503', '92505', '92507', '92401', '92404', '92408', '92410', '92551', '92553', '92555', '92335', '92336', '91761', '91762', '92376', '92324'];
export const GENERAL_GATES: GateName[] = ['counsel', 'channel_policy', 'data_provenance', 'suppression_ops', 'title_escrow', 'technical', 'launch_authorization'];
const ms = (value: string) => new Date(value).getTime();
const DAY = 86_400_000;
const normalized = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();
export function gateGood(state: AcquisitionState, name: GateName, now: string): boolean {
  const gate = state.gates.find(item => item.name === name);
  return !!gate && gate.status === 'approved' && ms(gate.reviewedAt) <= ms(now) && (!gate.expiresAt || ms(gate.expiresAt) > ms(now));
}
export function suppressed(state: AcquisitionState, lead: Lead) {
  return state.suppressions.some(item => item.leadId === lead.id || (!!item.phone && item.phone === lead.phone) || (!!item.email && item.email.toLowerCase() === lead.email.toLowerCase()) || (normalized(item.ownerName) === normalized(lead.ownerName) && !!item.mailingAddress && normalized(item.mailingAddress) === normalized(lead.mailingAddress)));
}
export function localParts(value: string) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value));
  const item = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return { day: `${item.year}-${item.month}-${item.day}`, hour: Number(item.hour), weekday: item.weekday };
}
export function callHours(now: string) { const local = localParts(now); return local.weekday !== 'Sun' && local.hour >= 9 && local.hour < 19; }
export function eligibility(state: AcquisitionState, lead: Lead, selectedChannel: Channel, now: string, enforceHours = true): string[] {
  const reasons: string[] = [];
  if (lead.score < 8) reasons.push('Seller score is below 8.');
  if (!FARM_ZIPS.includes(lead.zip)) reasons.push('Property is outside the starter farm.');
  if (suppressed(state, lead)) reasons.push('Owner or contact is permanently suppressed.');
  if (!lead.synthetic) {
    for (const name of GENERAL_GATES) if (!gateGood(state, name, now)) reasons.push(`The ${name} gate needs current evidence.`);
    if (lead.signals.nod && !gateGood(state, 'nod_counsel', now)) reasons.push('The nod_counsel specialist gate needs evidence.');
  }
  const evidence = lead.contact;
  if (!lead.phone || !evidence || evidence.phone !== lead.phone) reasons.push('Current phone-keyed scrub evidence is missing.');
  else {
    if (evidence.dncStatus !== 'clear' || evidence.litigatorStatus !== 'clear') reasons.push('DNC and litigator scrub must both be clear.');
    if (ms(evidence.scrubbedAt) > ms(now) || ms(now) - ms(evidence.scrubbedAt) > 30 * DAY) reasons.push('Scrub evidence is stale or future-dated.');
    if (selectedChannel === 'call' && (evidence.recipientTimezone !== 'America/Los_Angeles' || !evidence.timezoneEvidence.trim())) reasons.push('Calling needs supported recipient timezone evidence (America/Los_Angeles).');
  }
  if (selectedChannel === 'mail' && !/^.+,\s*.+\s[A-Z]{2}\s\d{5}(?:-\d{4})?$/i.test(lead.mailingAddress)) reasons.push('A complete owner mailing address (street, city ST ZIP) is required.');
  if (selectedChannel === 'call') {
    if (enforceHours && !callHours(now)) reasons.push('Manual calling hours are 9am–7pm America/Los_Angeles, Monday–Saturday.');
    if (state.receipts.some(receipt => receipt.channel === 'call' && (receipt.leadId === lead.id || receipt.destination === lead.phone) && localParts(receipt.occurredAt).day === localParts(now).day)) reasons.push('The daily limit is one call attempt per contact.');
  }
  return reasons;
}
