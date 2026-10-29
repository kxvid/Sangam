import type { Summary } from '../acquisition/types';

export type ScenarioName = 'base' | 'downside' | 'upside';
export type ProfitInputs = {
  arv: number | null; repairs: number | null; rehabContingencyPercent: number | null;
  buyerClosingHoldingCosts: number | null; buyerProfitPercent: number | null;
  sellerPrice: number | null; buyerPrice: number | null; targetAssignmentFee: number | null;
  operatorClosingCosts: number | null; marketingBudget: number | null; otherDealCosts: number | null;
};
export type ProfitScenario = {
  id: string; leadId: string; name: ScenarioName; inputs: ProfitInputs;
  assumptions: string; recordedAt: string; actorId: string;
};
export type ProfitResult = {
  rehabContingency: number | null; buyerCeiling: number | null;
  maximumSellerOffer: number | null; assignmentSpread: number | null;
  projectedNet: number | null; buyerHeadroom: number | null;
  missing: (keyof ProfitInputs)[]; warnings: string[];
};
export type BuyerActivityKind = 'follow_up_planned' | 'conversation' | 'offer_received' | 'offer_withdrawn';
export type BuyerActivity = {
  id: string; contractId: string; buyerId: string; kind: BuyerActivityKind;
  occurredAt: string | null; dueAt: string | null; amount: number | null;
  reference: string; notes: string; completesTaskId: string | null;
  withdrawsOfferId: string | null; idempotencyKey: string; synthetic: boolean;
  recordedAt: string; actorId: string;
};
export type BuyerActivityInput = Omit<BuyerActivity, 'id' | 'synthetic' | 'recordedAt' | 'actorId'>;
export type BuyerPipelineRow = {
  contractId: string; buyerId: string; buyerName: string;
  stage: 'prepared' | 'delivered' | 'interested' | 'offered' | 'declined' | 'suppressed' | 'assigned' | 'closed' | 'contract_ended';
  lastActivityAt: string | null; nextDueAt: string | null;
  latestOffer: { activityId: string; amount: number; occurredAt: string } | null;
  plannedTaskId: string | null; blockers: string[];
};
export type QueueTarget = { tab: 'leads' | 'batches' | 'deals' | 'readiness'; leadId?: string; contractId?: string; buyerId?: string };
export type DailyWorkItem = {
  id: string; priority: number; title: string; reason: string; dueAt: string | null;
  state: 'ready' | 'blocked' | 'upcoming'; blockers: string[]; target: QueueTarget;
};
export type ReadinessCheck = {
  id: string; label: string; status: 'ready' | 'blocked' | 'not_recorded'; detail: string;
  evidenceReference: string | null; target: QueueTarget | null;
};
export type MarketReadiness = {
  asOf: string; launch: Summary;
  funnel: { realLeads: number; touchedLeads: number; conversationLeads: number; qualifiedLeads: number;
    offeredLeads: number; activeContracts: number; assignedContracts: number; closedContracts: number };
  actuals: { collectedFees: number; recordedSpend: number; netRecordedCash: number };
  openContractRisks: { contractId: string; reason: string }[];
  checklist: ReadinessCheck[];
};
