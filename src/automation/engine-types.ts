export type Truth = 'true' | 'false' | 'unknown';
export type Unit = 'none' | 'USD_cents' | 'percent_0_100' | 'count' | 'years' | 'days' | 'sqft';
export type Value = string | number | boolean | string[];
export type Attribute = { type: 'number' | 'string' | 'boolean' | 'string_set'; unit: Unit; label: string; maxAgeDays: number; minimum?: number; maximum?: number };
export type Operand = { kind: 'literal'; value: Value; unit: Unit } | { kind: 'attribute'; attribute: string };
export type Operator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains' | 'contains_any' | 'contains_all';
export type Node =
  | { kind: 'all' | 'any'; id: string; label: string; children: Node[] }
  | { kind: 'not'; id: string; label: string; child: Node }
  | { kind: 'predicate'; id: string; label: string; attribute: string; op: Operator; right: Operand };
export type RuleSet = {
  schemaVersion: 1; workspaceId: string; id: string; revision: number; name: string;
  purpose: 'seller_research' | 'buyer_fit'; attributes: Record<string, Attribute>;
  eligibility: Node; ranking: Array<{ id: string; label: string; when: Node; points: number }>;
  minimumScore: number;
};
export type Observation =
  | { state: 'known'; value: Value; unit: Unit; sourceId: string; sourceRecordId: string; observedAt: string; permissionReference: string }
  | { state: 'unknown'; reason: string };
export type Snapshot = { workspaceId: string; recordId: string; attributes: Record<string, Observation> };
export type SourceGrant = { workspaceId: string; sourceId: string; status: 'approved' | 'revoked'; purposes: RuleSet['purpose'][]; permissionReference: string; expiresAt: string | null };
export type EvaluationContext = { workspaceId: string; asOf: string; sourceGrants: SourceGrant[] };
export type Trace = { id: string; label: string; truth: Truth; explanation: string; children?: Trace[]; attribute?: string; sourceRecordIds?: string[] };
export type Evaluation = {
  recordId: string; workspaceId: string; ruleId: string; revision: number; ruleHash: string; factsHash: string; grantHash: string; evaluatedAt: string;
  decision: 'eligible' | 'excluded' | 'review'; hardEligibility: Truth;
  observedScore: number; scoreRange: { minimum: number; maximum: number };
  minimumScore: number; reasons: string[]; eligibilityTrace: Trace;
  rankingTrace: Array<{ id: string; label: string; points: number; awarded: number; trace: Trace }>;
  action: 'research_candidate_only';
};
export type VersionComparison = { before: { id: string; revision: number; hash: string }; after: { id: string; revision: number; hash: string }; asOf: string; count: number; changedCount: number; changes: Array<{ recordId: string; beforeDecision: Evaluation['decision']; afterDecision: Evaluation['decision']; beforeScore: number; afterScore: number; beforeRange: Evaluation['scoreRange']; afterRange: Evaluation['scoreRange']; changed: boolean }>; counts: { before: Record<Evaluation['decision'], number>; after: Record<Evaluation['decision'], number> } };
