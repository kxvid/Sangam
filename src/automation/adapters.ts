import type { Buyer, Contract, Lead } from '../acquisition/types';
import { contentHash, evaluate, RuleValidationError, validateRuleSet } from './decision-tree';
import type { Evaluation, EvaluationContext, Observation, RuleSet, Snapshot, SourceGrant, Trace, Truth, Unit, Value } from './engine-types';

/** These contexts are trusted server inputs, never accepted from a browser request. */
export type SellerContext = EvaluationContext & {sourceId: string; suppressed: boolean; expectedSynthetic: boolean};
export type BuyerContext = SellerContext & {buyerSourceId: string; contractUnavailable: boolean};
export type ExplainedEvaluation = Evaluation & {platformTrace: Trace; platformHash: string; snapshot: Snapshot};
const POLICY_SOURCE = 'sangam-platform-policy';
const POLICY_REFERENCE = 'Sangam immutable research policy v1';
const DAY = 86_400_000;
const PLATFORM_MAX_AGE_DAYS = 30;
const unknown = (reason: string): Observation => ({state: 'unknown', reason});
const parsedTime = (value: string) => Date.parse(value);
function instant(value: string): string | null {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00.000Z` : value;
  if (!Number.isFinite(parsedTime(date))) return null;
  const normalized = new Date(date).toISOString();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value) && normalized.slice(0,10) !== value) return null;
  return normalized;
}
function fact(value: Value | null | undefined, unit: Unit, sourceId: string, recordId: string, observedAt: string, permissionReference: string): Observation {
  if (value === null || value === undefined || value === '') return unknown('No observation supplied.');
  const timestamp = instant(observedAt);
  if (!timestamp) return unknown('Observation date is missing or invalid.');
  if (!permissionReference.trim()) return unknown('Source permission reference is missing.');
  return {state: 'known', value, unit, sourceId, sourceRecordId: recordId, observedAt: timestamp, permissionReference};
}
function cents(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  const result = Math.round(value * 100);
  return Number.isSafeInteger(result) ? result : null;
}
function withPolicy(context: EvaluationContext): EvaluationContext {
  if (context.sourceGrants.some(grant => grant.sourceId === POLICY_SOURCE)) throw new RuleValidationError('The platform policy source ID is reserved.');
  return {workspaceId: context.workspaceId, asOf: context.asOf, sourceGrants: [...context.sourceGrants, {workspaceId: context.workspaceId, sourceId: POLICY_SOURCE, status: 'approved', purposes: ['seller_research', 'buyer_fit'], permissionReference: POLICY_REFERENCE, expiresAt: null}]};
}
const policyFact = (value: boolean | null | undefined, context: EvaluationContext): Observation => fact(value, 'none', POLICY_SOURCE, 'current-platform-policy', context.asOf, POLICY_REFERENCE);
function sourceCurrent(grant: SourceGrant | undefined, reference: string, purpose: RuleSet['purpose'], date: string, now: string): boolean {
  const timestamp = instant(date);
  const age = timestamp === null ? NaN : parsedTime(now) - parsedTime(timestamp);
  return !!grant && grant.status === 'approved' && grant.permissionReference === reference && grant.purposes.includes(purpose) && (grant.expiresAt === null || parsedTime(grant.expiresAt) > parsedTime(now)) && Number.isFinite(age) && age >= 0 && age <= PLATFORM_MAX_AGE_DAYS * DAY;
}
function check(id: string, label: string, truth: Truth, explanation: string): Trace { return {id, label, truth, explanation}; }
function boolCheck(id: string, label: string, value: boolean | undefined, failure: string): Trace {
  return check(id, label, value === undefined ? 'unknown' : value ? 'true' : 'false', value === undefined ? `${label}: authoritative status is missing.` : value ? `${label}: confirmed.` : failure);
}
function permissionCheck(id: string, label: string, current: boolean): Trace {
  return check(id, label, current ? 'true' : 'unknown', current ? `${label}: current source evidence confirmed.` : `${label}: source permission or observations are missing, revoked, expired, future-dated, or older than ${PLATFORM_MAX_AGE_DAYS} days.`);
}
function allTrace(id: string, label: string, children: Trace[]): Trace {
  const truth: Truth = children.some(child => child.truth === 'false') ? 'false' : children.some(child => child.truth === 'unknown') ? 'unknown' : 'true';
  return {id, label, truth, explanation: `${label}: ${truth}. These requirements cannot be removed by a workspace rule.`, children};
}
function sellerSnapshot(lead: Lead, context: SellerContext): Snapshot {
  const observation = (value: Value | null | undefined, unit: Unit = 'none') => fact(value, unit, context.sourceId, lead.id, lead.sourceDate, lead.permissionReference);
  return {workspaceId: context.workspaceId, recordId: lead.id, attributes: {
    'property.county': observation(lead.county), 'property.zip': observation(lead.zip), 'property.type': observation(lead.propertyType),
    'property.tax_years': observation(lead.signals.tax_delinquent_years, 'years'), 'property.nod': observation(lead.signals.nod),
    'property.vacant': observation(lead.signals.vacant), 'owner.absentee': observation(lead.signals.absentee),
    'property.equity_pct': observation(lead.signals.equity_pct, 'percent_0_100'), 'owner.years_owned': observation(lead.signals.years_owned, 'years'),
    'property.inherited': observation(lead.signals.inherited), 'property.code_violations': observation(lead.signals.code_violations),
    'policy.suppressed': policyFact(context.suppressed, context),
  }};
}
function sellerPlatform(lead: Lead, context: SellerContext, purpose: RuleSet['purpose']): Trace[] {
  return [
    boolCheck('platform-county', 'Within the Inland Empire pilot counties', ['Riverside','San Bernardino'].includes(lead.county), 'Property is outside Riverside and San Bernardino counties.'),
    boolCheck('platform-suppression', 'Not suppressed', typeof context.suppressed === 'boolean' ? !context.suppressed : undefined, 'A current workspace suppression excludes this research candidate.'),
    boolCheck('platform-practice', 'Practice and real records remain separate', typeof context.expectedSynthetic === 'boolean' ? lead.synthetic === context.expectedSynthetic : undefined, 'Practice and real records cannot be mixed.'),
    permissionCheck('platform-source', 'Source may be used for this research', sourceCurrent(context.sourceGrants.find(grant => grant.sourceId === context.sourceId), lead.permissionReference, purpose, lead.sourceDate, context.asOf)),
  ];
}
function finish(rule: RuleSet, snapshot: Snapshot, context: EvaluationContext, platform: Trace): ExplainedEvaluation {
  const result = evaluate(rule, snapshot, withPolicy(context));
  const eligibilityTrace = allTrace('platform-and-workspace-rule', 'Platform requirements and workspace decision tree', [platform, result.eligibilityTrace]);
  const decision: Evaluation['decision'] = eligibilityTrace.truth === 'false' || result.decision === 'excluded' ? 'excluded' : eligibilityTrace.truth === 'unknown' ? 'review' : result.decision;
  const reasons = platform.truth === 'true' ? result.reasons : [...(platform.children ?? []).filter(child => child.truth !== 'true').map(child => child.explanation), `Workspace rule score: ${result.observedScore}; immutable requirements still govern this decision.`, ...(result.decision === 'excluded' ? result.reasons : [])];
  return {...result, decision, hardEligibility: eligibilityTrace.truth, eligibilityTrace, reasons, platformTrace: platform, platformHash: contentHash({version:1, purpose:rule.purpose, maximumObservationAgeDays:PLATFORM_MAX_AGE_DAYS, platform}), snapshot};
}

/** A research classification, never permission to mail, call or deliver an assignment. */
export function evaluateSeller(ruleInput: RuleSet, lead: Lead, context: SellerContext): ExplainedEvaluation {
  const rule = validateRuleSet(ruleInput);
  if (rule.purpose !== 'seller_research') throw new RuleValidationError('Seller evaluation requires a seller_research rule purpose.');
  const snapshot = sellerSnapshot(lead, context);
  const platform = allTrace('seller-platform-policy', 'Immutable seller research requirements', sellerPlatform(lead, context, rule.purpose));
  return finish(rule, snapshot, context, platform);
}
function sixMonthsAgoDay(now: string): string {
  const current = new Date(now), day = current.getUTCDate();
  current.setUTCDate(1); current.setUTCMonth(current.getUTCMonth() - 6);
  const lastDay = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth()+1, 0)).getUTCDate();
  current.setUTCDate(Math.min(day,lastDay));
  return current.toISOString().slice(0,10);
}
function currentDay(now: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now));
  const map = Object.fromEntries(parts.map(item => [item.type,item.value]));
  return `${map.year}-${map.month}-${map.day}`;
}
function moneyCheck(id: string, label: string, actual: number | null, maximum: number | null, comparison: 'gte' | 'lte'): Trace {
  if (actual === null || maximum === null) return check(id,label,'unknown',`${label}: an explicit amount is missing; blank never means zero or unlimited.`);
  const result = comparison === 'gte' ? actual >= maximum : actual <= maximum;
  return check(id,label,result ? 'true' : 'false',`${label}: ${actual} USD_cents ${comparison === 'gte' ? '>=' : '<='} ${maximum} USD_cents is ${result}.`);
}
export function evaluateBuyer(ruleInput: RuleSet, buyer: Buyer, lead: Lead, contract: Contract, context: BuyerContext): ExplainedEvaluation {
  const rule = validateRuleSet(ruleInput);
  if (rule.purpose !== 'buyer_fit') throw new RuleValidationError('Buyer evaluation requires a buyer_fit rule purpose.');
  const snapshot = sellerSnapshot(lead,context); snapshot.recordId = `${contract.id}:${buyer.id}`;
  const buyerFact = (value: Value | null | undefined, unit: Unit = 'none') => fact(value, unit, context.buyerSourceId, buyer.id, buyer.updatedAt, buyer.permissionReference);
  // Underwriting and signed terms are workspace records; their provenance is the current server-owned policy context.
  const dealFact = (value: Value | null, unit: Unit = 'none', at = contract.signedAt) => fact(value, unit, POLICY_SOURCE, contract.id, at, POLICY_REFERENCE);
  const price = cents(contract.price), fee = cents(lead.underwriting?.assignmentFee);
  const ask = price === null || fee === null ? null : price + fee;
  const repairs = cents(lead.underwriting?.repairs), rehabMaximum = cents(buyer.rehabMax);
  const buyerSourceCurrent = sourceCurrent(context.sourceGrants.find(grant=>grant.sourceId === context.buyerSourceId), buyer.permissionReference, rule.purpose, buyer.updatedAt, context.asOf);
  const permissionAt = instant(buyer.permissionAt);
  const permission = !!buyer.permissionReference.trim() && permissionAt !== null && parsedTime(permissionAt) <= parsedTime(context.asOf) && buyerSourceCurrent;
  const lastPurchase = buyer.lastCashPurchaseDate ? instant(buyer.lastCashPurchaseDate) : null;
  const recent = lastPurchase === null || parsedTime(lastPurchase) > parsedTime(context.asOf) ? null : lastPurchase.slice(0,10) >= sixMonthsAgoDay(context.asOf);
  Object.assign(snapshot.attributes, {
    'deal.zip': snapshot.attributes['property.zip'], 'deal.property_type': snapshot.attributes['property.type'],
    'deal.ask_cents': dealFact(ask,'USD_cents'), 'deal.repairs_cents': dealFact(repairs,'USD_cents',lead.underwriting?.recordedAt ?? contract.signedAt),
    'buyer.zips': buyerFact(buyer.zips), 'buyer.property_types': buyerFact(buyer.propertyTypes.map(value=>value.toUpperCase())),
    'buyer.minimum_cents': buyerFact(cents(buyer.minPrice),'USD_cents'), 'buyer.maximum_cents': buyerFact(cents(buyer.maxPrice),'USD_cents'),
    'buyer.rehab_maximum_cents': buyerFact(rehabMaximum,'USD_cents'), 'buyer.rehab_unrestricted': buyerFact(false),
    'policy.buyer_permission': policyFact(permission ? true : null,context),
    'buyer.recent_cash_purchase': buyerFact(recent), 'buyer.cash_purchases_24m': buyerFact(buyer.cashPurchases24m,'count'),
    'buyer.purchased_farm_zip': buyerFact(buyer.purchasedFarmZip), 'buyer.entity': buyerFact(buyer.entity),
  });
  const contractDate = instant(contract.signedAt), underwritingDate = lead.underwriting ? instant(lead.underwriting.recordedAt) : null;
  const checks = [
    ...sellerPlatform(lead,context,rule.purpose),
    boolCheck('platform-buyer-practice','Buyer and contract belong to the same practice mode',buyer.synthetic === lead.synthetic && contract.synthetic === lead.synthetic,'Buyer, seller and contract practice modes do not match.'),
    boolCheck('platform-buyer-active','Buyer is active',buyer.active,'Buyer is inactive.'),
    permissionCheck('platform-buyer-source','Buyer source may be used for matching',buyerSourceCurrent),
    permissionCheck('platform-buyer-permission','Recorded buyer permission is current',permission),
    boolCheck('platform-contract-link','Contract belongs to this seller',contract.leadId === lead.id,'Contract and seller IDs do not match.'),
    boolCheck('platform-contract-active','Contract is active and assignable',!contract.termination && contract.assignable === true && !!contract.reference.trim() && !!contract.disclosuresReference.trim() && contract.closingDate >= currentDay(context.asOf) && contractDate !== null && parsedTime(contractDate) <= parsedTime(context.asOf),'Contract is cancelled, expired, future-dated or lacks assignability/disclosure evidence.'),
    boolCheck('platform-contract-unfinished','Contract is not already assigned or closed',typeof context.contractUnavailable === 'boolean' ? !context.contractUnavailable : undefined,'This contract is already assigned or closed.'),
    boolCheck('platform-zip-fit','Property ZIP fits the buyer profile',buyer.zips.includes(lead.zip),'Property ZIP is outside this buyer’s buy box.'),
    boolCheck('platform-type-fit','Property type fits the buyer profile',buyer.propertyTypes.map(value=>value.toUpperCase()).includes(lead.propertyType.toUpperCase()),'Property type is outside this buyer’s buy box.'),
    moneyCheck('platform-minimum-price','Total price meets buyer minimum',ask,cents(buyer.minPrice),'gte'),
    moneyCheck('platform-maximum-price','Total price fits buyer maximum',ask,cents(buyer.maxPrice),'lte'),
    moneyCheck('platform-rehab-fit','Repairs fit explicit buyer rehab budget',repairs,rehabMaximum,'lte'),
    permissionCheck('platform-underwriting-current','Underwriting observations are current',underwritingDate !== null && parsedTime(context.asOf)-parsedTime(underwritingDate) >= 0 && parsedTime(context.asOf)-parsedTime(underwritingDate) <= PLATFORM_MAX_AGE_DAYS*DAY),
  ];
  return finish(rule,snapshot,context,allTrace('buyer-platform-policy','Immutable buyer matching requirements',checks));
}
