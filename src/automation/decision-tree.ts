import { createHash } from 'node:crypto';
import type { Attribute, Evaluation, EvaluationContext, Node, Observation, Operand, Operator, RuleSet, Snapshot, Trace, Truth, Unit, Value, VersionComparison } from './engine-types';

export class RuleValidationError extends Error { constructor(message: string) { super(message); this.name = 'RuleValidationError'; } }
export const LIMITS = Object.freeze({ depth: 8, treeNodes: 256, children: 20, rankingRules: 64, attributes: 64, batchRecords: 1000, payloadBytes: 256_000 });
const UNITS: Unit[] = ['none', 'USD_cents', 'percent_0_100', 'count', 'years', 'days', 'sqft'];
const OPS: Operator[] = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'contains', 'contains_any', 'contains_all'];
const DAY = 86_400_000;
function invalid(message: string): never { throw new RuleValidationError(message); }
function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(`${label} must be an object.`);
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, required: string[], optional: string[] = []) {
  for (const key of Object.keys(value)) if (![...required, ...optional].includes(key)) invalid(`Unexpected field: ${key}.`);
  for (const key of required) if (!Object.hasOwn(value, key)) invalid(`Missing field: ${key}.`);
}
function string(value: unknown, label: string, maximum = 200): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) invalid(`${label} must be nonempty text, at most ${maximum} characters.`);
}
function finite(value: unknown, label: string, minimum = -1_000_000_000_000, maximum = 1_000_000_000_000): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) invalid(`${label} must be a finite number between ${minimum} and ${maximum}.`);
}
function timestamp(value: unknown, label: string): asserts value is string {
  string(value, label, 30);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) invalid(`${label} must be an ISO UTC timestamp.`);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value.replace(/(?<!\.\d{3})Z$/, '.000Z')) invalid(`${label} is not a valid calendar timestamp.`);
}
function fieldName(value: string) {
  if (!/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*){0,3}$/.test(value) || value.length > 80 || value.split('.').some(part => ['constructor', 'prototype', '__proto__'].includes(part))) invalid(`Unsafe or invalid attribute: ${value}.`);
}
function jsonInput(value: unknown) {
  const visiting = new Set<object>(); let nodes = 0;
  function visit(item: unknown, depth: number) {
    if (++nodes > 20_000 || depth > 40) invalid('JSON payload is too large or deep.');
    if (typeof item === 'number' && !Number.isFinite(item)) invalid('Nonfinite JSON numbers are not allowed.');
    if (item === null || ['string', 'number', 'boolean'].includes(typeof item)) return;
    if (!item || typeof item !== 'object') invalid('Rules and facts must contain JSON values only.');
    if (visiting.has(item)) invalid('Cyclic rules or facts are not allowed.');
    const prototype = Object.getPrototypeOf(item);
    if (!Array.isArray(item) && prototype !== Object.prototype && prototype !== null) invalid('Only plain JSON objects are allowed.');
    visiting.add(item);
    for (const [key, child] of Object.entries(item)) { if (['__proto__', 'constructor', 'prototype'].includes(key)) invalid('Unsafe JSON object key.'); visit(child, depth + 1); }
    visiting.delete(item);
  }
  visit(value, 0);
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > LIMITS.payloadBytes) invalid('JSON payload exceeds 256 KB.');
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
export function contentHash(value: unknown) { jsonInput(value); return createHash('sha256').update(canonical(value)).digest('hex'); }
function valueType(value: unknown): Attribute['type'] {
  if (typeof value === 'number') { finite(value, 'Attribute value'); return 'number'; }
  if (typeof value === 'string') { string(value, 'Attribute value', 500); return 'string'; }
  if (typeof value === 'boolean') return 'boolean';
  if (Array.isArray(value) && value.length <= 100 && value.every(item => typeof item === 'string' && item.length > 0 && item.length <= 100) && new Set(value).size === value.length) return 'string_set';
  return invalid('Attribute values must be numbers, strings, booleans or unique string sets. Null/missing facts must be explicitly unknown.');
}
function unitValue(value: Value, unit: Unit, definition?: Attribute) {
  const type = valueType(value);
  if (!UNITS.includes(unit)) invalid('Unknown attribute unit.');
  if (type !== 'number' && unit !== 'none') invalid('Text, boolean and set attributes must use unit none.');
  if (type === 'number') {
    if (unit === 'none') invalid('Numeric attributes require an explicit unit.');
    const number = value as number;
    if (number < 0) invalid('Input quantities cannot be negative.');
    if (['USD_cents', 'count'].includes(unit) && !Number.isSafeInteger(number)) invalid('Money in USD_cents and counts must be safe integers.');
    if (unit === 'percent_0_100' && number > 100) invalid('Percentages must use 0–100 units.');
    if (definition?.minimum !== undefined && number < definition.minimum) invalid('Attribute is below its declared minimum.');
    if (definition?.maximum !== undefined && number > definition.maximum) invalid('Attribute is above its declared maximum.');
  }
  if (definition && (type !== definition.type || unit !== definition.unit)) invalid('Attribute type/unit does not match the registered definition.');
  return type;
}
function operandDefinition(operand: Operand, attributes: Record<string, Attribute>): Pick<Attribute, 'type' | 'unit'> {
  const item = object(operand, 'Right operand');
  if (item.kind === 'attribute') {
    keys(item, ['kind', 'attribute']); string(item.attribute, 'Operand attribute'); fieldName(item.attribute);
    return attributes[item.attribute] ?? invalid(`Unknown operand attribute: ${item.attribute}.`);
  }
  if (item.kind !== 'literal') invalid('Operand kind must be attribute or literal.');
  keys(item, ['kind', 'value', 'unit']);
  const type = unitValue(item.value as Value, item.unit as Unit);
  return { type, unit: item.unit as Unit };
}
function compatible(left: Pick<Attribute, 'type' | 'unit'>, right: Pick<Attribute, 'type' | 'unit'>, op: Operator) {
  if (!OPS.includes(op)) invalid('Unsupported predicate operator; executable code is never accepted.');
  if (['gt', 'gte', 'lt', 'lte'].includes(op)) { if (left.type !== 'number' || right.type !== 'number' || left.unit !== right.unit) invalid('Numeric comparison requires matching numeric units.'); return; }
  if (['eq', 'neq'].includes(op)) { if (left.type === 'string_set' || left.type !== right.type || left.unit !== right.unit) invalid('Equality requires matching scalar types and units.'); return; }
  if (op === 'in' && left.type === 'string' && right.type === 'string_set') return;
  if (op === 'contains' && left.type === 'string_set' && right.type === 'string') return;
  if (['contains_any', 'contains_all'].includes(op) && left.type === 'string_set' && right.type === 'string_set') return;
  invalid('Set comparison has incompatible attribute types.');
}

export function validateRuleSet(input: unknown): RuleSet {
  jsonInput(input); const rule = object(input, 'Rule set');
  keys(rule, ['schemaVersion', 'workspaceId', 'id', 'revision', 'name', 'purpose', 'attributes', 'eligibility', 'ranking', 'minimumScore']);
  if (rule.schemaVersion !== 1) invalid('Unsupported rule schema version.');
  string(rule.workspaceId, 'Workspace ID'); string(rule.id, 'Rule ID'); string(rule.name, 'Rule name');
  finite(rule.revision, 'Rule revision', 1, 1_000_000); if (!Number.isInteger(rule.revision)) invalid('Rule revision must be an integer.');
  if (!['seller_research', 'buyer_fit'].includes(String(rule.purpose))) invalid('Unsupported rule purpose.');
  finite(rule.minimumScore, 'Minimum score', -10_000, 10_000);
  if (!Number.isInteger(rule.minimumScore)) invalid('Minimum score must use integer scoring units.');
  const attributes = object(rule.attributes, 'Attribute registry');
  if (!Object.keys(attributes).length || Object.keys(attributes).length > LIMITS.attributes) invalid('Rule needs 1–64 registered attributes.');
  for (const [name, raw] of Object.entries(attributes)) {
    fieldName(name); const definition = object(raw, 'Attribute definition');
    keys(definition, ['type', 'unit', 'label', 'maxAgeDays'], ['minimum', 'maximum']);
    if (!['number', 'string', 'boolean', 'string_set'].includes(String(definition.type))) invalid('Unknown attribute type.');
    if (!UNITS.includes(definition.unit as Unit) || (definition.type === 'number') === (definition.unit === 'none')) invalid('Attribute definition needs a unit appropriate to its type.');
    string(definition.label, 'Attribute label'); finite(definition.maxAgeDays, 'Maximum fact age', 0, 3650);
    for (const bound of ['minimum', 'maximum']) if (definition[bound] !== undefined) { if (definition.type !== 'number') invalid('Only numeric attributes can have numeric bounds.'); finite(definition[bound], bound, 0); }
    if (definition.minimum !== undefined && definition.maximum !== undefined && Number(definition.minimum) > Number(definition.maximum)) invalid('Attribute minimum exceeds maximum.');
  }
  const registered = attributes as Record<string, Attribute>, ids = new Set<string>(); let count = 0;
  function reserve(value: unknown) { string(value, 'Node/ranking ID', 80); if (ids.has(value)) invalid(`Duplicate rule node/ranking ID: ${value}.`); ids.add(value); }
  function tree(raw: unknown, depth: number) {
    if (depth > LIMITS.depth) invalid('Decision tree exceeds maximum depth of 8.');
    if (++count > LIMITS.treeNodes) invalid('Decision tree exceeds 256 nodes.');
    const node = object(raw, 'Decision node'); reserve(node.id); string(node.label, 'Decision label');
    if (node.kind === 'all' || node.kind === 'any') {
      keys(node, ['kind', 'id', 'label', 'children']);
      if (!Array.isArray(node.children) || node.children.length === 0 || node.children.length > LIMITS.children) invalid('ALL/ANY requires 1–20 children. Empty groups cannot authorize leads.');
      node.children.forEach(child => tree(child, depth + 1)); return;
    }
    if (node.kind === 'not') { keys(node, ['kind', 'id', 'label', 'child']); tree(node.child, depth + 1); return; }
    if (node.kind !== 'predicate') invalid('Unknown decision node kind.');
    keys(node, ['kind', 'id', 'label', 'attribute', 'op', 'right']); string(node.attribute, 'Predicate attribute'); fieldName(node.attribute);
    const definition = registered[node.attribute] ?? invalid(`Unknown attribute: ${node.attribute}.`);
    compatible(definition, operandDefinition(node.right as Operand, registered), node.op as Operator);
  }
  tree(rule.eligibility, 1);
  if (!Array.isArray(rule.ranking) || rule.ranking.length > LIMITS.rankingRules) invalid('Ranking must contain at most 64 scoring rules.');
  let maxMagnitude = 0;
  for (const raw of rule.ranking) { const item = object(raw, 'Ranking rule'); keys(item, ['id', 'label', 'when', 'points']); reserve(item.id); string(item.label, 'Ranking label'); finite(item.points, 'Ranking points', -1000, 1000); if (!Number.isInteger(item.points)) invalid('Ranking points must use integer scoring units.'); maxMagnitude += Math.abs(item.points); tree(item.when, 1); }
  if (maxMagnitude > 10_000) invalid('Total absolute scoring weight exceeds 10,000.');
  return structuredClone(input as RuleSet);
}

function validateInputs(rule: RuleSet, rawSnapshot: unknown, rawContext: unknown) {
  jsonInput(rawSnapshot); jsonInput(rawContext);
  const snapshot = object(rawSnapshot, 'Fact snapshot'); keys(snapshot, ['workspaceId', 'recordId', 'attributes']);
  string(snapshot.workspaceId, 'Snapshot workspace'); string(snapshot.recordId, 'Record ID'); const facts = object(snapshot.attributes, 'Snapshot facts');
  if (Object.keys(facts).length > 128) invalid('Snapshot exceeds 128 attributes.');
  for (const [name, raw] of Object.entries(facts)) {
    fieldName(name); const fact = object(raw, 'Observation');
    if (fact.state === 'unknown') { keys(fact, ['state', 'reason']); string(fact.reason, 'Unknown reason', 500); continue; }
    if (fact.state !== 'known') invalid('Observations must explicitly be known or unknown.');
    keys(fact, ['state', 'value', 'unit', 'sourceId', 'sourceRecordId', 'observedAt', 'permissionReference']);
    unitValue(fact.value as Value, fact.unit as Unit, rule.attributes[name]);
    string(fact.sourceId, 'Observation source'); string(fact.sourceRecordId, 'Source record ID'); string(fact.permissionReference, 'Source permission reference', 2000); timestamp(fact.observedAt, 'Observed timestamp');
  }
  const context = object(rawContext, 'Evaluation context'); keys(context, ['workspaceId', 'asOf', 'sourceGrants']);
  string(context.workspaceId, 'Context workspace'); timestamp(context.asOf, 'Evaluation timestamp');
  if (context.workspaceId !== rule.workspaceId || context.workspaceId !== snapshot.workspaceId) invalid('Workspace mismatch between rule, facts and evaluator.');
  if (!Array.isArray(context.sourceGrants) || context.sourceGrants.length > 50) invalid('Source grants must contain at most 50 sources.');
  const seen = new Set<string>();
  for (const raw of context.sourceGrants) {
    const grant = object(raw, 'Source grant'); keys(grant, ['workspaceId', 'sourceId', 'status', 'purposes', 'permissionReference', 'expiresAt']);
    if (grant.workspaceId !== context.workspaceId) invalid('Source grant belongs to a different workspace.');
    string(grant.sourceId, 'Grant source ID'); string(grant.permissionReference, 'Grant evidence', 2000);
    if (seen.has(grant.sourceId)) invalid('Duplicate source grant.'); seen.add(grant.sourceId);
    if (!['approved', 'revoked'].includes(String(grant.status))) invalid('Invalid source grant status.');
    if (!Array.isArray(grant.purposes) || !grant.purposes.length || grant.purposes.length > 2 || grant.purposes.some(purpose => !['seller_research', 'buyer_fit'].includes(String(purpose)))) invalid('Invalid source grant purpose.');
    if (grant.expiresAt !== null) timestamp(grant.expiresAt, 'Grant expiry');
  }
  return { snapshot: rawSnapshot as Snapshot, context: rawContext as EvaluationContext };
}
type Resolved = { known: true; value: Value; sourceRecordId?: string } | { known: false; reason: string };
function resolve(attribute: string, rule: RuleSet, snapshot: Snapshot, context: EvaluationContext): Resolved {
  const observation: Observation | undefined = snapshot.attributes[attribute];
  if (!observation) return { known: false, reason: `${rule.attributes[attribute].label}: no observation supplied` };
  if (observation.state === 'unknown') return { known: false, reason: `${rule.attributes[attribute].label}: ${observation.reason}` };
  const grant = context.sourceGrants.find(item => item.sourceId === observation.sourceId);
  if (!grant || grant.status !== 'approved' || grant.permissionReference !== observation.permissionReference || !grant.purposes.includes(rule.purpose) || (grant.expiresAt !== null && Date.parse(grant.expiresAt) <= Date.parse(context.asOf))) return { known: false, reason: `${rule.attributes[attribute].label}: source permission is missing, revoked, expired or outside the approved purpose` };
  const age = Date.parse(context.asOf) - Date.parse(observation.observedAt);
  if (age < 0) return { known: false, reason: `${rule.attributes[attribute].label}: observation is future-dated` };
  if (age > rule.attributes[attribute].maxAgeDays * DAY) return { known: false, reason: `${rule.attributes[attribute].label}: observation is stale` };
  return { known: true, value: observation.value, sourceRecordId: observation.sourceRecordId };
}
function compare(left: Value, right: Value, op: Operator): boolean {
  switch (op) {
    case 'eq': return left === right;
    case 'neq': return left !== right;
    case 'gt': return (left as number) > (right as number);
    case 'gte': return (left as number) >= (right as number);
    case 'lt': return (left as number) < (right as number);
    case 'lte': return (left as number) <= (right as number);
    case 'in': return (right as string[]).includes(left as string);
    case 'contains': return (left as string[]).includes(right as string);
    case 'contains_any': return (right as string[]).some(value => (left as string[]).includes(value));
    case 'contains_all': return (right as string[]).every(value => (left as string[]).includes(value));
  }
}
const OP_LABEL: Record<Operator, string> = { eq: 'equals', neq: 'does not equal', gt: 'is greater than', gte: 'is at least', lt: 'is less than', lte: 'is at most', in: 'is in', contains: 'contains', contains_any: 'overlaps', contains_all: 'contains all of' };
function runNode(node: Node, rule: RuleSet, snapshot: Snapshot, context: EvaluationContext): Trace {
  if (node.kind === 'all' || node.kind === 'any') {
    const children = node.children.map(child => runNode(child, rule, snapshot, context));
    const truth: Truth = node.kind === 'all' ? children.some(child => child.truth === 'false') ? 'false' : children.some(child => child.truth === 'unknown') ? 'unknown' : 'true' : children.some(child => child.truth === 'true') ? 'true' : children.some(child => child.truth === 'unknown') ? 'unknown' : 'false';
    return { id: node.id, label: node.label, truth, explanation: `${node.kind.toUpperCase()} evaluates to ${truth}; each branch remains visible below.`, children };
  }
  if (node.kind === 'not') { const child = runNode(node.child, rule, snapshot, context); const truth: Truth = child.truth === 'unknown' ? 'unknown' : child.truth === 'true' ? 'false' : 'true'; return { id: node.id, label: node.label, truth, explanation: `NOT ${child.truth} is ${truth}; unknown never becomes an approval.`, children: [child] }; }
  if (node.kind !== 'predicate') invalid('Unsupported node after rule validation.');
  const left = resolve(node.attribute, rule, snapshot, context);
  const right: Resolved = node.right.kind === 'literal' ? { known: true, value: node.right.value } : resolve(node.right.attribute, rule, snapshot, context);
  if (!left.known || !right.known) return { id: node.id, label: node.label, truth: 'unknown', attribute: node.attribute, explanation: [!left.known ? left.reason : '', !right.known ? right.reason : ''].filter(Boolean).join('; ') };
  const truth = compare(left.value, right.value, node.op) ? 'true' : 'false';
  const definition = rule.attributes[node.attribute];
  return { id: node.id, label: node.label, truth, attribute: node.attribute, sourceRecordIds: [left.sourceRecordId, right.sourceRecordId].filter((item): item is string => !!item), explanation: `${definition.label} (${JSON.stringify(left.value)} ${definition.unit}) ${OP_LABEL[node.op]} ${JSON.stringify(right.value)}: ${truth}.` };
}
export function evaluate(ruleInput: unknown, snapshotInput: unknown, contextInput: unknown): Evaluation {
  const rule = validateRuleSet(ruleInput), { snapshot, context } = validateInputs(rule, snapshotInput, contextInput);
  const eligibilityTrace = runNode(rule.eligibility, rule, snapshot, context);
  const rankingTrace = rule.ranking.map(item => { const trace = runNode(item.when, rule, snapshot, context); return { id: item.id, label: item.label, points: item.points, awarded: trace.truth === 'true' ? item.points : 0, trace }; });
  const observedScore = rankingTrace.reduce((sum, item) => sum + item.awarded, 0);
  const scoreRange = { minimum: observedScore + rankingTrace.filter(item => item.trace.truth === 'unknown' && item.points < 0).reduce((sum, item) => sum + item.points, 0), maximum: observedScore + rankingTrace.filter(item => item.trace.truth === 'unknown' && item.points > 0).reduce((sum, item) => sum + item.points, 0) };
  let decision: Evaluation['decision']; const reasons: string[] = [];
  if (eligibilityTrace.truth === 'false') { decision = 'excluded'; reasons.push('At least one required eligibility condition is definitively false.'); }
  else if (eligibilityTrace.truth === 'unknown') { decision = 'review'; reasons.push('Required eligibility facts are unknown, stale or not licensed for this purpose.'); }
  else if (scoreRange.minimum >= rule.minimumScore) { decision = 'eligible'; reasons.push('Eligibility is known true and the conservative score meets the threshold.'); }
  else if (scoreRange.maximum < rule.minimumScore) { decision = 'excluded'; reasons.push('Even the highest score permitted by unknown facts is below the threshold.'); }
  else { decision = 'review'; reasons.push('Missing ranking facts could change the threshold decision; gather evidence first.'); }
  return { recordId: snapshot.recordId, workspaceId: context.workspaceId, ruleId: rule.id, revision: rule.revision, ruleHash: contentHash(rule), factsHash: contentHash(snapshot), grantHash: contentHash([...context.sourceGrants].sort((a, b) => a.sourceId < b.sourceId ? -1 : a.sourceId > b.sourceId ? 1 : 0)), evaluatedAt: context.asOf, decision, hardEligibility: eligibilityTrace.truth, observedScore, scoreRange, minimumScore: rule.minimumScore, reasons, eligibilityTrace, rankingTrace, action: 'research_candidate_only' };
}
export function compareVersions(beforeInput: unknown, afterInput: unknown, snapshots: Snapshot[], context: EvaluationContext): VersionComparison {
  const before = validateRuleSet(beforeInput), after = validateRuleSet(afterInput);
  validateInputs(before, { workspaceId: context.workspaceId, recordId: 'dry-run-validation', attributes: {} }, context);
  if (before.id !== after.id || before.workspaceId !== after.workspaceId || before.purpose !== after.purpose || after.revision <= before.revision) invalid('Compare later revisions of the same workspace rule and purpose.');
  if (!Array.isArray(snapshots) || snapshots.length > LIMITS.batchRecords || new Set(snapshots.map(item => item.recordId)).size !== snapshots.length) invalid('Comparison supports at most 1,000 unique snapshot records.');
  const counts: VersionComparison['counts'] = { before: { eligible: 0, excluded: 0, review: 0 }, after: { eligible: 0, excluded: 0, review: 0 } };
  const changes = snapshots.map(snapshot => {
    const old = evaluate(before, snapshot, context), next = evaluate(after, snapshot, context);
    counts.before[old.decision]++; counts.after[next.decision]++;
    return { recordId: snapshot.recordId, beforeDecision: old.decision, afterDecision: next.decision, beforeScore: old.observedScore, afterScore: next.observedScore, beforeRange: old.scoreRange, afterRange: next.scoreRange, changed: old.decision !== next.decision || old.observedScore !== next.observedScore || old.scoreRange.minimum !== next.scoreRange.minimum || old.scoreRange.maximum !== next.scoreRange.maximum };
  });
  return { before: { id: before.id, revision: before.revision, hash: contentHash(before) }, after: { id: after.id, revision: after.revision, hash: contentHash(after) }, asOf: context.asOf, count: snapshots.length, changedCount: changes.filter(item => item.changed).length, changes, counts };
}
export function rankCandidates(rule: unknown, snapshots: Snapshot[], context: EvaluationContext): Evaluation[] {
  const validated = validateRuleSet(rule);
  validateInputs(validated, { workspaceId: context.workspaceId, recordId: 'ranking-validation', attributes: {} }, context);
  if (!Array.isArray(snapshots) || snapshots.length > LIMITS.batchRecords || new Set(snapshots.map(item => item.recordId)).size !== snapshots.length) invalid('Ranking supports at most 1,000 unique snapshot records.');
  return snapshots.map(snapshot => evaluate(validated, snapshot, context)).filter(result => result.decision === 'eligible').sort((a, b) => b.scoreRange.minimum - a.scoreRange.minimum || b.observedScore - a.observedScore || (a.recordId < b.recordId ? -1 : a.recordId > b.recordId ? 1 : 0));
}
