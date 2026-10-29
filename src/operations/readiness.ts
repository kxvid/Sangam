import type { AcquisitionState, Summary } from '../acquisition/types';
import { eligibility, GENERAL_GATES, gateGood } from '../acquisition/policy';
import { cents } from './profit';
import { closingDays } from './queue';
import type { MarketReadiness, ReadinessCheck } from './types';

const ms = (value: string) => new Date(value).getTime();
export function buildMarketReadiness(state: AcquisitionState, summary: Summary, now: string, sourceHolds: Record<string, string> = {}): MarketReadiness {
  const occurred = (at: string) => ms(at) <= ms(now);
  const leads = state.leads.filter(item => !item.synthetic && occurred(item.importedAt));
  const leadIds = new Set(leads.map(item => item.id));
  const receipts = state.receipts.filter(item => !item.synthetic && occurred(item.occurredAt));
  const responses = state.responses.filter(item => !item.synthetic && occurred(item.occurredAt));
  const contracts = state.contracts.filter(item => !item.synthetic && leadIds.has(item.leadId) && occurred(item.signedAt));
  const contractIds = new Set(contracts.map(item => item.id));
  const closings = state.closings.filter(item => !item.synthetic && contractIds.has(item.contractId) && occurred(item.closedAt));
  const closedIds = new Set(closings.map(item => item.contractId));
  const assignments = state.assignments.filter(item => contractIds.has(item.contractId) && occurred(item.signedAt));
  const assignedIds = new Set(assignments.map(item => item.contractId));
  const activeContracts = contracts.filter(item => !item.termination && !closedIds.has(item.id));
  const collectedFees = cents(closings.reduce((sum, item) => sum + item.assignmentFee, 0));
  const recordedSpend = cents(receipts.reduce((sum, item) => sum + item.cost, 0) + closings.reduce((sum, item) => sum + item.expenses, 0) + state.expenses.filter(item => !item.synthetic && occurred(item.occurredAt)).reduce((sum, item) => sum + item.amount, 0));
  const openContractRisks = activeContracts.flatMap(contract => {
    const days = closingDays(contract.closingDate, now);
    return days <= 3 ? [{ contractId: contract.id, reason: days < 0 ? `Closing date ${contract.closingDate} has elapsed; verify an evidenced extension or actual outcome.` : `Closing is due ${contract.closingDate}; coordinate the remaining human steps.` }] : [];
  });
  const checklist: ReadinessCheck[] = GENERAL_GATES.map(name => {
    const gate = state.gates.find(item => item.name === name);
    return { id: `gate:${name}`, label: name === 'technical' ? 'Recorded release evidence' : name.replaceAll('_', ' '),
      status: gateGood(state, name, now) ? 'ready' : gate ? 'blocked' : 'not_recorded',
      detail: gateGood(state, name, now) ? `Current recorded review dated ${gate!.reviewedAt}.` : 'A reviewer must record current evidence for this scope.',
      evidenceReference: gate?.evidence ?? null, target: { tab: 'readiness' } };
  });
  const add = (id: string, label: string, ready: boolean, detail: string, tab: 'leads' | 'batches' | 'deals' | 'readiness') => checklist.push({ id, label, status: ready ? 'ready' : 'not_recorded', detail, evidenceReference: null, target: { tab } });
  const usableTemplates = state.templates.filter(item => item.status === 'approved' && item.reviewedAt && occurred(item.reviewedAt));
  const eligible = leads.filter(item => !sourceHolds[item.id] && (eligibility(state, item, 'mail', now).length === 0 || eligibility(state, item, 'call', now).length === 0));
  add('templates', 'Reviewed manual outreach templates', usableTemplates.length > 0, `${usableTemplates.length} approved template revisions are recorded. Each batch still needs exact review.`, 'batches');
  const sourceReady = leads.filter(item => !sourceHolds[item.id] && !!item.source && !!item.permissionReference);
  add('leads', 'Real source-backed leads', sourceReady.length > 0, `${sourceReady.length} of ${leads.length} real leads have source references and no current source hold. Source permission is rechecked at use.`, 'leads');
  const held = leads.filter(item => !!sourceHolds[item.id]);
  if (held.length) checklist.push({ id: 'source-holds', label: 'Current source restrictions', status: 'blocked', detail: `${held.length} real leads are held by current source permission or status. Review Sources before preparing outreach.`, evidenceReference: null, target: { tab: 'leads' } });
  add('recipients', 'Recipients ready for manual preparation', eligible.length > 0, `${eligible.length} leads pass current stored contact/gate checks; this does not approve a batch.`, 'leads');
  const permittedBuyers = state.buyers.filter(item => !item.synthetic && item.active && item.permissionReference && occurred(item.permissionAt) && !state.buyerReceipts.some(receipt => receipt.buyerId === item.id && receipt.outcome === 'opt_out') && !state.suppressions.some(suppression => suppression.buyerId === item.id || (!!suppression.phone && suppression.phone === item.phone) || (!!suppression.email && suppression.email.toLowerCase() === item.email.toLowerCase())));
  add('buyers', 'Permitted real buyer profiles', permittedBuyers.length > 0, `${permittedBuyers.length} active permitted buyers are recorded. Each contract still needs fit and packet review.`, 'deals');
  checklist.push({ id: 'private-pilot', label: 'Private pilot access', status: 'ready', detail: 'Verified sign-in and an administrator-provisioned workspace membership are required.', evidenceReference: null, target: null });
  checklist.push({ id: 'public-subscriptions', label: 'Public subscription sales', status: 'not_recorded', detail: 'Self-service onboarding and subscription billing are not part of this private pilot.', evidenceReference: null, target: null });
  checklist.push({ id: 'manual-operations', label: 'Manual execution', status: 'ready', detail: 'Mail, calling, buyer delivery, negotiation, signing and closing remain human-operated.', evidenceReference: null, target: null });
  return { asOf: now, launch: summary,
    funnel: { realLeads: leads.length, touchedLeads: new Set(receipts.filter(item => leadIds.has(item.leadId)).map(item => item.leadId)).size,
      conversationLeads: new Set([...receipts, ...responses].filter(item => leadIds.has(item.leadId) && ['conversation', 'appointment'].includes(item.outcome)).map(item => item.leadId)).size,
      qualifiedLeads: leads.filter(item => item.qualification && occurred(item.qualification.recordedAt)).length,
      offeredLeads: new Set(state.offers.filter(item => !item.synthetic && leadIds.has(item.leadId) && occurred(item.occurredAt)).map(item => item.leadId)).size,
      activeContracts: activeContracts.length,
      assignedContracts: activeContracts.filter(item => assignedIds.has(item.id)).length, closedContracts: closedIds.size },
    actuals: { collectedFees, recordedSpend, netRecordedCash: cents(collectedFees - recordedSpend) }, openContractRisks, checklist };
}
