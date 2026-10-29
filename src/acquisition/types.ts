export type Role = 'operator' | 'reviewer' | 'admin';
export type Context = { actorId: string; role: Role; now: string };
export type Channel = 'mail' | 'call';
export type GateName = 'counsel' | 'channel_policy' | 'data_provenance' | 'suppression_ops' | 'title_escrow' | 'technical' | 'launch_authorization' | 'nod_counsel';
export type Gate = { revision: string; name: GateName; status: 'approved' | 'blocked'; evidence: string; reviewedAt: string; recordedAt: string; reviewerId: string; expiresAt: string | null };
export type Signals = { tax_delinquent_years: number | null; nod: boolean | null; vacant: boolean | null; absentee: boolean | null; equity_pct: number | null; years_owned: number | null; inherited: boolean | null; code_violations: boolean | null };
export type ContactEvidence = { phone: string; dncStatus: 'unknown' | 'clear' | 'blocked'; litigatorStatus: 'unknown' | 'clear' | 'blocked'; scrubbedAt: string; recipientTimezone: string; timezoneEvidence: string; evidenceReference: string; recordedAt: string; recordedBy: string };
export type Qualification = { condition: string; timeline: string; priceExpectation: number | null; mortgageBalance: number | null; notes: string; recordedAt: string };
export type Underwriting = { arv: number; repairs: number; closingCosts: number; assignmentFee: number; profitPercent: number; compReferences: string[]; mao: number; recordedAt: string };
export type Lead = { automationSourceId?: string; id: string; county: string; apn: string; address: string; city: string; zip: string; ownerName: string; mailingAddress: string; phone: string; email: string; propertyType: string; estimatedValue: number | null; signals: Signals; score: number; breakdown: Record<string, number>; source: string; sourceDate: string; permissionReference: string; importHash: string; synthetic: boolean; importedAt: string; updatedAt: string; notes: string; contact: ContactEvidence | null; qualification: Qualification | null; underwriting: Underwriting | null };
export type Suppression = { id: string; leadId: string; buyerId?: string; phone: string; email: string; ownerName: string; mailingAddress: string; reason: string; createdAt: string; actorId: string };
export type Template = { id: string; channel: Channel; name: string; body: string; revision: number; status: 'draft' | 'approved' | 'retired'; createdAt: string; createdBy: string; reviewedAt: string | null; reviewerId: string | null; evidence: string | null };
export type BatchItem = { leadId: string; ownerName: string; address: string; mailingAddress: string; phone: string; email: string; content: string; fingerprint: string; contactEvidence: ContactEvidence; source: string; sourceDate: string; permissionReference: string };
export type Batch = { id: string; channel: Channel; templateId: string; templateSnapshot: Template; gateEvidence: Gate[]; items: BatchItem[]; snapshotHash: string; status: 'draft' | 'approved' | 'revoked'; createdAt: string; createdBy: string; approvedAt: string | null; approvedBy: string | null; approvalEvidence: string | null; expiresAt: string | null; exportedAt: string[]; revokedReason: string | null };
export type ReceiptOutcome = 'mailed' | 'no_answer' | 'conversation' | 'appointment' | 'not_interested' | 'wrong_number' | 'opt_out';
export type Receipt = { id: string; batchId: string; leadId: string; channel: Channel; destination: string; occurredAt: string; outcome: ReceiptOutcome; reference: string; idempotencyKey: string; cost: number; notes: string; synthetic: boolean; recordedAt: string; actorId: string };
export type SellerResponse = { id: string; leadId: string; occurredAt: string; outcome: 'conversation' | 'appointment' | 'not_interested' | 'wrong_number' | 'opt_out'; reference: string; notes: string; synthetic: boolean; recordedAt: string };
export type Offer = { id: string; leadId: string; amount: number; occurredAt: string; reference: string; synthetic: boolean; recordedAt: string };
export type Contract = { id: string; leadId: string; offerId: string; price: number; signedAt: string; reference: string; assignable: true; disclosuresReference: string; closingDate: string; amendments: Array<{ newClosingDate: string; signedAt: string; reference: string; recordedAt: string }>; termination: { endedAt: string; reference: string; reason: string; recordedAt: string } | null; synthetic: boolean; createdAt: string };
export type Buyer = { id: string; name: string; email: string; phone: string; zips: string[]; minPrice: number; maxPrice: number; propertyTypes: string[]; rehabMax: number | null; permissionReference: string; permissionAt: string; sourceReference: string; synthetic: boolean; active: boolean; cashPurchases24m?: number | null; lastCashPurchaseDate?: string | null; entity?: boolean | null; purchasedFarmZip?: boolean | null; updatedAt: string };
export type BuyerMatch = { buyerId: string; name: string; score: number; activityScore: number; reasons: string[] };
export type Packet = { id: string; contractId: string; contractSnapshot: Contract; buyersSnapshot: Buyer[]; gateEvidence: Gate[]; buyerIds: string[]; body: string; snapshotHash: string; status: 'draft' | 'approved' | 'revoked'; createdAt: string; approvedAt: string | null; approvedBy: string | null; approvalEvidence: string | null; expiresAt: string | null; exportedAt: string[] };
export type BuyerReceipt = { id: string; packetId: string; buyerId: string; occurredAt: string; outcome: 'delivered' | 'interested' | 'declined' | 'opt_out'; reference: string; idempotencyKey: string; synthetic: boolean; recordedAt: string };
export type Assignment = { id: string; contractId: string; buyerId: string; signedAt: string; reference: string; price: number; disclosuresReference: string; depositAmount: number; depositReference: string };
export type Closing = { id: string; contractId: string; closedAt: string; assignmentFee: number; expenses: number; reference: string; synthetic: boolean };
export type Expense = { id: string; category: string; amount: number; occurredAt: string; reference: string; synthetic: boolean; recordedAt: string };
export type AuditEntry = { id: string; action: string; at: string; actorId: string; detail: string };
export type AcquisitionState = { schemaVersion: 1; leads: Lead[]; gates: Gate[]; suppressions: Suppression[]; templates: Template[]; batches: Batch[]; receipts: Receipt[]; responses: SellerResponse[]; offers: Offer[]; contracts: Contract[]; buyers: Buyer[]; packets: Packet[]; buyerReceipts: BuyerReceipt[]; assignments: Assignment[]; closings: Closing[]; expenses: Expense[]; audit: AuditEntry[] };
export type ImportInput = { csv: string; source: string; sourceDate: string; permissionReference: string; synthetic?: boolean };
export type ImportPreview = { previewHash: string; count: number; newCount: number; updatedCount: number; eligibleScoreCount: number; synthetic: boolean; rows: Array<{ county: string; apn: string; ownerName: string; address: string; score: number; unknownSignals: string[]; warnings: string[] }> };
export type Download = { filename: string; mimeType: string; content: string };
export type Summary = { launchedAt: string | null; day: number | null; daysRemaining: number | null; targets: { leads: number; offers: number; contracts: number }; progress: { leads: number; offers: number; contracts: number; conversations: number; appointments: number; assignmentFees: number; spend: number }; totalLeads: number; realLeads: number; syntheticLeads: number; scoreQualified: number; mailReady: number; callReady: number; nextBlockedGate: GateName | null; followUps: Array<{ leadId: string; ownerName: string; dueAt: string }>; buyerAlertsDue: Array<{ contractId: string; dueAt: string; delivered: number; required: number }>; outbound: 'disabled'; costPer: { conversation: number | null; offer: number | null; contract: number | null }; readiness: { allGeneralGatesApproved: boolean; approvedTemplates: number }; };
export type Command =
 | { type: 'rescore' }
 | ({ type: 'record_expense' } & Omit<Expense, 'id' | 'recordedAt'>)
 | ({ type: 'preview_import' } & ImportInput)
 | ({ type: 'import_leads'; previewHash: string } & ImportInput)
 | { type: 'set_gate'; gate: GateName; status: 'approved' | 'blocked'; evidence: string; reviewedAt: string; expiresAt?: string | null }
 | ({ type: 'record_contact'; leadId: string } & Omit<ContactEvidence, 'recordedAt' | 'recordedBy'>)
 | { type: 'suppress'; leadId: string; reason: string }
 | { type: 'save_template'; channel: Channel; name: string; body: string }
 | { type: 'review_template'; templateId: string; approved: boolean; evidence: string }
 | { type: 'draft_batch'; channel: Channel; leadIds: string[]; templateId: string }
 | { type: 'approve_batch'; batchId: string; evidence: string }
 | { type: 'revoke_batch'; batchId: string; reason: string }
 | { type: 'export_batch'; batchId: string }
 | { type: 'record_receipt'; batchId: string; leadId: string; occurredAt: string; outcome: ReceiptOutcome; reference: string; idempotencyKey: string; cost: number; notes?: string }
 | ({ type: 'record_response' } & Omit<SellerResponse, 'id' | 'synthetic' | 'recordedAt'>)
 | ({ type: 'qualify_lead'; leadId: string } & Omit<Qualification, 'recordedAt'>)
 | ({ type: 'underwrite'; leadId: string } & Omit<Underwriting, 'mao' | 'recordedAt'>)
 | { type: 'record_offer'; leadId: string; amount: number; occurredAt: string; reference: string }
 | { type: 'record_contract'; leadId: string; offerId: string; price: number; signedAt: string; reference: string; assignable: boolean; disclosuresReference: string; closingDate: string }
 | { type: 'extend_contract'; contractId: string; newClosingDate: string; signedAt: string; reference: string }
 | { type: 'cancel_contract'; contractId: string; endedAt: string; reference: string; reason: string }
 | ({ type: 'save_buyer'; id?: string } & Omit<Buyer, 'id' | 'updatedAt'>)
 | { type: 'match_buyers'; contractId: string }
 | { type: 'draft_packet'; contractId: string; buyerIds: string[]; body: string }
 | { type: 'approve_packet'; packetId: string; evidence: string }
 | { type: 'revoke_packet'; packetId: string; reason: string }
 | { type: 'export_packet'; packetId: string }
 | { type: 'record_buyer_receipt'; packetId: string; buyerId: string; occurredAt: string; outcome: BuyerReceipt['outcome']; reference: string; idempotencyKey: string }
 | ({ type: 'record_assignment' } & Omit<Assignment, 'id'>)
 | ({ type: 'record_close' } & Omit<Closing, 'id' | 'synthetic'>);
