import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, compareVersions, rankCandidates, RuleValidationError } from '../src/automation/decision-tree';
import type { EvaluationContext, Node, RuleSet, Snapshot } from '../src/automation/engine-types';

const asOf = '2026-10-28T16:00:00.000Z';
const context: EvaluationContext = { workspaceId: 'workspace-a', asOf, sourceGrants: [{ workspaceId: 'workspace-a', sourceId: 'authorized-csv', status: 'approved', purposes: ['seller_research', 'buyer_fit'], permissionReference: 'license-fixture', expiresAt: '2026-12-01T00:00:00.000Z' }] };
const predicate: Node = { kind: 'predicate', id: 'has-equity', label: 'At least 50% equity', attribute: 'property.equity_pct', op: 'gte', right: { kind: 'literal', value: 50, unit: 'percent_0_100' } };
const rule: RuleSet = { schemaVersion: 1, workspaceId: 'workspace-a', id: 'ie-sellers', revision: 1, name: 'IE sellers', purpose: 'seller_research', attributes: { 'property.equity_pct': { type: 'number', unit: 'percent_0_100', label: 'Estimated equity', maxAgeDays: 30 }, 'property.vacant': { type: 'boolean', unit: 'none', label: 'Vacant', maxAgeDays: 30 } }, eligibility: predicate, ranking: [{ id: 'vacancy-points', label: 'Vacant motivation', when: { kind: 'predicate', id: 'is-vacant', label: 'Known vacancy', attribute: 'property.vacant', op: 'eq', right: { kind: 'literal', value: true, unit: 'none' } }, points: 3 }], minimumScore: 0 };
const known = (value: number | boolean | string | string[], unit: 'none' | 'percent_0_100' | 'USD_cents' = 'none') => ({ state: 'known' as const, value, unit, sourceId: 'authorized-csv', sourceRecordId: 'fixture-row-1', observedAt: '2026-10-27T16:00:00.000Z', permissionReference: 'license-fixture' });
const snapshot: Snapshot = { workspaceId: 'workspace-a', recordId: 'parcel-1', attributes: { 'property.equity_pct': known(70, 'percent_0_100'), 'property.vacant': known(true) } };

test('hard eligibility and ranking produce a deterministic explained decision', () => {
  const result = evaluate(rule, snapshot, context);
  assert.equal(result.decision, 'eligible'); assert.equal(result.observedScore, 3);
  assert.deepEqual(result.scoreRange, { minimum: 3, maximum: 3 });
  assert.equal(result.eligibilityTrace.truth, 'true');
  assert.match(result.eligibilityTrace.explanation, /Estimated equity/);
  assert.equal(result.action, 'research_candidate_only');
  assert.deepEqual(evaluate(rule, snapshot, context), result);
});
test('unknown facts remain unknown through NOT and cannot authorize eligibility', () => {
  const changed = structuredClone(rule); changed.eligibility = { kind: 'not', id: 'not-low', label: 'Not below equity limit', child: predicate };
  const missing = { ...snapshot, attributes: { 'property.vacant': known(true) } };
  assert.equal(evaluate(changed, missing, context).decision, 'review');
  assert.equal(evaluate(changed, missing, context).hardEligibility, 'unknown');
});
test('ALL and ANY use three-valued logic rather than treating missing values as false', () => {
  const vacancy = rule.ranking[0].when;
  const oneUnknown = { ...snapshot, attributes: { 'property.vacant': known(true) } };
  assert.equal(evaluate({ ...rule, eligibility: { kind: 'any', id: 'any-signal', label: 'Any known signal', children: [predicate, vacancy] }, ranking: [] }, oneUnknown, context).decision, 'eligible');
  assert.equal(evaluate({ ...rule, eligibility: { kind: 'all', id: 'both-signals', label: 'Both known signals', children: [predicate, vacancy] }, ranking: [] }, oneUnknown, context).decision, 'review');
});
test('unknown ranking criteria cannot manufacture threshold approval or hide negative penalties', () => {
  const missing = { ...snapshot, attributes: { 'property.equity_pct': known(70, 'percent_0_100') } };
  const threshold = evaluate({ ...rule, minimumScore: 2 }, missing, context);
  assert.equal(threshold.decision, 'review'); assert.deepEqual(threshold.scoreRange, { minimum: 0, maximum: 3 });
  const penalty = evaluate({ ...rule, ranking: [{ ...rule.ranking[0], points: -3 }], minimumScore: 0 }, missing, context);
  assert.equal(penalty.decision, 'review'); assert.deepEqual(penalty.scoreRange, { minimum: -3, maximum: 0 });
});
test('numeric units cannot be mixed or implicitly coerced', () => {
  const wrong = structuredClone(snapshot); wrong.attributes['property.equity_pct'] = known(70, 'USD_cents');
  assert.throws(() => evaluate(rule, wrong, context), /unit/i);
  const badRule = structuredClone(rule); (badRule.eligibility as Extract<Node, {kind:'predicate'}>).right = { kind: 'literal', value: 50, unit: 'USD_cents' };
  assert.throws(() => evaluate(badRule, snapshot, context), /unit/i);
});
test('expired, revoked, unauthorized-purpose and stale source evidence produce review, never a green lead', () => {
  for (const grant of [ { ...context.sourceGrants[0], status: 'revoked' as const }, { ...context.sourceGrants[0], expiresAt: '2026-10-01T00:00:00.000Z' }, { ...context.sourceGrants[0], purposes: ['buyer_fit' as const] } ]) {
    assert.equal(evaluate(rule, snapshot, { ...context, sourceGrants: [grant] }).decision, 'review');
  }
  const stale = structuredClone(snapshot); stale.attributes['property.equity_pct'] = { ...known(70, 'percent_0_100'), observedAt: '2026-09-01T16:00:00.000Z' };
  assert.equal(evaluate(rule, stale, context).decision, 'review');
});
test('workspace scope is checked independently for rule, snapshot and approved source', () => {
  assert.throws(() => evaluate({ ...rule, workspaceId: 'workspace-b' }, snapshot, context), /workspace/i);
  assert.throws(() => evaluate(rule, { ...snapshot, workspaceId: 'workspace-b' }, context), /workspace/i);
  assert.throws(() => evaluate(rule, snapshot, { ...context, sourceGrants: [{ ...context.sourceGrants[0], workspaceId: 'workspace-b' }] }), /workspace/i);
});
test('customer minimum/maximum prices compare typed attributes instead of untyped strings', () => {
  const buyerRule: RuleSet = { ...rule, purpose: 'buyer_fit', attributes: { 'deal.ask': { type: 'number', unit: 'USD_cents', label: 'Deal asking price', maxAgeDays: 30 }, 'buyer.maximum': { type: 'number', unit: 'USD_cents', label: 'Maximum price', maxAgeDays: 30 } }, eligibility: { kind: 'predicate', id: 'fits-price', label: 'Fits buyer maximum', attribute: 'deal.ask', op: 'lte', right: { kind: 'attribute', attribute: 'buyer.maximum' } }, ranking: [] };
  assert.equal(evaluate(buyerRule, { ...snapshot, attributes: { 'deal.ask': known(30_000_000, 'USD_cents'), 'buyer.maximum': known(35_000_000, 'USD_cents') } }, context).decision, 'eligible');
  assert.equal(evaluate(buyerRule, { ...snapshot, attributes: { 'deal.ask': known(40_000_000, 'USD_cents'), 'buyer.maximum': known(35_000_000, 'USD_cents') } }, context).decision, 'excluded');
});
test('version comparison is a dry run that reports who changes without mutating source data', () => {
  const after: RuleSet = { ...structuredClone(rule), revision: 2, minimumScore: 4 };
  const beforeText = JSON.stringify(snapshot);
  const result = compareVersions(rule, after, [snapshot], context);
  assert.equal(result.changedCount, 1); assert.equal(result.changes[0].beforeDecision, 'eligible'); assert.equal(result.changes[0].afterDecision, 'excluded');
  assert.equal(JSON.stringify(snapshot), beforeText);
  assert.equal(result.counts.before.eligible, 1); assert.equal(result.counts.after.excluded, 1);
});
test('ranked candidates exclude holds/rejections and use stable tie breaking', () => {
  const second = { ...snapshot, recordId: 'parcel-0' };
  const hold = { ...snapshot, recordId: 'parcel-unknown', attributes: {} };
  assert.deepEqual(rankCandidates(rule, [snapshot, hold, second], context).map(item => item.recordId), ['parcel-0', 'parcel-1']);
});
test('untrusted rules reject deep trees, duplicate IDs, unknown fields and executable operators', () => {
  let tree: Node = predicate; for (let i = 0; i < 12; i++) tree = { kind: 'not', id: `not-${i}`, label: 'Nested not', child: tree };
  assert.throws(() => evaluate({ ...rule, eligibility: tree }, snapshot, context), /depth|deep/i);
  assert.throws(() => evaluate({ ...rule, eligibility: { kind: 'all', id: 'duplicates', label: 'Duplicates', children: [predicate, predicate] } }, snapshot, context), /duplicate/i);
  assert.throws(() => evaluate({ ...rule, eligibility: { ...predicate, op: 'eval' } }, snapshot, context), RuleValidationError);
  assert.throws(() => evaluate({ ...rule, attributes: { 'constructor.prototype': rule.attributes['property.vacant'] } }, snapshot, context), /attribute/i);
});
test('fractional scoring is rejected so floating-point rounding cannot flip a threshold decision', () => {
  assert.throws(() => evaluate({ ...rule, minimumScore: 0.8 }, snapshot, context), /integer/i);
  assert.throws(() => evaluate({ ...rule, ranking: [{ ...rule.ranking[0], points: 0.1 }] }, snapshot, context), /integer/i);
});

import { createSellerRule, createBuyerRule } from '../src/automation/rules';
import { evaluateSeller, evaluateBuyer, type SellerContext, type BuyerContext } from '../src/automation/adapters';
import type { Lead, Buyer, Contract } from '../src/acquisition/types';

const lead: Lead = {
  id: 'synthetic-lead-1', county: 'Riverside', apn: 'PRACTICE-001', address: '100 Fictional Street', city: 'Riverside', zip: '92501', ownerName: 'Fictional Owner', mailingAddress: '100 Fictional Street', phone: '', email: '', propertyType: 'SFR', estimatedValue: 400000,
  signals: {tax_delinquent_years:2,nod:false,vacant:true,absentee:true,equity_pct:70,years_owned:11,inherited:false,code_violations:false}, score:12, breakdown:{}, source:'Authorized practice export', sourceDate:'2026-10-27', permissionReference:'license-fixture', importHash:'fixture-hash', synthetic:true, importedAt:asOf, updatedAt:asOf, notes:'', contact:null, qualification:null,
  underwriting: {arv:400000, repairs:50000, closingCosts:10000, assignmentFee:15000, profitPercent:0.2, compReferences:['fixture-1','fixture-2','fixture-3'], mao:250000, recordedAt:asOf},
};
const buyer: Buyer = {id:'synthetic-buyer-1',name:'Fictional Buyer',email:'',phone:'',zips:['92501'],minPrice:200000,maxPrice:300000,propertyTypes:['SFR'],rehabMax:75000,permissionReference:'buyer-license-fixture',permissionAt:asOf,sourceReference:'Manually recorded fictional preferences',synthetic:true,active:true,cashPurchases24m:4,lastCashPurchaseDate:'2026-10-01',entity:true,purchasedFarmZip:true,updatedAt:asOf};
const contract: Contract = {id:'synthetic-contract-1',leadId:lead.id,offerId:'synthetic-offer-1',price:270000,signedAt:asOf,reference:'FICTIONAL signed contract',assignable:true,disclosuresReference:'FICTIONAL disclosures',closingDate:'2026-11-30',amendments:[],termination:null,synthetic:true,createdAt:asOf};
const sellerContext: SellerContext = {...context,sourceId:'authorized-csv',suppressed:false,expectedSynthetic:true};
const buyerContext: BuyerContext = {...sellerContext,buyerSourceId:'buyer-manual',contractUnavailable:false,sourceGrants:[...context.sourceGrants,{workspaceId:context.workspaceId,sourceId:'buyer-manual',status:'approved',purposes:['buyer_fit'],permissionReference:buyer.permissionReference,expiresAt:null}]};
const permissive = (purpose: RuleSet['purpose']): RuleSet => ({...rule,purpose,minimumScore:0,attributes:{'property.zip':{type:'string',unit:'none',label:'ZIP',maxAgeDays:3650}},eligibility:{kind:'predicate',id:'any-zip',label:'Known ZIP',attribute:'property.zip',op:'eq',right:{kind:'literal',value:'92501',unit:'none'}},ranking:[]});

test('seller adapter preserves original 12-point rubric with provenance and immutable checks', () => {
  const result=evaluateSeller(createSellerRule(context.workspaceId),lead,sellerContext);
  assert.equal(result.decision,'eligible'); assert.equal(result.observedScore,12);
  assert.equal(result.platformTrace.truth,'true'); assert.equal(result.snapshot.attributes['property.vacant'].state,'known');
  assert.equal(result.platformHash.length,64); assert.deepEqual(evaluateSeller(createSellerRule(context.workspaceId),lead,sellerContext),result);
});
test('custom seller rules cannot bypass suppression, county, synthetic parity or current source permission', () => {
  const custom=permissive('seller_research');
  assert.equal(evaluateSeller(custom,lead,{...sellerContext,suppressed:true}).decision,'excluded');
  assert.equal(evaluateSeller(custom,{...lead,county:'Los Angeles'},sellerContext).decision,'excluded');
  assert.equal(evaluateSeller(custom,lead,{...sellerContext,expectedSynthetic:false}).decision,'excluded');
  assert.equal(evaluateSeller(custom,lead,{...sellerContext,sourceGrants:[]}).decision,'review');
  assert.equal(evaluateSeller(custom,lead,{...sellerContext,sourceGrants:context.sourceGrants.map(grant=>({...grant,status:'revoked'}))}).decision,'review');
  assert.equal(evaluateSeller(custom,{...lead,sourceDate:'2026-08-01'},sellerContext).decision,'review');
});
test('buyer adapter includes assignment fee in price and makes missing rehab appetite a review hold', () => {
  const result=evaluateBuyer(createBuyerRule(context.workspaceId),buyer,lead,contract,buyerContext);
  assert.equal(result.decision,'eligible'); assert.equal(result.observedScore,9);
  assert.equal(evaluateBuyer(createBuyerRule(context.workspaceId),{...buyer,maxPrice:280000},lead,contract,buyerContext).decision,'excluded');
  assert.equal(evaluateBuyer(createBuyerRule(context.workspaceId),{...buyer,rehabMax:null},lead,contract,buyerContext).decision,'review');
  assert.equal(evaluateBuyer(createBuyerRule(context.workspaceId),buyer,{...lead,underwriting:null},contract,buyerContext).decision,'review');
});
test('custom buyer rules cannot bypass buy box, completed contracts, suppression or synthetic parity', () => {
  const custom=permissive('buyer_fit');
  assert.equal(evaluateBuyer(custom,{...buyer,zips:['99999']},lead,contract,buyerContext).decision,'excluded');
  assert.equal(evaluateBuyer(custom,{...buyer,rehabMax:1000},lead,contract,buyerContext).decision,'excluded');
  assert.equal(evaluateBuyer(custom,{...buyer,rehabMax:null},lead,contract,buyerContext).decision,'review');
  assert.equal(evaluateBuyer(custom,buyer,lead,contract,{...buyerContext,contractUnavailable:true}).decision,'excluded');
  assert.equal(evaluateBuyer(custom,buyer,lead,contract,{...buyerContext,suppressed:true}).decision,'excluded');
  assert.equal(evaluateBuyer(custom,{...buyer,synthetic:false},lead,contract,buyerContext).decision,'excluded');
  assert.equal(evaluateBuyer(custom,buyer,lead,{...contract,leadId:'different-lead'},buyerContext).decision,'excluded');
  assert.equal(evaluateBuyer(custom,buyer,lead,{...contract,closingDate:'2026-10-01'},buyerContext).decision,'excluded');
});
test('adapter policy attributes are authoritative and reserved grants cannot be supplied', () => {
  assert.throws(()=>evaluateSeller(createSellerRule(context.workspaceId),lead,{...sellerContext,sourceGrants:[...context.sourceGrants,{...context.sourceGrants[0],sourceId:'sangam-platform-policy'}]}),/reserved/i);
  assert.throws(()=>evaluateSeller(createBuyerRule(context.workspaceId),lead,sellerContext),/purpose/i);
});
test('calendar-month buyer activity uses a clamped six-month boundary and missing activity remains unknown', () => {
  const august='2026-08-31T16:00:00.000Z';
  const augustLead={...lead,sourceDate:'2026-08-30',underwriting:{...lead.underwriting!,recordedAt:august}};
  const augustBuyer={...buyer,permissionAt:august,updatedAt:august,lastCashPurchaseDate:'2026-02-28'};
  const augustContract={...contract,signedAt:august,createdAt:august};
  const result=evaluateBuyer(createBuyerRule(context.workspaceId),augustBuyer,augustLead,augustContract,{...buyerContext,asOf:august});
  assert.equal(result.observedScore,9);
  const unknown=evaluateBuyer(createBuyerRule(context.workspaceId),{...buyer,lastCashPurchaseDate:null,cashPurchases24m:null,entity:null,purchasedFarmZip:null},lead,contract,buyerContext);
  assert.equal(unknown.decision,'eligible'); assert.deepEqual(unknown.scoreRange,{minimum:0,maximum:9});
});

test('source revocation and missing authoritative contract state cannot be bypassed by a permissive buyer rule', () => {
  const custom=permissive('buyer_fit');
  const revoked={...buyerContext,sourceGrants:buyerContext.sourceGrants.map(grant=>grant.sourceId==='buyer-manual'?{...grant,status:'revoked' as const}:grant)};
  assert.equal(evaluateBuyer(custom,buyer,lead,contract,revoked).decision,'review');
  const missing={...buyerContext} as Partial<BuyerContext>; delete missing.contractUnavailable;
  assert.equal(evaluateBuyer(custom,buyer,lead,contract,missing as BuyerContext).decision,'review');
  const stale={...lead,underwriting:{...lead.underwriting!,recordedAt:'2026-08-01T00:00:00.000Z'}};
  assert.equal(evaluateBuyer(custom,buyer,stale,contract,buyerContext).decision,'review');
});
test('changing mandatory platform inputs changes audit hashes even when workspace rules ignore them', () => {
  const custom=permissive('seller_research');
  const eligible=evaluateSeller(custom,lead,sellerContext);
  const suppressed=evaluateSeller(custom,lead,{...sellerContext,suppressed:true});
  assert.notEqual(eligible.factsHash,suppressed.factsHash);
  assert.notEqual(eligible.platformHash,suppressed.platformHash);
  assert.ok(suppressed.reasons.every(reason=>!reason.includes('Eligibility is known true')));
});
test('seller template config validates farm and freshness without changing the fixed Inland Empire counties', () => {
  const configured=createSellerRule(context.workspaceId,'seller-rule',2,{farmZips:['92503'],minimumScore:12,maxAgeDays:7});
  assert.equal(configured.revision,2); assert.equal(configured.minimumScore,12);
  assert.equal(evaluateSeller(configured,lead,sellerContext).decision,'excluded');
  assert.throws(()=>createSellerRule(context.workspaceId,undefined,undefined,{farmZips:['92501','92501']}),/unique/i);
  assert.throws(()=>createSellerRule(context.workspaceId,undefined,undefined,{maxAgeDays:31}),/freshness/i);
});
