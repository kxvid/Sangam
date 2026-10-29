import type { AcquisitionState, Buyer, Contract } from '../acquisition/types';
import { GENERAL_GATES, gateGood, localParts } from '../acquisition/policy';
import type { BuyerPipelineRow } from './types';

const ms = (value: string) => new Date(value).getTime();
export function buyerContactEvidenceBlockers(state: AcquisitionState, contract: Contract, now: string): string[] {
  if (contract.synthetic) return [];
  const blockers = GENERAL_GATES.filter(name => !gateGood(state, name, now)).map(name => `The ${name} gate needs current evidence.`);
  const lead = state.leads.find(item => item.id === contract.leadId);
  if (!lead) blockers.push('The contract property record is unavailable.');
  if (lead?.signals.nod && !gateGood(state, 'nod_counsel', now)) blockers.push('The nod_counsel specialist gate needs current evidence.');
  return blockers;
}
export function buyerFollowUpBlockers(state: AcquisitionState, contract: Contract, buyer: Buyer, now: string): string[] {
  const blockers = buyerContactEvidenceBlockers(state, contract, now);
  if (contract.termination) blockers.push('The seller contract has ended.');
  if (state.closings.some(item => item.contractId === contract.id)) blockers.push('The contract is already closed.');
  if (state.assignments.some(item => item.contractId === contract.id)) blockers.push('The contract is already assigned; coordinate its closing instead.');
  if (contract.closingDate < localParts(now).day) blockers.push('The closing date has passed; verify an evidenced extension first.');
  if (!buyer.active || !buyer.permissionReference || ms(buyer.permissionAt) > ms(now)) blockers.push('Buyer permission is not current.');
  if (state.buyerReceipts.some(item => item.buyerId === buyer.id && item.outcome === 'opt_out') || state.suppressions.some(item => item.buyerId === buyer.id || (!!item.phone && item.phone === buyer.phone) || (!!item.email && item.email.toLowerCase() === buyer.email.toLowerCase()))) blockers.push('Buyer or contact is suppressed.');
  return blockers;
}
function latest<T>(items: T[], at: (item: T) => string) {
  return items.map((item, index) => ({ item, index })).sort((a, b) => ms(at(b.item)) - ms(at(a.item)) || b.index - a.index)[0]?.item;
}
export function buildBuyerPipeline(state: AcquisitionState, now: string, synthetic = false, sourceHolds: Record<string, string> = {}): BuyerPipelineRow[] {
  const result: BuyerPipelineRow[] = [];
  for (const contract of state.contracts.filter(item => item.synthetic === synthetic && ms(item.signedAt) <= ms(now))) {
    const packets = state.packets.filter(item => item.contractId === contract.id && item.approvedAt && ms(item.approvedAt) <= ms(now));
    const packetIds = new Set(packets.map(item => item.id));
    const activities = (state.buyerActivities ?? []).filter(item => item.contractId === contract.id && item.synthetic === synthetic && ms(item.recordedAt) <= ms(now) && (!item.occurredAt || ms(item.occurredAt) <= ms(now)));
    const assignments = state.assignments.filter(item => item.contractId === contract.id && ms(item.signedAt) <= ms(now));
    const buyerIds = new Set([...packets.flatMap(item => item.buyerIds), ...activities.map(item => item.buyerId), ...assignments.map(item => item.buyerId)]);
    for (const buyerId of buyerIds) {
      const buyer = state.buyers.find(item => item.id === buyerId && item.synthetic === synthetic);
      if (!buyer) continue;
      const events = activities.filter(item => item.buyerId === buyerId);
      const receipts = state.buyerReceipts.filter(item => item.buyerId === buyerId && packetIds.has(item.packetId) && item.synthetic === synthetic && ms(item.occurredAt) <= ms(now));
      const lastReceipt = latest(receipts.filter(item => ['interested', 'declined', 'opt_out'].includes(item.outcome)), item => item.occurredAt);
      const plan = latest(events.filter(item => item.kind === 'follow_up_planned'), item => item.recordedAt);
      const openPlan = plan && !events.some(item => item.completesTaskId === plan.id) ? plan : undefined;
      const offer = latest(events.filter(item => item.kind === 'offer_received'), item => item.occurredAt!);
      const currentOffer = offer && !events.some(item => item.kind === 'offer_withdrawn' && item.withdrawsOfferId === offer.id) ? offer : undefined;
      const blockers = buyerFollowUpBlockers(state, contract, buyer, now);
      const buyerSuppressed = blockers.some(value => /suppressed|permission/.test(value));
      if (sourceHolds[contract.leadId]) blockers.push(sourceHolds[contract.leadId]);
      let stage: BuyerPipelineRow['stage'] = 'prepared';
      if (receipts.some(item => item.outcome === 'delivered')) stage = 'delivered';
      if (lastReceipt?.outcome === 'interested') stage = 'interested';
      if (currentOffer) stage = 'offered';
      if (lastReceipt?.outcome === 'declined' && (!currentOffer || ms(lastReceipt.occurredAt) >= ms(currentOffer.occurredAt!))) stage = 'declined';
      if (buyerSuppressed) stage = 'suppressed';
      const assignedBuyer = assignments.some(item => item.buyerId === buyerId);
      if (assignedBuyer) stage = 'assigned';
      else if (assignments.length) stage = 'contract_ended';
      if (contract.termination || contract.closingDate < localParts(now).day) stage = 'contract_ended';
      if (state.closings.some(item => item.contractId === contract.id && ms(item.closedAt) <= ms(now))) stage = assignedBuyer ? 'closed' : 'contract_ended';
      const actualTimes = [...receipts.map(item => item.occurredAt), ...events.flatMap(item => item.occurredAt ? [item.occurredAt] : [])];
      const terminal = ['suppressed', 'assigned', 'closed', 'contract_ended', 'declined'].includes(stage);
      result.push({ contractId: contract.id, buyerId, buyerName: buyer.name, stage,
        lastActivityAt: actualTimes.sort((a, b) => ms(b) - ms(a))[0] ?? null,
        nextDueAt: terminal ? null : openPlan?.dueAt ?? null,
        plannedTaskId: openPlan?.id ?? null,
        latestOffer: currentOffer ? { activityId: currentOffer.id, amount: currentOffer.amount!, occurredAt: currentOffer.occurredAt! } : null,
        blockers: stage === 'declined' ? [...blockers, 'Buyer declined this deal. Record a new permitted response before planning contact.'] : blockers,
      });
    }
  }
  return result.sort((a, b) => a.contractId.localeCompare(b.contractId) || a.buyerName.localeCompare(b.buyerName) || a.buyerId.localeCompare(b.buyerId));
}
