"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowRight, Calculator, Check, Database, ListChecks, RefreshCw, ShieldCheck, Users } from "lucide-react";
import type { AcquisitionState, Command, Lead, Role, Summary } from "@/src/acquisition/types";
import { buildBuyerPipeline, buildDailyQueue, buildMarketReadiness, calculateProfitScenario } from "@/src/operations";
import type { BuyerActivityKind, BuyerPipelineRow, DailyWorkItem, ProfitInputs, ProfitScenario, QueueTarget, ScenarioName } from "@/src/operations";
import { DeskForm, Empty, Field, Money, Panel, Pill, dateValue, humanize, numberValue, prettyDate, textValue, type FieldSpec } from "./acquisition-ui";
import { PublicDataPanel } from "./public-data-panel";

type Workspace = { id: string; name: string; role: Role };
type Payload = { state: AcquisitionState; version: number; summary: Summary; asOf: string; sourceHolds?: Record<string, string>; workspace?: Workspace; role?: Role; result?: unknown };
type Tab = "queue" | "profit" | "buyers" | "readiness" | "data";
type CommandRunner = (command: Command, success: string) => Promise<boolean>;
const TABS: { id: Tab; label: string; icon: typeof ListChecks }[] = [
  { id: "queue", label: "Work queue", icon: ListChecks },
  { id: "profit", label: "Profit scenarios", icon: Calculator },
  { id: "buyers", label: "Buyer follow-ups", icon: Users },
  { id: "readiness", label: "Readiness", icon: ShieldCheck },
  { id: "data", label: "Free data", icon: Database },
];
const SCENARIOS: ScenarioName[] = ["base", "downside", "upside"];
const inputLabels: Record<keyof ProfitInputs, string> = {
  arv: "After-repair value ($)", repairs: "Repairs ($)", rehabContingencyPercent: "Repair contingency (%)",
  buyerClosingHoldingCosts: "Buyer closing and holding costs ($)", buyerProfitPercent: "Buyer margin (%)",
  sellerPrice: "Seller purchase price ($)", buyerPrice: "Buyer total purchase price ($)",
  targetAssignmentFee: "Target assignment fee ($)", operatorClosingCosts: "Your closing costs ($)",
  marketingBudget: "Deal marketing budget ($)", otherDealCosts: "Other deal costs ($)",
};
const inputKeys = Object.keys(inputLabels) as (keyof ProfitInputs)[];
const percentageKeys = new Set<keyof ProfitInputs>(["rehabContingencyPercent", "buyerProfitPercent"]);
const opt = (value: string, label = humanize(value)) => ({ value, label });
const dueDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
  ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`))
  : prettyDate(value);

function acquisitionLink(workspaceId: string, target: QueueTarget) {
  const params = new URLSearchParams({ workspaceId, tab: target.tab });
  if (target.leadId) params.set("leadId", target.leadId);
  if (target.contractId) params.set("contractId", target.contractId);
  if (target.buyerId) params.set("buyerId", target.buyerId);
  return `/acquisition?${params.toString()}`;
}

export function OperationsDesk() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [payload, setPayload] = useState<Payload | null>(null);
  const [tab, setTab] = useState<Tab>("queue");
  const [synthetic, setSynthetic] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const workspaceRef = useRef(workspaceId);
  workspaceRef.current = workspaceId;

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch("/api/workspaces", { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load your workspaces.");
        const list = data.workspaces as Workspace[];
        setWorkspaces(list);
        let preferred = "";
        try { preferred = localStorage.getItem("sangam.workspace") ?? ""; } catch { /* Optional preference. */ }
        setWorkspaceId(list.find(item => item.id === preferred)?.id ?? list[0]?.id ?? "");
        if (!list.length) setBusy(false);
      } catch (cause) {
        if (!controller.signal.aborted) { setError(cause instanceof Error ? cause.message : "Could not load workspaces."); setBusy(false); }
      }
    })();
    return () => controller.abort();
  }, []);

  const reload = useCallback(async (id: string, signal?: AbortSignal) => {
    if (!id) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/acquisition?workspaceId=${encodeURIComponent(id)}`, { cache: "no-store", signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load operations.");
      if (workspaceRef.current === id) setPayload(data as Payload);
    } catch (cause) {
      if (!signal?.aborted && workspaceRef.current === id) setError(cause instanceof Error ? cause.message : "Could not load operations.");
    } finally { if (!signal?.aborted && workspaceRef.current === id) setBusy(false); }
  }, []);

  useEffect(() => {
    if (!workspaceId) return;
    setPayload(null); setError(""); setNotice(""); setSynthetic(false);
    try { localStorage.setItem("sangam.workspace", workspaceId); } catch { /* Optional preference. */ }
    const controller = new AbortController(); void reload(workspaceId, controller.signal);
    return () => controller.abort();
  }, [workspaceId, reload]);

  const command: CommandRunner = async (value, success) => {
    if (!payload || busy) return false;
    const targetId = workspaceId;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/acquisition", { method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", body: JSON.stringify({ workspaceId: targetId, version: payload.version, command: value }) });
      const data = await response.json();
      if (!response.ok) throw new Error(response.status === 409 ? "This workspace changed in another session. Refresh and review the latest records before trying again." : data.error || "The record could not be saved.");
      if (workspaceRef.current !== targetId) return false;
      setPayload(data as Payload); setNotice(success); return true;
    } catch (cause) {
      if (workspaceRef.current === targetId) setError(cause instanceof Error ? cause.message : "The record could not be saved.");
      return false;
    } finally { if (workspaceRef.current === targetId) setBusy(false); }
  };

  const workspace = workspaces.find(item => item.id === workspaceId);
  return <div className="acq-desk" aria-busy={busy}>
    <header className="acq-heading"><div><p className="acq-eyebrow">SANGAM · DAILY OPERATIONS</p><h1>Make the next move count.</h1><p className="acq-subtitle">Priorities, deal economics and buyer follow-through in one place.</p></div><div className="acq-heading-tools"><Pill tone="good">Private pilot · manual outreach</Pill><button className="acq-icon-button" disabled={busy || !workspaceId} onClick={() => void reload(workspaceId)} aria-label="Refresh operations"><RefreshCw size={16} className={busy ? "animate-spin" : ""} /></button></div></header>
    <div className="acq-workspace-bar"><label htmlFor="operations-workspace">Workspace</label><select id="operations-workspace" value={workspaceId} disabled={busy} onChange={event => setWorkspaceId(event.target.value)}><option value="" disabled>Select workspace</option>{workspaces.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>{workspace && <Pill>{workspace.role}</Pill>}<span className="acq-workspace-note">You make offers, contact people and close deals. Sangam prepares the next step.</span></div>
    {error && <div className="acq-alert acq-alert-error" role="alert"><strong>Action needed</strong><p>{error}</p><button className="acq-text-button" onClick={() => void reload(workspaceId)} disabled={busy}>Refresh operations</button></div>}
    {notice && <div className="acq-alert acq-alert-success" role="status"><Check size={17} /><p>{notice}</p><button aria-label="Dismiss notification" onClick={() => setNotice("")}>×</button></div>}
    {!payload ? <Panel title={busy ? "Opening your operations desk" : "Workspace access required"}><Empty title={busy ? "Loading current records" : "No workspace available"}>{busy ? "Checking your latest activity and planning records." : "An administrator must add your account to a workspace before you can use it."}</Empty></Panel> : <>
      <nav className="acq-tabs" aria-label="Operations sections">{TABS.map(item => <button key={item.id} className={tab === item.id ? "active" : ""} aria-current={tab === item.id ? "page" : undefined} onClick={() => setTab(item.id)}><item.icon size={15} />{item.label}</button>)}</nav>
      {["queue", "profit", "buyers"].includes(tab) && <div className="acq-toolbar"><label htmlFor="operations-data-view">Data view</label><select className="acq-input" id="operations-data-view" value={synthetic ? "practice" : "real"} onChange={event => setSynthetic(event.target.value === "practice")}><option value="real">Real business records</option><option value="practice">Fictional practice records</option></select><span className="acq-muted">{synthetic ? "Practice only. These records do not count toward real targets or income." : "Practice records are excluded."}</span></div>}
      <div key={`${workspaceId}:${synthetic}`}>
        {tab === "queue" && <WorkQueue state={payload.state} summary={payload.summary} now={payload.asOf} synthetic={synthetic} workspaceId={workspaceId} sourceHolds={payload.sourceHolds} />}
        {tab === "profit" && <ProfitScenarios state={payload.state} synthetic={synthetic} busy={busy} command={command} workspaceId={workspaceId} />}
        {tab === "buyers" && <BuyerFollowUps state={payload.state} now={payload.asOf} synthetic={synthetic} busy={busy} command={command} workspaceId={workspaceId} sourceHolds={payload.sourceHolds} />}
        {tab === "readiness" && <Readiness state={payload.state} summary={payload.summary} now={payload.asOf} workspaceId={workspaceId} sourceHolds={payload.sourceHolds} />}
        {tab === "data" && <PublicDataPanel workspaceId={workspaceId} state={payload.state} version={payload.version} onWorkspaceChanged={() => void reload(workspaceId)} />}
      </div>
      <footer className="acq-footer"><span><ShieldCheck size={13} />Plans and research do not record contact, acceptance or collected income.</span><span>Current records as of {prettyDate(payload.asOf)}</span></footer>
    </>}
  </div>;
}

function WorkQueue({ state, summary, now, synthetic, workspaceId, sourceHolds }: { state: AcquisitionState; summary: Summary; now: string; synthetic: boolean; workspaceId: string; sourceHolds?: Record<string, string> }) {
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(0);
  const items = buildDailyQueue(state, summary, now, synthetic, sourceHolds);
  const filtered = items.filter(item => filter === "all" || item.state === filter);
  const activePage = Math.min(page, Math.max(0, Math.ceil(filtered.length / 25) - 1));
  const visible = filtered.slice(activePage * 25, activePage * 25 + 25);
  const labels: Record<DailyWorkItem["state"], string> = { ready: "Ready to review", blocked: "Needs evidence", upcoming: "Upcoming" };
  return <div className="acq-stack"><div className="acq-info"><ListChecks size={20} /><p>Start at the top. Deadlines and existing commitments come first. Each item stays open until its underlying record changes; this queue does not contact anyone or approve a batch.</p></div><Panel title="Your next useful actions" description="Ordered by deadline and stage. Release checks still run when you prepare a manual batch.">
    <div className="acq-toolbar"><label htmlFor="operations-queue-filter">Show</label><select id="operations-queue-filter" className="acq-input" value={filter} onChange={event => { setFilter(event.target.value); setPage(0); }}><option value="all">All actions ({items.length})</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label} ({items.filter(item => item.state === value).length})</option>)}</select></div>
    {visible.length ? <div className="acq-list">{visible.map(item => <div key={item.id} className="acq-list-row"><div className="min-w-0"><strong>{item.title}</strong><small>{item.reason}</small>{item.dueAt && <small>Due {dueDate(item.dueAt)}</small>}{item.blockers.length > 0 && <ul className="mt-2 list-disc pl-4 text-xs text-amber-200">{item.blockers.map((blocker, index) => <li key={`${item.id}:${index}`}>{blocker}</li>)}</ul>}<Link className="acq-text-button mt-2" href={acquisitionLink(workspaceId, item.target)}>Open next step<ArrowRight size={13} /></Link></div><Pill tone={item.state === "blocked" ? "warn" : item.state === "ready" ? "good" : "muted"}>{labels[item.state]}</Pill></div>)}</div> : <Empty title={filter === "all" ? "No open actions in this view" : "No matching actions"}>Import an authorized export or change the view to inspect existing records. No activity is invented to fill this queue.</Empty>}
    {filtered.length > 25 && <div className="acq-toolbar"><span className="acq-muted">Showing {activePage * 25 + 1}–{Math.min((activePage + 1) * 25, filtered.length)} of {filtered.length}</span><button className="btn btn-secondary" disabled={activePage === 0} onClick={() => setPage(activePage - 1)}>Previous actions</button><button className="btn btn-secondary" disabled={(activePage + 1) * 25 >= filtered.length} onClick={() => setPage(activePage + 1)}>Next actions</button></div>}
  </Panel></div>;
}

function initialInputs(lead: Lead, sellerPrice: number | null): ProfitInputs {
  return { arv: lead.underwriting?.arv ?? null, repairs: lead.underwriting?.repairs ?? null, rehabContingencyPercent: null, buyerClosingHoldingCosts: lead.underwriting?.closingCosts ?? null, buyerProfitPercent: lead.underwriting?.profitPercent ?? null, sellerPrice, buyerPrice: null, targetAssignmentFee: lead.underwriting?.assignmentFee ?? null, operatorClosingCosts: null, marketingBudget: null, otherDealCosts: null };
}
function readProfitInputs(values: FormData): ProfitInputs {
  return Object.fromEntries(inputKeys.map(key => [key, textValue(values, key) === "" ? null : numberValue(values, key) / (percentageKeys.has(key) ? 100 : 1)])) as ProfitInputs;
}
function Currency({ value }: { value: number | null | undefined }) {
  return <>{value == null ? "Unknown" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value)}</>;
}

function ProfitScenarios({ state, synthetic, busy, command, workspaceId }: { state: AcquisitionState; synthetic: boolean; busy: boolean; command: CommandRunner; workspaceId: string }) {
  const [leadId, setLeadId] = useState("");
  const [name, setName] = useState<ScenarioName>("base");
  const leads = state.leads.filter(lead => lead.synthetic === synthetic);
  const lead = leads.find(item => item.id === leadId) ?? leads[0];
  const scenarios = (state.profitScenarios ?? []).filter(item => item.leadId === lead?.id);
  const selected = scenarios.find(item => item.name === name);
  const contract = state.contracts.find(item => item.leadId === lead?.id && !item.termination && !state.closings.some(closing => closing.contractId === item.id));
  return <div className="acq-stack"><div className="acq-info"><Calculator size={20} /><p>Compare the numbers before you make an offer. Unknown costs stay unknown. Saving a scenario changes planning only; offers, signed prices and collected fees remain separate.</p></div><Panel title="Choose a seller lead" description="Use base, downside and upside to record your own assumptions."><div className="acq-toolbar"><label htmlFor="scenario-lead">Property</label><select className="acq-input" id="scenario-lead" value={lead?.id ?? ""} onChange={event => setLeadId(event.target.value)} disabled={busy || !leads.length}><option value="" disabled>Select a property</option>{leads.map(item => <option key={item.id} value={item.id}>{item.address} · {item.ownerName}</option>)}</select></div>{!lead && <Empty title="No seller leads in this view">Import authorized real leads, or choose the practice view for fictional records.</Empty>}</Panel>
    {lead && <><Panel title="Saved scenario comparison" description="Projected deal net before tax and unallocated business overhead.">{scenarios.length ? <div className="acq-table-wrap"><table><thead><tr><th>Scenario</th><th>Seller maximum</th><th>Assignment spread</th><th>Projected net</th><th>Assumptions</th></tr></thead><tbody>{SCENARIOS.map(scenarioName => { const saved = scenarios.find(item => item.name === scenarioName); if (!saved) return null; const result = calculateProfitScenario(saved.inputs); return <tr key={saved.id}><td><button className="acq-cell-button" onClick={() => setName(saved.name)}>{humanize(saved.name)}</button><small>{prettyDate(saved.recordedAt)}</small></td><td><Currency value={result.maximumSellerOffer} /></td><td><Currency value={result.assignmentSpread} /></td><td className={result.projectedNet != null && result.projectedNet < 0 ? "text-rose-300" : undefined}><Currency value={result.projectedNet} /></td><td>{saved.assumptions}<small>{result.missing.length ? `${result.missing.length} unknown inputs` : "All scenario inputs entered"}</small></td></tr>; })}</tbody></table></div> : <Empty title="No saved scenarios yet">Start with the values you can support. Leave unverified amounts blank instead of entering zero.</Empty>}</Panel>
      <Panel title="Model a scenario" description="Underwriting and an existing contract may prefill their corresponding inputs. Review all assumptions before saving."><div className="acq-toolbar"><label htmlFor="scenario-name">Scenario</label><select className="acq-input" id="scenario-name" value={name} onChange={event => setName(event.target.value as ScenarioName)} disabled={busy}>{SCENARIOS.map(item => <option key={item} value={item}>{humanize(item)}</option>)}</select><Link className="acq-text-button" href={acquisitionLink(workspaceId, { tab: "leads", leadId: lead.id })}>Open comps and actual offers<ArrowRight size={13} /></Link></div><ScenarioForm key={`${lead.id}:${name}:${selected?.recordedAt ?? "new"}`} lead={lead} name={name} saved={selected} defaults={initialInputs(lead, contract?.price ?? null)} busy={busy} command={command} /></Panel></>}
  </div>;
}

function ScenarioForm({ lead, name, saved, defaults, busy, command }: { lead: Lead; name: ScenarioName; saved?: ProfitScenario; defaults: ProfitInputs; busy: boolean; command: CommandRunner }) {
  const inputs = saved?.inputs ?? defaults;
  const [preview, setPreview] = useState(inputs);
  const result = calculateProfitScenario(preview);
  const fields: FieldSpec[] = inputKeys.map(key => ({ name: key, label: inputLabels[key], type: "number", min: 0, max: percentageKeys.has(key) ? 100 : 100_000_000, step: 0.01, value: inputs[key] == null ? "" : inputs[key] * (percentageKeys.has(key) ? 100 : 1), hint: key === "buyerPrice" ? "Total paid by the buyer, including the assignment fee." : key === "marketingBudget" ? "Planning amount only. Do not also count it as an actual expense." : "Leave blank if unknown; enter 0 only when confirmed." }));
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    await command({ type: "save_profit_scenario", leadId: lead.id, name, inputs: readProfitInputs(values), assumptions: textValue(values, "assumptions") }, "Scenario saved. It did not record an offer, change a contract or add revenue.");
  }
  return <><form className="acq-form" onSubmit={submit} onChange={event => setPreview(readProfitInputs(new FormData(event.currentTarget)))}><fieldset className="acq-form-grid" disabled={busy}><legend className="sr-only">Scenario assumptions</legend>{fields.map(field => <Field key={field.name} field={field} />)}<Field field={{ name: "assumptions", label: "Assumptions and evidence", type: "textarea", required: true, value: saved?.assumptions, hint: "Describe the basis, uncertainty and source of your price and cost estimates. This is a model, not an appraisal." }} /><div className="acq-span"><button className="btn btn-primary" type="submit">Save {name} scenario<ArrowRight size={14} /></button></div></fieldset></form>
    <div className="acq-detail-overview"><dl className="acq-facts"><div><dt>Repair contingency</dt><dd><Currency value={result.rehabContingency} /></dd></div><div><dt>Buyer price ceiling</dt><dd><Currency value={result.buyerCeiling} /></dd></div><div><dt>Maximum seller offer</dt><dd><Currency value={result.maximumSellerOffer} /></dd></div></dl><dl className="acq-facts"><div><dt>Assignment spread</dt><dd><Currency value={result.assignmentSpread} /></dd></div><div><dt>Projected deal net</dt><dd className={result.projectedNet != null && result.projectedNet < 0 ? "text-rose-300" : undefined}><Currency value={result.projectedNet} /></dd></div><div><dt>Buyer headroom</dt><dd><Currency value={result.buyerHeadroom} /></dd></div></dl></div>
    <div className="px-6 pb-6 text-xs text-ink-300"><p>Projected deal net is before tax and unallocated business overhead. A modeled price is not a buyer offer or a guarantee of profit.</p>{result.missing.length > 0 && <p className="mt-2">Unknown: {result.missing.map(key => inputLabels[key].replace(/ \([$%]\)$/, "")).join(", ")}.</p>}{result.warnings.length > 0 && <ul className="mt-2 list-disc pl-4 text-amber-200">{result.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}</div>
  </>;
}

function BuyerFollowUps({ state, now, synthetic, busy, command, workspaceId, sourceHolds }: { state: AcquisitionState; now: string; synthetic: boolean; busy: boolean; command: CommandRunner; workspaceId: string; sourceHolds?: Record<string, string> }) {
  const [relationshipId, setRelationshipId] = useState("");
  const [contractFilter, setContractFilter] = useState("");
  const rows = buildBuyerPipeline(state, now, synthetic, sourceHolds);
  const filtered = rows.filter(item => !contractFilter || item.contractId === contractFilter);
  const selected = filtered.find(item => `${item.contractId}:${item.buyerId}` === relationshipId);
  const contractName = (id: string) => state.leads.find(lead => lead.id === state.contracts.find(contract => contract.id === id)?.leadId)?.address ?? "Contract";
  const contractIds = [...new Set(rows.map(item => item.contractId))];
  const activities = selected ? (state.buyerActivities ?? []).filter(item => item.contractId === selected.contractId && item.buyerId === selected.buyerId).slice(-20).reverse() : [];
  return <div className="acq-stack"><div className="acq-info"><Users size={20} /><p>Keep the next promised action beside actual replies and buyer offers. Plans never count as deliveries. Record opt-outs, signed assignments and closings in Acquisition.</p></div><Panel title="Buyer conversations and offers" description="Relationships come from reviewed buyer packets or existing assignments."><div className="acq-toolbar"><label htmlFor="buyer-contract-filter">Property</label><select className="acq-input" id="buyer-contract-filter" value={contractFilter} onChange={event => { setContractFilter(event.target.value); setRelationshipId(""); }}><option value="">All contracted properties</option>{contractIds.map(id => <option key={id} value={id}>{contractName(id)}</option>)}</select><Link className="acq-text-button" href={acquisitionLink(workspaceId, { tab: "deals" })}>Open buyer packets<ArrowRight size={13} /></Link></div>
    {filtered.length ? <div className="acq-table-wrap"><table><thead><tr><th>Buyer / property</th><th>Stage</th><th>Current offer</th><th>Next action</th><th>Last actual activity</th></tr></thead><tbody>{filtered.map(row => <tr key={`${row.contractId}:${row.buyerId}`}><td><button className="acq-cell-button" onClick={() => setRelationshipId(`${row.contractId}:${row.buyerId}`)}>{row.buyerName}</button><small>{contractName(row.contractId)}</small></td><td><Pill tone={row.blockers.length ? "warn" : "muted"}>{humanize(row.stage)}</Pill>{row.blockers.map((blocker, index) => <small key={index}>{blocker}</small>)}</td><td><Currency value={row.latestOffer?.amount} />{row.latestOffer && <small>Total buyer price, including assignment</small>}</td><td>{row.nextDueAt ? prettyDate(row.nextDueAt) : "No open follow-up"}</td><td>{prettyDate(row.lastActivityAt)}</td></tr>)}</tbody></table></div> : <Empty title="No buyer relationships in this view">Prepare and review a packet for a contracted deal in Acquisition. No buyer, delivery or offer is invented here.</Empty>}
  </Panel>{selected && <Panel title={selected.buyerName} description={contractName(selected.contractId)} action={<button className="acq-text-button" onClick={() => setRelationshipId("")}>Close detail</button>}>
    {selected.blockers.length > 0 && <div className="acq-info"><ShieldCheck size={18} /><p>{selected.blockers.join(" ")} Historical actual replies can still be recorded; a reply does not restore contact permission.</p></div>}
    <BuyerActivityForm key={`${selected.contractId}:${selected.buyerId}`} row={selected} busy={busy} command={command} />
    <div className="px-6 pb-4"><Link className="acq-text-button" href={acquisitionLink(workspaceId, { tab: "deals", contractId: selected.contractId, buyerId: selected.buyerId, leadId: state.contracts.find(item => item.id === selected.contractId)?.leadId })}>Open actual delivery, opt-out and assignment records<ArrowRight size={13} /></Link></div>
    {activities.length > 0 && <div className="acq-table-wrap"><table><thead><tr><th>Recent activity</th><th>When</th><th>Evidence</th></tr></thead><tbody>{activities.map(activity => <tr key={activity.id}><td>{humanize(activity.kind)}{activity.amount != null && <small><Currency value={activity.amount} /></small>}</td><td>{activity.kind === "follow_up_planned" ? `Planned for ${prettyDate(activity.dueAt)}` : prettyDate(activity.occurredAt)}</td><td>{activity.reference}<small>{activity.notes}</small></td></tr>)}</tbody></table></div>}
  </Panel>}</div>;
}

function BuyerActivityForm({ row, busy, command }: { row: BuyerPipelineRow; busy: boolean; command: CommandRunner }) {
  const [kind, setKind] = useState<BuyerActivityKind>("conversation");
  const requestDraft = useRef<Command | null>(null);
  const terminal = ["suppressed", "closed", "contract_ended", "assigned", "declined"].includes(row.stage);
  const options = [opt("conversation", "Record an actual conversation"), opt("offer_received", "Record a buyer offer received"), ...(row.latestOffer ? [opt("offer_withdrawn", "Record withdrawal of the current offer")] : []), ...(!terminal ? [opt("follow_up_planned", "Plan a manual follow-up")] : [])];
  const effectiveKind = options.some(item => item.value === kind) ? kind : "conversation";
  useEffect(() => { requestDraft.current = null; }, [effectiveKind]);
  const actual = effectiveKind !== "follow_up_planned";
  const fields: FieldSpec[] = [
    actual ? { name: "occurredAt", label: "Actual event date and time", type: "datetime-local", required: true, hint: "Record when the conversation, offer or withdrawal actually happened." } : { name: "dueAt", label: "Follow-up due date and time", type: "datetime-local", required: true, hint: "A reminder for your manual work; this does not contact the buyer." },
    ...(effectiveKind === "offer_received" ? [{ name: "amount", label: "Buyer's total purchase price ($)", type: "number" as const, min: 0.01, step: 0.01, required: true, hint: "Total price including assignment. This is not assignment-fee revenue." }] : []),
    { name: "reference", label: "Evidence or planning reference", required: true, hint: actual ? "Retrievable reference for this actual event." : "What prompted this follow-up?" },
    { name: "notes", label: "Notes", type: "textarea" },
    ...(actual && effectiveKind !== "offer_withdrawn" && row.plannedTaskId ? [{ name: "completesTask", label: "This actual event completes the open planned follow-up", type: "checkbox" as const }] : []),
  ];
  return <div onChange={() => { requestDraft.current = null; }}><div className="acq-toolbar"><label htmlFor="buyer-activity-kind">Action</label><select id="buyer-activity-kind" className="acq-input" disabled={busy} value={effectiveKind} onChange={event => setKind(event.target.value as BuyerActivityKind)}>{options.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
    {effectiveKind === "offer_withdrawn" && <p className="px-6 text-sm text-amber-200">Withdraw the current <Currency value={row.latestOffer?.amount} /> buyer offer. This does not terminate a seller contract or a signed assignment.</p>}
    <DeskForm key={effectiveKind} title={effectiveKind === "follow_up_planned" ? "Next manual action" : "Record what actually happened"} description={actual ? "Enter actual inbound activity. Do not use this form to record a delivery, opt-out or signed agreement." : "A saved plan remains subject to current permission and contract checks."} busy={busy} fields={fields} submitLabel={effectiveKind === "follow_up_planned" ? "Save follow-up plan" : "Save actual buyer activity"} onSubmit={async values => {
      if (!requestDraft.current) requestDraft.current = { type: "record_buyer_activity", contractId: row.contractId, buyerId: row.buyerId, kind: effectiveKind, occurredAt: actual ? dateValue(values, "occurredAt") : null, dueAt: actual ? null : dateValue(values, "dueAt"), amount: effectiveKind === "offer_received" ? numberValue(values, "amount") : null, reference: textValue(values, "reference"), notes: textValue(values, "notes"), completesTaskId: actual && effectiveKind !== "offer_withdrawn" && values.get("completesTask") === "on" ? row.plannedTaskId : null, withdrawsOfferId: effectiveKind === "offer_withdrawn" ? row.latestOffer?.activityId ?? null : null, idempotencyKey: crypto.randomUUID() };
      return command(requestDraft.current, actual ? "Buyer activity recorded. Delivery, signed agreements and collected revenue remain separate." : "Follow-up planned. No message or call was sent.");
    }} />
  </div>;
}

function Metric({ label, value }: { label: string; value: ReactNode }) { return <div className="acq-metric"><span>{label}</span><strong>{value}</strong></div>; }

function Readiness({ state, summary, now, workspaceId, sourceHolds }: { state: AcquisitionState; summary: Summary; now: string; workspaceId: string; sourceHolds?: Record<string, string> }) {
  const readiness = buildMarketReadiness(state, summary, now, sourceHolds);
  const launch = readiness.launch;
  return <div className="acq-stack"><div className="acq-mission"><div><p className="acq-eyebrow">PRIVATE PILOT · REAL RESULTS ONLY</p><h2>{launch.launchedAt ? `Day ${launch.day} of the 90-day pilot` : "The real outreach clock has not started."}</h2><p>{launch.launchedAt ? `Started with an actual recorded touch on ${prettyDate(launch.launchedAt)}. ${launch.daysRemaining} days remain.` : "The first actual real outreach receipt starts the clock. Research, plans, exports and practice activity do not."}</p></div><div className="acq-mission-target"><strong>{launch.progress.contracts}<span> / {launch.targets.contracts}</span></strong><span>signed contracts in pilot</span></div></div>
    <div className="acq-stats"><Metric label="Unique sellers touched in pilot" value={`${launch.progress.leads} / ${launch.targets.leads}`} /><Metric label="Offers made in pilot" value={`${launch.progress.offers} / ${launch.targets.offers}`} /><Metric label="Signed contracts in pilot" value={`${launch.progress.contracts} / ${launch.targets.contracts}`} /><Metric label="Days remaining" value={launch.daysRemaining ?? "Not started"} /></div>
    <Panel title="Current real workspace funnel" description="An inventory of distinct leads and contracts, not a conversion-rate calculation. Practice records are excluded."><div className="acq-stats">{Object.entries(readiness.funnel).map(([key, value]) => <Metric key={key} label={key.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()} value={value} />)}</div></Panel>
    <Panel title="Recorded cash, all time" description="Actual recorded money as of this view. Planned scenarios and buyer offers are excluded."><div className="acq-stats"><Metric label="Assignment fees collected" value={<Money value={readiness.actuals.collectedFees} />} /><Metric label="Recorded spend" value={<Money value={readiness.actuals.recordedSpend} />} /><Metric label="Recorded net cash" value={<Money value={readiness.actuals.netRecordedCash} />} /></div><p className="px-6 pb-5 text-xs text-ink-300">Recorded net cash is before tax. Missing or duplicated expense entries affect the result. Deposits and contract prices are not assignment-fee income.</p></Panel>
    <Panel title="Readiness evidence" description="These checks reflect recorded evidence. A passing software release does not grant source rights or professional approval."><div className="acq-list">{readiness.checklist.map(check => <div key={check.id} className="acq-list-row"><div className="min-w-0"><strong>{check.label}</strong><small>{check.detail}</small>{check.evidenceReference && <small>Reference: {check.evidenceReference}</small>}{check.target && <Link className="acq-text-button mt-2" href={acquisitionLink(workspaceId, check.target)}>Review evidence<ArrowRight size={13} /></Link>}</div><Pill tone={check.status === "ready" ? "good" : "warn"}>{humanize(check.status)}</Pill></div>)}</div></Panel>
    <Panel title="Open contract risks" description="Resolve dates and required records with the people managing the transaction.">{readiness.openContractRisks.length ? <div className="acq-list">{readiness.openContractRisks.map((risk, index) => <div className="acq-list-row" key={`${risk.contractId}:${index}`}><span><strong>{state.leads.find(lead => lead.id === state.contracts.find(contract => contract.id === risk.contractId)?.leadId)?.address ?? "Contract"}</strong><small>{risk.reason}</small></span><Link className="acq-text-button" href={acquisitionLink(workspaceId, { tab: "deals", contractId: risk.contractId })}>Review contract<ArrowRight size={13} /></Link></div>)}</div> : <Empty title="No open contract risks recorded">This reflects the current workspace records; it is not a title, legal or property-condition verification.</Empty>}</Panel>
    <Panel title="Private pilot scope" description="What this release can support today."><dl className="acq-facts"><div><dt>Customer access</dt><dd>Administrator-provisioned workspaces</dd></div><div><dt>Mail, calling and buyer delivery</dt><dd>Manual, with reviewed exports and actual receipts</dd></div><div><dt>Subscriptions and payment collection</dt><dd>Not enabled</dd></div><div><dt>Negotiation, signatures and closing</dt><dd>Human-operated</dd></div><div><dt>Data collection</dt><dd>Authorized exports and separately reviewed public-data capabilities</dd></div></dl></Panel>
  </div>;
}
