import type { AcquisitionState, Summary } from '../acquisition/types';
import { eligibility, GENERAL_GATES, gateGood, localParts, suppressed } from '../acquisition/policy';
import { buildBuyerPipeline, buyerContactEvidenceBlockers } from './buyers';
import type { DailyWorkItem } from './types';

const DAY = 86_400_000;
const ms = (value: string) => new Date(value).getTime();
const terminalOutcomePriority = (outcome: string) => outcome === 'opt_out' ? 2 : outcome === 'not_interested' ? 1 : 0;
// Calendar arithmetic uses UTC only after extracting the Pacific date, avoiding DST drift.
export function closingDays(closingDate: string, now: string) {
  return Math.round((Date.parse(`${closingDate}T00:00:00Z`) - Date.parse(`${localParts(now).day}T00:00:00Z`)) / DAY);
}
export function buildDailyQueue(state: AcquisitionState, summary: Summary, now: string, synthetic = false, sourceHolds: Record<string, string> = {}): DailyWorkItem[] {
  const result: DailyWorkItem[] = [];
  const day = localParts(now).day;
  const contracts = state.contracts.filter(item => item.synthetic === synthetic && ms(item.signedAt) <= ms(now) && !item.termination && !state.closings.some(close => close.contractId === item.id));
  const activeLeadIds = new Set(contracts.map(item => item.leadId));
  for (const contract of contracts) {
    const lead = state.leads.find(item => item.id === contract.leadId);
    const days = closingDays(contract.closingDate, now);
    if (days <= 3) result.push({ id: `closing:${contract.id}`, priority: days < 0 ? 0 : 10,
      title: days < 0 ? 'Verify an elapsed closing date' : 'Coordinate the approaching closing',
      reason: `${lead?.address ?? 'Contract'} · closing ${contract.closingDate}. Record only the actual extension, termination or closing.`,
      dueAt: contract.closingDate, state: 'ready', blockers: [], target: { tab: 'deals', contractId: contract.id, leadId: contract.leadId } });
    if (contract.closingDate < day || state.assignments.some(item => item.contractId === contract.id)) continue;
    const packets = state.packets.filter(item => item.contractId === contract.id);
    const packetIds = new Set(packets.map(item => item.id));
    const delivered = new Set(state.buyerReceipts.filter(item => packetIds.has(item.packetId) && item.synthetic === synthetic && ['delivered', 'interested'].includes(item.outcome) && ms(item.occurredAt) <= ms(now)).map(item => item.buyerId)).size;
    if (delivered < 10) {
      const blockers = buyerContactEvidenceBlockers(state, contract, now);
      if (sourceHolds[contract.leadId]) blockers.push(sourceHolds[contract.leadId]);
      const dueAt = new Date(ms(contract.signedAt) + DAY).toISOString();
      result.push({ id: `buyer-alert:${contract.id}`, priority: 20, title: 'Prepare the remaining manual buyer alerts',
        reason: `${lead?.address ?? 'Contract'} · ${delivered} of 10 actual deliveries recorded. Find permitted buyers if fewer than 10 fit; exports do not count.`,
        dueAt, state: blockers.length ? 'blocked' : ms(dueAt) > ms(now) ? 'upcoming' : 'ready', blockers,
        target: { tab: 'deals', contractId: contract.id, leadId: contract.leadId } });
    }
  }
  for (const buyer of buildBuyerPipeline(state, now, synthetic, sourceHolds)) {
    if (['declined', 'suppressed', 'assigned', 'closed', 'contract_ended'].includes(buyer.stage)) continue;
    if (buyer.nextDueAt) result.push({ id: `buyer-follow-up:${buyer.contractId}:${buyer.buyerId}`, priority: 30,
      title: `Follow up manually with ${buyer.buyerName}`, reason: 'Use the reviewed relationship and record only what actually happens.',
      dueAt: buyer.nextDueAt, state: buyer.blockers.length ? 'blocked' : ms(buyer.nextDueAt) > ms(now) ? 'upcoming' : 'ready',
      blockers: buyer.blockers, target: { tab: 'deals', contractId: buyer.contractId, buyerId: buyer.buyerId } });
    else if (buyer.latestOffer) result.push({ id: `buyer-offer:${buyer.contractId}:${buyer.buyerId}`, priority: 30,
      title: `Review ${buyer.buyerName}'s recorded offer`, reason: 'Compare the actual buyer offer with costs and contract terms. An offer is not an executed assignment.',
      dueAt: null, state: 'ready', blockers: [], target: { tab: 'deals', contractId: buyer.contractId, buyerId: buyer.buyerId } });
  }
  for (const lead of state.leads.filter(item => item.synthetic === synthetic && ms(item.importedAt) <= ms(now))) {
    if (suppressed(state, lead) || activeLeadIds.has(lead.id) || state.closings.some(close => state.contracts.some(contract => contract.id === close.contractId && contract.leadId === lead.id))) continue;
    const receipts = state.receipts.filter(item => item.leadId === lead.id && item.synthetic === synthetic && ms(item.occurredAt) <= ms(now));
    const responses = state.responses.filter(item => item.leadId === lead.id && item.synthetic === synthetic && ms(item.occurredAt) <= ms(now));
    // Minute-resolution event inputs can tie. Respect the later saved evidence;
    // exact ties retain a terminal response rather than depend on array order.
    const latest = [...receipts, ...responses].sort((a, b) => ms(b.occurredAt) - ms(a.occurredAt)
      || ms(b.recordedAt) - ms(a.recordedAt)
      || terminalOutcomePriority(b.outcome) - terminalOutcomePriority(a.outcome)
      || a.id.localeCompare(b.id))[0];
    if (latest && ['not_interested', 'opt_out'].includes(latest.outcome)) continue;
    const target = { tab: 'leads' as const, leadId: lead.id };
    if (!lead.qualification && [...receipts, ...responses].some(item => ['conversation', 'appointment'].includes(item.outcome))) {
      result.push({ id: `qualify:${lead.id}`, priority: 40, title: `Qualify ${lead.ownerName}'s property`, reason: 'A conversation is recorded; capture the actual condition, timeline and price expectation.', dueAt: null, state: 'ready', blockers: [], target });
      continue;
    }
    if (lead.qualification && !lead.underwriting) {
      result.push({ id: `underwrite:${lead.id}`, priority: 50, title: `Underwrite ${lead.address}`, reason: 'Review at least three sold comparables and costs before making a human offer.', dueAt: null, state: 'ready', blockers: [], target });
      continue;
    }
    if (lead.qualification && lead.underwriting && !state.offers.some(item => item.leadId === lead.id && ms(item.occurredAt) <= ms(now))) {
      const blockers = synthetic ? [] : GENERAL_GATES.filter(name => !gateGood(state, name, now)).map(name => `The ${name} gate needs current evidence.`);
      if (!synthetic && lead.signals.nod && !gateGood(state, 'nod_counsel', now)) blockers.push('The nod_counsel specialist gate needs evidence.');
      if (sourceHolds[lead.id]) blockers.push(sourceHolds[lead.id]);
      result.push({ id: `prepare-offer:${lead.id}`, priority: 55, title: `Review a human offer for ${lead.address}`,
        reason: 'Compare the recorded comps, costs and scenario assumptions. Record an offer only after it is actually delivered.',
        dueAt: null, state: blockers.length ? 'blocked' : 'ready', blockers, target });
      continue;
    }
    if (lead.score < 8) continue;
    let dueAt: string | null = null;
    if (receipts.length) {
      // The current Summary covers real leads. Derive the same cadence for explicit practice mode.
      if (!synthetic) dueAt = summary.followUps.find(item => item.leadId === lead.id)?.dueAt ?? null;
      else {
        const times = receipts.map(item => ms(item.occurredAt)).sort((a, b) => a - b);
        const offset = [7, 21, 45, 90, 180].find(value => times[0] + value * DAY > times.at(-1)!);
        if (offset !== undefined) dueAt = new Date(times[0] + offset * DAY).toISOString();
      }
      if (!dueAt) continue;
    }
    const mail = eligibility(state, lead, 'mail', now);
    const call = eligibility(state, lead, 'call', now);
    const blockers = mail.length && call.length ? [...new Set([...mail, ...call])] : [];
    if (sourceHolds[lead.id]) blockers.push(sourceHolds[lead.id]);
    const route = !mail.length ? 'mail' : !call.length ? 'manual calling' : 'manual outreach';
    result.push({ id: `seller-touch:${lead.id}`, priority: receipts.length ? 60 : 70,
      title: `${receipts.length ? 'Prepare follow-up' : 'Prepare first contact'} for ${lead.ownerName}`,
      reason: `${lead.address} · review a ${route} batch. Current source permission and approval are checked again at export.`,
      dueAt, state: blockers.length ? 'blocked' : dueAt && ms(dueAt) > ms(now) ? 'upcoming' : 'ready', blockers, target });
  }
  const nextGate = synthetic ? undefined : GENERAL_GATES.find(name => !gateGood(state, name, now));
  if (nextGate) result.push({ id: `gate:${nextGate}`, priority: 80, title: `Resolve ${nextGate.replaceAll('_', ' ')} evidence`, reason: 'A reviewer must record the genuine reference and scope before dependent operations can proceed.', dueAt: null, state: 'blocked', blockers: ['Current approved evidence is missing.'], target: { tab: 'readiness' } });
  return result.sort((a, b) => a.priority - b.priority || (a.dueAt ? ms(a.dueAt) : Infinity) - (b.dueAt ? ms(b.dueAt) : Infinity) || a.id.localeCompare(b.id));
}
