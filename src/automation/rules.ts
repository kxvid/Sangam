import type { Attribute, Node, RuleSet, Unit, Value } from './engine-types';
import { RuleValidationError, validateRuleSet } from './decision-tree';

export const DEFAULT_FARM_ZIPS = ['92501', '92503', '92505', '92507', '92401', '92404', '92408', '92410', '92551', '92553', '92555', '92335', '92336', '91761', '91762', '92376', '92324'];
const attribute = (label: string, type: Attribute['type'], unit: Unit = 'none', maxAgeDays = 30): Attribute => ({ label, type, unit, maxAgeDays });
const literal = (id: string, label: string, field: string, op: Extract<Node, {kind: 'predicate'}>['op'], value: Value, unit: Unit = 'none'): Node => ({ kind: 'predicate', id, label, attribute: field, op, right: { kind: 'literal', value, unit } });
const compareFields = (id: string, label: string, field: string, op: Extract<Node, {kind:'predicate'}>['op'], right: string): Node => ({ kind: 'predicate', id, label, attribute: field, op, right: { kind: 'attribute', attribute: right } });

/** Same seller motivation weights and threshold as the original IE pilot. */
function baseSellerRule(workspaceId: string): RuleSet {
  return {
    schemaVersion: 1, workspaceId, id: 'ie-seller-motivation', revision: 1, name: 'Inland Empire seller research', purpose: 'seller_research', minimumScore: 8,
    attributes: {
      'property.county': attribute('County', 'string'), 'property.zip': attribute('Property ZIP', 'string'),
      'policy.suppressed': attribute('Workspace contact suppression', 'boolean', 'none', 1),
      'property.tax_years': attribute('Tax delinquent years', 'number', 'years'), 'property.nod': attribute('Notice of default', 'boolean'),
      'property.vacant': attribute('Vacant property', 'boolean'), 'owner.absentee': attribute('Absentee owner', 'boolean'),
      'property.equity_pct': attribute('Estimated equity', 'number', 'percent_0_100'), 'owner.years_owned': attribute('Years owned', 'number', 'years'),
      'property.inherited': attribute('Inherited/probate flag', 'boolean'), 'property.code_violations': attribute('Code violations', 'boolean'),
    },
    eligibility: { kind: 'all', id: 'seller-hard-fit', label: 'Farm and suppression conditions', children: [
      literal('ie-county', 'In an Inland Empire county', 'property.county', 'in', ['Riverside', 'San Bernardino']),
      literal('starter-zip', 'In the starter farm', 'property.zip', 'in', DEFAULT_FARM_ZIPS),
      { kind: 'not', id: 'not-suppressed', label: 'Contact is not suppressed', child: literal('suppressed-state', 'Contact is suppressed', 'policy.suppressed', 'eq', true) },
    ] },
    ranking: [
      { id: 'tax-weight', label: 'Two years of tax distress', points: 3, when: literal('tax-check', 'Tax delinquent at least two years', 'property.tax_years', 'gte', 2, 'years') },
      { id: 'nod-weight', label: 'Notice of default', points: 4, when: literal('nod-check', 'NOD recorded', 'property.nod', 'eq', true) },
      { id: 'vacant-weight', label: 'Vacancy', points: 3, when: literal('vacant-check', 'Vacancy confirmed', 'property.vacant', 'eq', true) },
      { id: 'absentee-weight', label: 'Absentee owner', points: 2, when: literal('absentee-check', 'Absentee confirmed', 'owner.absentee', 'eq', true) },
      { id: 'equity-weight', label: 'At least 50% equity', points: 2, when: literal('equity-check', 'Equity at least 50%', 'property.equity_pct', 'gte', 50, 'percent_0_100') },
      { id: 'high-equity-weight', label: '70% equity bonus', points: 1, when: literal('high-equity-check', 'Equity at least 70%', 'property.equity_pct', 'gte', 70, 'percent_0_100') },
      { id: 'ownership-weight', label: 'Long ownership', points: 1, when: literal('ownership-check', 'Owned for ten years', 'owner.years_owned', 'gte', 10, 'years') },
      { id: 'inherited-weight', label: 'Inherited/probate flag', points: 2, when: literal('inherited-check', 'Inherited flag present', 'property.inherited', 'eq', true) },
      { id: 'code-weight', label: 'Code violations', points: 2, when: literal('code-check', 'Code violation recorded', 'property.code_violations', 'eq', true) },
    ],
  };
}

/** Buyer fit is a hard filter; the original 3+3+2+1 activity rubric ranks the survivors. */
function baseBuyerRule(workspaceId: string): RuleSet {
  return {
    schemaVersion: 1, workspaceId, id: 'buyer-buy-box', revision: 1, name: 'Buyer buy-box and observed activity', purpose: 'buyer_fit', minimumScore: 0,
    attributes: {
      'deal.zip': attribute('Deal ZIP', 'string'), 'deal.property_type': attribute('Property type', 'string'),
      'deal.ask_cents': attribute('Proposed total price', 'number', 'USD_cents'), 'deal.repairs_cents': attribute('Estimated repairs', 'number', 'USD_cents'),
      'buyer.zips': attribute('Target ZIPs', 'string_set'), 'buyer.property_types': attribute('Accepted property types', 'string_set'),
      'buyer.minimum_cents': attribute('Minimum purchase price', 'number', 'USD_cents'), 'buyer.maximum_cents': attribute('Maximum purchase price', 'number', 'USD_cents'),
      'buyer.rehab_maximum_cents': attribute('Maximum rehab budget', 'number', 'USD_cents'), 'buyer.rehab_unrestricted': attribute('Buyer explicitly accepts unlimited rehab', 'boolean'),
      'policy.buyer_permission': attribute('Buyer contact permission current', 'boolean', 'none', 1), 'policy.suppressed': attribute('Workspace suppression', 'boolean', 'none', 1),
      'buyer.recent_cash_purchase': attribute('Verified cash purchase within six calendar months', 'boolean'), 'buyer.cash_purchases_24m': attribute('Cash purchases in 24 months', 'number', 'count'),
      'buyer.purchased_farm_zip': attribute('Observed purchase in the farm', 'boolean'), 'buyer.entity': attribute('LLC or corporation buyer', 'boolean'),
    },
    eligibility: { kind: 'all', id: 'buyer-hard-fit', label: 'Required buy-box fit', children: [
      compareFields('zip-fit', 'Property ZIP fits', 'deal.zip', 'in', 'buyer.zips'),
      compareFields('type-fit', 'Property type fits', 'deal.property_type', 'in', 'buyer.property_types'),
      compareFields('minimum-fit', 'Above minimum price', 'deal.ask_cents', 'gte', 'buyer.minimum_cents'),
      compareFields('maximum-fit', 'Below maximum price', 'deal.ask_cents', 'lte', 'buyer.maximum_cents'),
      { kind: 'any', id: 'rehab-fit', label: 'Rehab appetite fits', children: [
        literal('unrestricted-rehab', 'Buyer explicitly accepts any rehab amount', 'buyer.rehab_unrestricted', 'eq', true),
        compareFields('rehab-cap', 'Repairs fit budget', 'deal.repairs_cents', 'lte', 'buyer.rehab_maximum_cents'),
      ] },
      literal('permission-current', 'Buyer contact permission is current', 'policy.buyer_permission', 'eq', true),
      literal('buyer-not-suppressed', 'Buyer is not suppressed', 'policy.suppressed', 'eq', false),
    ] },
    ranking: [
      { id: 'recent-weight', label: 'Recent verified cash purchase', points: 3, when: literal('recent-check', 'Cash purchase in six months', 'buyer.recent_cash_purchase', 'eq', true) },
      { id: 'repeat-weight', label: 'Repeated cash purchases', points: 3, when: literal('repeat-check', 'Three cash purchases in 24 months', 'buyer.cash_purchases_24m', 'gte', 3, 'count') },
      { id: 'farm-weight', label: 'Farm purchase history', points: 2, when: literal('farm-check', 'Past purchase in farm ZIP', 'buyer.purchased_farm_zip', 'eq', true) },
      { id: 'entity-weight', label: 'Entity buyer', points: 1, when: literal('entity-check', 'Verified LLC or corporation', 'buyer.entity', 'eq', true) },
    ],
  };
}

export type SellerRuleConfig = {farmZips?: string[]; minimumScore?: number; maxAgeDays?: number};

/** Trusted template builder. Arbitrary tenant JSON is validated again when published. */
export function createSellerRule(workspaceId: string, id = 'ie-seller-motivation', revision = 1, config: SellerRuleConfig = {}): RuleSet {
  if (Object.keys(config).some(key => !['farmZips', 'minimumScore', 'maxAgeDays'].includes(key))) throw new RuleValidationError('Unknown seller rule setting.');
  if (config.farmZips !== undefined && (!Array.isArray(config.farmZips) || !config.farmZips.length || config.farmZips.length > 100 || config.farmZips.some(zip => !/^\d{5}$/.test(zip)) || new Set(config.farmZips).size !== config.farmZips.length)) throw new RuleValidationError('Choose 1–100 unique five-digit farm ZIPs.');
  if (config.maxAgeDays !== undefined && (!Number.isInteger(config.maxAgeDays) || config.maxAgeDays < 1 || config.maxAgeDays > 30)) throw new RuleValidationError('Fact freshness must be 1–30 days.');
  if (config.minimumScore !== undefined && (!Number.isInteger(config.minimumScore) || config.minimumScore < 0 || config.minimumScore > 20)) throw new RuleValidationError('Seller minimum score must be an integer between 0 and 20.');
  const rule = baseSellerRule(workspaceId); rule.id = id; rule.revision = revision;
  rule.minimumScore = config.minimumScore ?? 8;
  if (config.farmZips) {
    const eligibility = rule.eligibility as Extract<Node, {kind: 'all' | 'any'}>;
    const farm = eligibility.children.find(child => child.id === 'starter-zip') as Extract<Node, {kind: 'predicate'}>;
    farm.right = {kind: 'literal', value: [...config.farmZips], unit: 'none'};
  }
  if (config.maxAgeDays !== undefined) for (const [name, attribute] of Object.entries(rule.attributes)) if (!name.startsWith('policy.')) attribute.maxAgeDays = config.maxAgeDays;
  return validateRuleSet(rule);
}

export function createBuyerRule(workspaceId: string, id = 'buyer-buy-box', revision = 1): RuleSet {
  return validateRuleSet({...baseBuyerRule(workspaceId), id, revision});
}
