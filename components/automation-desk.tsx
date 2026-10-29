"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight, Check, CircleHelp, Database, GitBranch, ListChecks, RefreshCw, Search, ShieldCheck, Upload } from "lucide-react";
import type { ImportPreview, Role } from "@/src/acquisition/types";
import type { Source, SourceInput, SourceRecord } from "@/src/automation/store";
import type { Evaluation, RuleSet, Trace } from "@/src/automation/engine-types";
import type { AutomationPayload, DecisionItem } from "@/src/automation/contracts";
import { DeskForm, Empty, Field, Fold, Panel, Pill, dateValue, humanize, listValue, numberValue, prettyDate, textValue, type FieldSpec } from "./acquisition-ui";

type Workspace = { id: string; name: string; role: Role };
type Tab = "sources" | "rules" | "jobs" | "matches";
const TABS: { id: Tab; label: string; icon: typeof Database }[] = [
  { id: "sources", label: "Sources", icon: Database },
  { id: "rules", label: "Rules", icon: GitBranch },
  { id: "jobs", label: "Jobs", icon: ListChecks },
  { id: "matches", label: "Matches", icon: Search },
];

const decisionLabel = (decision: Evaluation["decision"]) => ({ eligible: "Suitable for review", excluded: "Outside criteria", review: "Needs information" })[decision];
const decisionTone = (decision: Evaluation["decision"]): "good" | "warn" | "muted" => decision === "eligible" ? "good" : decision === "review" ? "warn" : "muted";

function TraceTree({ trace }: { trace: Trace }) {
  return <li className="border-l border-ink-700 pl-4 py-2">
    <div className="flex items-center gap-2 flex-wrap"><strong className="text-xs font-medium text-ink-100">{trace.label}</strong><Pill tone={trace.truth === "true" ? "good" : trace.truth === "unknown" ? "warn" : "muted"}>{trace.truth === "true" ? "Pass" : trace.truth === "false" ? "Does not fit" : "Unknown"}</Pill></div>
    <p className="text-xs text-ink-400 mt-1 break-words">{trace.explanation}</p>
    {trace.children?.length ? <ul className="mt-2 space-y-1">{trace.children.map(child => <TraceTree key={child.id} trace={child} />)}</ul> : null}
  </li>;
}

function DecisionDetail({ evaluation }: { evaluation: Evaluation }) {
  return <div className="space-y-5 py-4">
    <div className="flex flex-wrap items-center gap-3"><Pill tone={decisionTone(evaluation.decision)}>{decisionLabel(evaluation.decision)}</Pill><span className="text-xs text-ink-300">Known score {evaluation.observedScore} · Possible range {evaluation.scoreRange.minimum}–{evaluation.scoreRange.maximum}</span></div>
    <ul className="list-disc pl-4 text-xs text-ink-300 space-y-1">{evaluation.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>
    <div><h3>Required conditions</h3><ul className="mt-3"><TraceTree trace={evaluation.eligibilityTrace} /></ul></div>
    <div><h3>How the score was calculated</h3>{evaluation.rankingTrace.map(item => <details key={item.id} className="border-b border-ink-800 py-3"><summary className="cursor-pointer flex justify-between gap-4 text-xs"><span>{item.label}</span><span>{item.awarded > 0 ? "+" : ""}{item.awarded} / {item.points} points</span></summary><ul className="mt-3"><TraceTree trace={item.trace} /></ul></details>)}</div>
    <details><summary className="text-xs text-ink-400 cursor-pointer">Decision record</summary><dl className="acq-facts"><div><dt>Evaluated</dt><dd>{prettyDate(evaluation.evaluatedAt)}</dd></div><div><dt>Rule version</dt><dd>{evaluation.revision}</dd></div><div><dt>Rule fingerprint</dt><dd>{evaluation.ruleHash}</dd></div><div><dt>Facts fingerprint</dt><dd>{evaluation.factsHash}</dd></div></dl></details>
  </div>;
}

function Metric({ label, value, note }: { label: string; value: ReactNode; note?: string }) {
  return <div className="acq-metric"><span>{label}</span><strong>{value}</strong>{note && <small className="!text-[10px]">{note}</small>}</div>;
}

type Payload = AutomationPayload;
type Mutation = Record<string, unknown> & { type: string };
type Promotion = { recordId: string; previewHash: string; preview?: ImportPreview };
const CSV_COLUMNS = "county,apn,address,city,zip,owner_name,mailing_address,phone,email,property_type,estimated_value,equity_pct,tax_delinquent_years,years_owned,nod,vacant,absentee,inherited,code_violations,notes\n";
function downloadTemplate() {
  const url = URL.createObjectURL(new Blob([CSV_COLUMNS], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a"); link.href = url; link.download = "sangam-source-template.csv"; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const FARM_ZIPS = "92501, 92503, 92505, 92507, 92401, 92404, 92408, 92410, 92551, 92553, 92555, 92335, 92336, 91761, 91762, 92376, 92324";
const sourceFields: FieldSpec[] = [
  { name: "name", label: "Source name", required: true, placeholder: "PropStream · Inland Empire" },
  { name: "permissionReference", label: "Source permission reference", required: true, type: "textarea", hint: "Identify the authorized account, permitted use and a retrievable document or reference. Do not enter credentials." },
  { name: "rightsExpiresAt", label: "Permission valid until", type: "datetime-local", hint: "Required for real sources. Record the actual permitted period, not an assumed renewal." },
  { name: "maxRows", label: "Maximum rows per upload", type: "number", min: 1, max: 500, value: 500, required: true },
  { name: "monthlyRowCap", label: "Monthly processing allowance", type: "number", min: 1, max: 10000, value: 5000, required: true, hint: "A hard processing limit for this source, including scheduled refreshes." },
  { name: "scheduleHours", label: "Refresh every (hours)", type: "number", min: 24, max: 720, value: 24, required: true, hint: "Re-evaluates records already uploaded. New PropStream data still requires a new export." },
  { name: "synthetic", label: "Fictional practice source", type: "checkbox", hint: "Use only invented records. Practice results never count toward real pilot targets." },
];
function evaluationOf(value: unknown): Evaluation | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (item.evaluation) return evaluationOf(item.evaluation);
  return typeof item.recordId === "string" && ["eligible", "excluded", "review"].includes(String(item.decision)) && !!item.eligibilityTrace && Array.isArray(item.rankingTrace) ? item as Evaluation : null;
}
function objectResult(value: unknown): Record<string, unknown> { return value && typeof value === "object" ? value as Record<string, unknown> : {}; }
function dateInput(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
function formatStatus(value: string) { return ({ leased: "Processing", retry_wait: "Retry scheduled", dead_letter: "Needs attention", approved: "Approved", draft: "Draft", queued: "Queued", completed: "Completed", held: "Held for review", paused: "Paused", revoked: "Revoked" } as Record<string, string>)[value] ?? humanize(value); }
function jobExplanation(code: string) {
  return ({ SOURCE_NOT_CURRENT: "Source permission or its observation date needs review.", PUBLISH_SELLER_RULE: "Publish a seller research rule before processing.", EXPORT_INPUT_MISSING: "Upload the complete export and its source date again.", ROW_LIMIT_EXCEEDED: "This source exceeded its row limit. Review the source settings or use a smaller file.", INVALID_EXPORT: "The export has invalid values or columns. Check the CSV template and original file.", INVALID_RULE: "The published rule needs administrator review.", WORKSPACE_CHANGED: "Workspace evidence changed during processing. A fresh attempt is scheduled.", PROCESSING_UNAVAILABLE: "Processing was interrupted. Inspect the retry status before submitting again.", SOURCE_REVISED: "The source changed. Review its current revision before restarting.", PERMISSION_REVOKED: "Source permission was revoked. New processing is blocked.", MONTHLY_LIMIT: "The monthly processing allowance is exhausted." } as Record<string, string>)[code] ?? humanize(code).toLowerCase();
}
function resultLabel(value: unknown, evaluation: Evaluation): string {
  const object = objectResult(value);
  const candidates = Array.isArray(value) ? value : object.results ?? object.evaluations ?? object.matches;
  const item = Array.isArray(candidates) ? candidates.find(candidate => evaluationOf(candidate)?.recordId === evaluation.recordId) : null;
  const detail = objectResult(item);
  return typeof detail.address === "string" && detail.address ? `${detail.address}${typeof detail.name === "string" ? ` · ${detail.name}` : ""}` : typeof detail.name === "string" ? detail.name : evaluation.recordId;
}
function sourceInput(source: Source): SourceInput {
  return { id: source.id, name: source.name, kind: "upload", status: source.status, permissionReference: source.permissionReference, rightsExpiresAt: source.rightsExpiresAt, synthetic: source.synthetic, enabled: source.enabled, scheduleHours: source.scheduleHours, maxRows: source.maxRows, monthlyRowCap: source.monthlyRowCap, config: {} };
}

export function AutomationDesk() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [offset, setOffset] = useState(0);
  const offsetRef = useRef(offset);
  offsetRef.current = offset;
  const [payload, setPayload] = useState<Payload | null>(null);
  const [tab, setTab] = useState<Tab>("sources");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [focusedSource, setFocusedSource] = useState("");
  const [focusedRule, setFocusedRule] = useState("");
  const [focusedRecord, setFocusedRecord] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [dryRun, setDryRun] = useState<unknown>(null);
  const [buyerResults, setBuyerResults] = useState<{ contractId: string; result: unknown } | null>(null);
  const [buyerContractId, setBuyerContractId] = useState("");
  const [promotion, setPromotion] = useState<Promotion | null>(null);
  const [rulePurpose, setRulePurpose] = useState<"seller_research" | "buyer_fit">("seller_research");
  const [search, setSearch] = useState("");
  const workspaceRef = useRef(workspaceId);
  workspaceRef.current = workspaceId;

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const response = await fetch("/api/workspaces", { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load your workspaces.");
        if (controller.signal.aborted) return;
        const list = data.workspaces as Workspace[];
        setWorkspaces(list);
        let preferred = "";
        try { preferred = localStorage.getItem("sangam.workspace") ?? ""; } catch { /* Optional storage. */ }
        setWorkspaceId(list.find(item => item.id === preferred)?.id ?? list[0]?.id ?? "");
        if (!list.length) setBusy(false);
      } catch (cause) { if (!controller.signal.aborted) { setError(cause instanceof Error ? cause.message : "Could not load your workspaces."); setBusy(false); } }
    })();
    return () => controller.abort();
  }, []);

  const reload = useCallback(async (id: string, signal?: AbortSignal, quiet = false, pageOffset = offsetRef.current) => {
    if (!id) return;
    if (!quiet) { setBusy(true); setError(""); }
    try {
      const response = await fetch(`/api/automation?workspaceId=${encodeURIComponent(id)}&offset=${pageOffset}`, { cache: "no-store", signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load sourcing and matching.");
      if (workspaceRef.current === id && offsetRef.current === pageOffset && !signal?.aborted) { setPayload(data as Payload); setBuyerResults(null); }
    } catch (cause) { if (workspaceRef.current === id && offsetRef.current === pageOffset && !signal?.aborted) setError(cause instanceof Error ? cause.message : "Could not load sourcing and matching."); }
    finally { if (workspaceRef.current === id && offsetRef.current === pageOffset && !signal?.aborted && !quiet) setBusy(false); }
  }, []);

  useEffect(() => {
    if (!workspaceId) return;
    setOffset(0); offsetRef.current = 0; setPayload(null); setError(""); setNotice(""); setFocusedSource(""); setFocusedRule(""); setFocusedRecord(""); setSourceId(""); setCsv(""); setFileName(""); setDryRun(null); setBuyerResults(null); setBuyerContractId(""); setPromotion(null); setSearch("");
    try { localStorage.setItem("sangam.workspace", workspaceId); } catch { /* Optional storage. */ }
    const controller = new AbortController(); void reload(workspaceId, controller.signal, false, 0);
    return () => controller.abort();
  }, [workspaceId, reload]);

  const pendingJobs = payload?.jobs.some(job => ["queued", "leased", "retry_wait"].includes(job.status)) ?? false;
  useEffect(() => {
    if (!workspaceId || !pendingJobs || busy) return;
    const controller = new AbortController();
    const timer = setInterval(() => void reload(workspaceId, controller.signal, true), 15000);
    return () => { clearInterval(timer); controller.abort(); };
  }, [workspaceId, pendingJobs, busy, reload]);

  async function command(value: Mutation, success = "Saved. The workspace record is up to date."): Promise<unknown> {
    if (!payload || busy) return undefined;
    const target = workspaceId;
    const targetOffset = offsetRef.current;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/automation?offset=${targetOffset}`, { method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", body: JSON.stringify({ workspaceId: target, version: 0, command: value }) });
      const data = await response.json();
      if (!response.ok) throw new Error(response.status === 409 ? data.error || "This record changed. Refresh and review it before trying again." : data.error || "The request could not be completed.");
      if (workspaceRef.current !== target) return undefined;
      if (Array.isArray(data.sources)) setPayload(data as Payload);
      else await reload(target, undefined, true);
      setNotice(success);
      return data.result ?? data;
    } catch (cause) { if (workspaceRef.current === target) setError(cause instanceof Error ? cause.message : "The request could not be completed."); return undefined; }
    finally { if (workspaceRef.current === target) setBusy(false); }
  }

  const workspace = workspaces.find(item => item.id === workspaceId);
  const reviewer = ["admin", "reviewer"].includes(payload?.role ?? workspace?.role ?? "");
  const source = payload?.sources.find(item => item.id === focusedSource);
  const rule = payload?.rules.find(item => item.id === focusedRule);
  const record = payload?.records.find(item => item.id === focusedRecord);
  const approvedSources = payload?.sources.filter(item => item.status === "approved") ?? [];
  const savedDecisionItems = (payload?.decisions ?? []).flatMap(run => run.results).filter((value): value is DecisionItem => !!value && typeof value === "object" && "evaluation" in value);
  const decisionFor = (item: SourceRecord) => savedDecisionItems.find(decision => decision.purpose === "seller_research" && decision.recordId === item.id)?.evaluation;
  const decisionIsCurrent = (item: SourceRecord) => {
    const saved = savedDecisionItems.find(decision => decision.purpose === "seller_research" && decision.recordId === item.id);
    if (!saved) return false;
    const origin = payload?.sources.find(source => source.id === item.sourceId);
    const active = payload?.rules.find(rule => rule.purpose === "seller_research" && rule.status === "published");
    return origin?.status === "approved" && origin.revision === saved.sourceRevision && active?.ruleId === saved.evaluation.ruleId && active.revision === saved.evaluation.revision;
  };
  const filteredRecords = payload?.records.filter(item => `${item.lead.address} ${item.lead.ownerName} ${item.lead.apn}`.toLowerCase().includes(search.toLowerCase())) ?? [];
  const publishedRules = payload?.rules.filter(item => item.status === "published") ?? [];
  const contractOptions = payload?.acquisition?.contracts.filter(contract => !contract.termination).map(contract => ({ value: contract.id, label: payload.acquisition.leads.find(lead => lead.id === contract.leadId)?.address ?? contract.id })) ?? [];
  const savedBuyerItems = savedDecisionItems.filter(item => item.purpose === "buyer_fit");
  const selectedBuyerContract = contractOptions.some(option => option.value === buyerContractId) ? buyerContractId
    : savedBuyerItems.find(item => contractOptions.some(option => option.value === item.contractId))?.contractId ?? contractOptions[0]?.value ?? "";
  const explicitBuyerResults = buyerResults?.contractId === selectedBuyerContract ? buyerResults.result : null;
  const displayedBuyerItems = (() => {
    const raw = explicitBuyerResults === null ? savedBuyerItems : objectResult(explicitBuyerResults).results;
    if (!Array.isArray(raw)) return [];
    const seen = new Set<string>();
    return raw.filter((item): item is DecisionItem => !!item && typeof item === "object" && "evaluation" in item && item.purpose === "buyer_fit" && item.contractId === selectedBuyerContract)
      .filter(item => { if (seen.has(item.recordId)) return false; seen.add(item.recordId); return true; });
  })();
  function buyerDecisionCurrent(item: DecisionItem) {
    const activeRule = payload?.rules.find(rule => rule.purpose === "buyer_fit" && rule.status === "published");
    const source = payload?.sources.find(source => source.id === item.sourceId);
    const buyer = payload?.acquisition.buyers.find(buyer => buyer.id === item.buyerId);
    const lead = payload?.acquisition.leads.find(lead => lead.id === item.leadId);
    const evaluatedAt = Date.parse(item.evaluation.evaluatedAt);
    return activeRule?.ruleId === item.evaluation.ruleId && activeRule.revision === item.evaluation.revision
      && (source ? source.status === "approved" && source.revision === item.sourceRevision : item.sourceRevision === 0)
      && !!buyer && !!lead && evaluatedAt >= Date.parse(buyer.updatedAt) && evaluatedAt >= Date.parse(lead.updatedAt);
  }
  const decisionResultList = (value: unknown): Evaluation[] => {
    if (Array.isArray(value)) return value.map(evaluationOf).filter((item): item is Evaluation => !!item);
    const object = objectResult(value);
    return decisionResultListInner(object.results ?? object.evaluations ?? object.matches ?? []);
  };
  function decisionResultListInner(value: unknown): Evaluation[] { return Array.isArray(value) ? value.map(evaluationOf).filter((item): item is Evaluation => !!item) : []; }
  async function changePage(nextOffset: number) {
    setOffset(nextOffset); offsetRef.current = nextOffset; setSearch(""); setFocusedRecord(""); setPromotion(null); setDryRun(null);
    await reload(workspaceId, undefined, false, nextOffset);
  }
  async function uploadFile(file: File | undefined) {
    if (!file) return;
    setError(""); setCsv(""); setFileName("");
    if (file.size > 1_500_000) { setError("Use a CSV smaller than 1.5 MB and within the source row limit."); return; }
    const target = workspaceId;
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
      if (workspaceRef.current === target) { setCsv(text); setFileName(file.name); }
    } catch { if (workspaceRef.current === target) setError("This file is not valid UTF-8. Export it as UTF-8 CSV and try again."); }
  }
  async function preparePromotion(item: SourceRecord) {
    setPromotion(null);
    const result = objectResult(await command({ type: "preview_record", recordId: item.id }, "Review this candidate before adding it to Acquisition."));
    const preview = objectResult(result.preview);
    const hash = typeof result.previewHash === "string" ? result.previewHash : typeof preview.previewHash === "string" ? preview.previewHash : "";
    if (hash) setPromotion({ recordId: item.id, previewHash: hash, preview: result.preview as ImportPreview | undefined });
  }

  return <div className="acq-desk" aria-busy={busy}>
    <header className="acq-heading"><div><p className="acq-eyebrow">SANGAM · ACQUISITION INTELLIGENCE</p><h1>Sourcing & matching</h1><p className="acq-subtitle">A steady research queue, with a reason behind every match.</p></div><div className="acq-heading-tools"><Pill><ShieldCheck size={12} />Mail & calls stay manual</Pill><button className="acq-icon-button" aria-label="Refresh sourcing workspace" disabled={busy || !workspaceId} onClick={() => void reload(workspaceId)}><RefreshCw size={16} className={busy ? "animate-spin" : ""} /></button></div></header>
    <div className="acq-workspace-bar"><label htmlFor="automation-workspace">Workspace</label><select id="automation-workspace" value={workspaceId} disabled={busy} onChange={event => setWorkspaceId(event.target.value)}><option value="" disabled>Select workspace</option>{workspaces.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>{workspace && <Pill>{workspace.role}</Pill>}<span className="acq-workspace-note">Uploaded data is processed automatically. Contact and deal decisions stay with you.</span></div>
    {error && <div className="acq-alert acq-alert-error" role="alert"><strong>Action needed</strong><p>{error}</p><button className="acq-text-button" disabled={busy} onClick={() => void reload(workspaceId)}>Refresh workspace</button></div>}
    {notice && <div className="acq-alert acq-alert-success" role="status"><Check size={17} /><p>{notice}</p><button onClick={() => setNotice("")} aria-label="Dismiss notification">×</button></div>}
    {!payload ? <Panel title="Your research workspace"><Empty title={busy ? "Opening your workspace" : "Workspace access is required"}>{busy ? "Loading sources, rules and processing activity." : "An administrator must grant workspace access before any lead data is visible."}</Empty></Panel> : <>
      <nav className="acq-tabs" aria-label="Sourcing and matching sections">{TABS.map(item => <button key={item.id} onClick={() => setTab(item.id)} className={tab === item.id ? "active" : ""} aria-current={tab === item.id ? "page" : undefined}><item.icon size={15} />{item.label}{item.id === "jobs" && pendingJobs && <span>Working</span>}</button>)}</nav>
      {tab === "sources" && <div className="acq-stack">
        <div className="acq-info"><CircleHelp size={18} /><div><strong>Start with your authorized PropStream export.</strong><p>Export in PropStream, upload it here, and Sangam handles validation, deduplication, scoring and research decisions. Daily refreshes re-evaluate uploaded records; they do not fetch new PropStream data.</p></div></div>
        <div className="acq-stats"><Metric label="Approved sources" value={approvedSources.length} /><Metric label="Automatic refreshes enabled" value={approvedSources.filter(item => item.enabled).length} /><Metric label="Research records" value={payload.recordCount} note="Separate from real outreach results" /><Metric label="Published rules" value={publishedRules.length} /></div>
        <Panel title="Your sources" description="Each source keeps its permission reference, limits and processing history.">{payload.sources.length ? <div className="acq-table-wrap"><table><thead><tr><th>Source</th><th>Status</th><th>Refresh</th><th>Limits</th><th>Permission</th></tr></thead><tbody>{payload.sources.map(item => <tr key={item.id} className={focusedSource === item.id ? "selected" : ""}><td><button className="acq-cell-button" onClick={() => setFocusedSource(item.id)}><strong>{item.name}</strong><small>PropStream / authorized CSV export · {item.synthetic ? "Practice" : "Real data"}</small></button></td><td><Pill tone={item.status === "approved" ? "good" : item.status === "draft" ? "warn" : "muted"}>{formatStatus(item.status)}</Pill></td><td>{item.enabled && item.status === "approved" ? `Every ${item.scheduleHours} hours` : "Off"}</td><td>{item.maxRows} per upload<small>{item.monthlyRowCap.toLocaleString()} processed rows / month</small></td><td>{item.rightsExpiresAt ? `Until ${prettyDate(item.rightsExpiresAt)}` : item.synthetic ? "Practice only" : "Expiry needed"}</td></tr>)}</tbody></table></div> : <Empty title="Add your first source">Register the export and its source permission, review it, then upload the file. No provider is connected automatically.</Empty>}</Panel>
        {source && <Panel title={source.name} description={`Revision ${source.revision} · ${source.synthetic ? "Fictional practice records only" : "Real source evidence required"}`} action={<button className="acq-text-button" onClick={() => setFocusedSource("")}>Close</button>}>
          <dl className="acq-facts"><div><dt>Status</dt><dd>{formatStatus(source.status)}</dd></div><div><dt>Permission reference</dt><dd>{source.permissionReference || "Not recorded"}</dd></div><div><dt>Permission valid until</dt><dd>{prettyDate(source.rightsExpiresAt)}</dd></div></dl>
          {source.status === "approved" && <div className="acq-panel-footer"><button className="btn btn-primary" disabled={busy} onClick={() => { setSourceId(source.id); setTab("jobs"); }}>Upload a new export<Upload size={14} /></button><button className="btn btn-ghost" disabled={busy} onClick={() => void command({ type: "run_source", sourceId: source.id, requestKey: crypto.randomUUID() }, "Refresh queued. Existing source records will be re-evaluated.")}>Refresh existing records</button></div>}
          {reviewer && <>
            {source.status !== "approved" && <DeskForm key={`approve-${source.id}-${source.revision}`} title="Review source permission" description="Approval records your review of this exact source and its permitted use. A real source also needs the current Data source permission gate in Acquisition." busy={busy} fields={[{ name: "enabled", label: "Enable scheduled refresh of uploaded records", type: "checkbox", hint: `Run at most once every ${source.scheduleHours} hours while this source remains approved and within its allowance.` }]} submitLabel="Approve source" onSubmit={d => command({ type: "save_source", expectedRevision: source.revision, source: { ...sourceInput(source), status: "approved", enabled: d.get("enabled") === "on" } }, "Source approval recorded. Its limits and current permission will be checked again at processing time.")} />}
            {source.status === "approved" && <div className="acq-panel-footer"><button className="btn btn-ghost" disabled={busy} onClick={() => void command({ type: "save_source", expectedRevision: source.revision, source: { ...sourceInput(source), enabled: !source.enabled } }, source.enabled ? "Scheduled refresh disabled." : "Scheduled refresh enabled for already uploaded records.")}>{source.enabled ? "Turn off scheduled refresh" : "Enable scheduled refresh"}</button><button className="btn btn-ghost" disabled={busy} onClick={() => void command({ type: "save_source", expectedRevision: source.revision, source: { ...sourceInput(source), status: "paused", enabled: false } }, "Source paused. New jobs will not use it.")}>Pause source</button></div>}
            <Fold title="Edit source details"><DeskForm key={`edit-${source.id}-${source.revision}`} title="Save a new draft revision" description="Changing source details requires another review before processing resumes." busy={busy} fields={sourceFields.filter(field => field.name !== "synthetic").map(field => ({ ...field, value: field.name === "rightsExpiresAt" ? dateInput(source.rightsExpiresAt) : (source as unknown as Record<string, string | number>)[field.name] ?? field.value }))} submitLabel="Save source draft" onSubmit={d => command({ type: "save_source", expectedRevision: source.revision, source: { ...sourceInput(source), name: textValue(d, "name"), status: "draft", enabled: false, permissionReference: textValue(d, "permissionReference"), rightsExpiresAt: textValue(d, "rightsExpiresAt") ? dateValue(d, "rightsExpiresAt") : null, scheduleHours: numberValue(d, "scheduleHours"), maxRows: numberValue(d, "maxRows"), monthlyRowCap: numberValue(d, "monthlyRowCap"), config: {} } }, "New source draft saved. Review it before resuming processing.")} /></Fold>
            {source.status !== "revoked" && <Fold title="Revoke source permission"><p className="acq-muted">Stops processing and prevents new use of this source. Existing decision history remains an audit record.</p><div className="acq-panel-footer"><button className="btn btn-danger" disabled={busy} onClick={() => void command({ type: "save_source", expectedRevision: source.revision, source: { ...sourceInput(source), status: "revoked", enabled: false } }, "Source permission revoked. New processing and candidate promotion are blocked.")}>Revoke this source</button></div></Fold>}
          </>}
        </Panel>}
        {reviewer ? <Panel title="Register an export source" description="Start with a draft. Saving a source does not approve data use or start a job."><DeskForm title="Source details" busy={busy} fields={sourceFields} submitLabel="Save source draft" onSubmit={async d => {
          const result = objectResult(await command({ type: "save_source", expectedRevision: 0, source: { name: textValue(d, "name"), kind: "upload", status: "draft", permissionReference: textValue(d, "permissionReference"), rightsExpiresAt: textValue(d, "rightsExpiresAt") ? dateValue(d, "rightsExpiresAt") : null, synthetic: d.get("synthetic") === "on", enabled: false, scheduleHours: numberValue(d, "scheduleHours"), maxRows: numberValue(d, "maxRows"), monthlyRowCap: numberValue(d, "monthlyRowCap"), config: {} } }, "Source draft saved. Select it to review permission before uploading."));
          const saved = objectResult(result.source ?? result); if (typeof saved.id === "string") setFocusedSource(saved.id);
        }} /></Panel> : <div className="acq-info"><ShieldCheck size={18} /><p>A reviewer or administrator manages source permission and automatic refresh settings. You can upload to approved sources and review their results.</p></div>}
      </div>}
      {tab === "rules" && <div className="acq-stack">
        <div className="acq-info"><GitBranch size={18} /><div><strong>Set the fit, then inspect the reason.</strong><p>Required conditions are checked before ranking. Missing or stale facts go to review. A research match never approves outreach or replaces a buyer’s stated buy box.</p></div></div>
        <Panel title="Decision rules" description="Draft a version, compare its decisions, then publish it for future processing.">{payload.rules.length ? <div className="acq-table-wrap"><table><thead><tr><th>Rule</th><th>Use</th><th>Version</th><th>Status</th><th>Saved</th></tr></thead><tbody>{payload.rules.map(item => <tr key={item.id} className={focusedRule === item.id ? "selected" : ""}><td><button className="acq-cell-button" onClick={() => { setFocusedRule(item.id); setDryRun(null); }}><strong>{(item.rule as RuleSet).name}</strong></button></td><td>{item.purpose === "seller_research" ? "Seller research" : "Buyer fit"}</td><td>{item.revision}</td><td><Pill tone={item.status === "published" ? "good" : item.status === "draft" ? "warn" : "muted"}>{humanize(item.status)}</Pill></td><td>{prettyDate(item.createdAt)}</td></tr>)}</tbody></table></div> : <Empty title="Choose your starting rules">Use the original Inland Empire seller rubric and buyer buy-box template, then tune a future version against actual results.</Empty>}</Panel>
        {rule && <Panel title={(rule.rule as RuleSet).name} description={`Version ${rule.revision} · ${humanize(rule.status)} · Preview uses the current research page (${payload.records.length} records).`} action={<button className="acq-text-button" onClick={() => { setFocusedRule(""); setDryRun(null); }}>Close</button>}>
          <RuleDescription rule={rule.rule as RuleSet} />
          <div className="acq-panel-footer"><button className="btn btn-ghost" disabled={busy} onClick={async () => { const result = await command({ type: "dry_run_rule", ruleVersionId: rule.id, offset }, "Dry run completed. Inspect the decisions before publishing."); if (result !== undefined) setDryRun(result); }}>Preview decisions</button>{reviewer && rule.status === "draft" && <button className="btn btn-primary" disabled={busy} onClick={() => void command({ type: "publish_rule", ruleVersionId: rule.id }, "Rule version published after a current server evaluation. Future evaluations use it; outreach stays manual.")}>Publish this version<Check size={14} /></button>}</div>
          {dryRun !== null && <div className="px-6 pb-6"><DryRunResults value={dryRun} evaluations={decisionResultList(dryRun)} /></div>}
          {reviewer && <Fold title="Advanced: edit the decision tree"><p className="acq-muted">Create a later version using structured conditions. Protected source, suppression and buy-box checks still apply. No executable code is accepted.</p><DeskForm key={`json-${rule.id}`} title="New rule version" busy={busy} fields={[{ name: "ruleJson", label: "Decision tree JSON", type: "textarea", required: true, value: JSON.stringify({ ...(rule.rule as RuleSet), revision: Math.max(...payload.rules.filter(item => item.ruleId === rule.ruleId).map(item => item.revision)) + 1 }, null, 2) }]} submitLabel="Validate & save new draft" onSubmit={async d => { let parsed: unknown; try { parsed = JSON.parse(textValue(d, "ruleJson")); } catch { setError("The decision tree is not valid JSON. Check the brackets and quotes, then try again."); return; } return command({ type: "save_rule", rule: parsed }, "New rule draft saved. Preview its decisions before publishing."); }} /></Fold>}
        </Panel>}
        {reviewer && <Panel title="Create a rule draft" description="Each template keeps the original scoring weights. Saving creates a new version without changing the published rules."><form className="acq-form" onSubmit={async event => { event.preventDefault(); const d = new FormData(event.currentTarget); const result = objectResult(await command({ type: "create_rule", purpose: rulePurpose, ...(rulePurpose === "seller_research" ? { farmZips: listValue(d, "farmZips"), minimumScore: numberValue(d, "minimumScore") } : {}) }, "Rule draft created. Preview it, then publish when ready.")); const saved = objectResult(result.ruleVersion ?? result); if (typeof saved.id === "string") setFocusedRule(saved.id); }}><h3>Start from an established template</h3><fieldset className="acq-form-grid" disabled={busy}><div className="acq-field"><label htmlFor="rule-purpose">Match type</label><select id="rule-purpose" className="acq-input" value={rulePurpose} onChange={event => setRulePurpose(event.target.value as "seller_research" | "buyer_fit")}><option value="seller_research">Seller research</option><option value="buyer_fit">Buyer fit</option></select></div>{rulePurpose === "seller_research" ? <><Field field={{ name: "minimumScore", label: "Minimum seller score", type: "number", value: 8, min: 0, max: 20, step: 1, required: true }} /><Field field={{ name: "farmZips", label: "Farm ZIP codes", type: "textarea", value: FARM_ZIPS, required: true, hint: "Separate five-digit ZIP codes with commas. County and source checks remain in place." }} /></> : <div className="acq-span acq-muted">Checks ZIP, property type, total price, rehab appetite and current buyer permission. Suitable buyers are ranked by observed cash purchase activity.</div>}<div className="acq-span"><button className="btn btn-primary" type="submit">Create draft<ArrowRight size={14} /></button></div></fieldset></form></Panel>}
      </div>}
      {tab === "jobs" && <div className="acq-stack">
        <Panel title="Upload an authorized export" description="Sangam validates and processes the file automatically. This creates research records, not a mail or calling batch."><form className="acq-form" onSubmit={async event => { event.preventDefault(); const d = new FormData(event.currentTarget); if (!csv) { setError("Choose a UTF-8 CSV file first."); return; } const result = await command({ type: "upload_source", sourceId: textValue(d, "sourceId"), csv, sourceDate: dateValue(d, "sourceDate"), requestKey: crypto.randomUUID() }, "Export submitted for automatic processing. Inspect the job and its research results below."); if (result !== undefined) { setCsv(""); setFileName(""); } }}><fieldset className="acq-form-grid" disabled={busy}><div className="acq-field"><label htmlFor="upload-source">Approved source *</label><select id="upload-source" name="sourceId" className="acq-input" required value={sourceId} onChange={event => setSourceId(event.target.value)}><option value="">Choose an approved source…</option>{approvedSources.map(item => <option key={item.id} value={item.id}>{item.name}{item.synthetic ? " · Practice" : ""}</option>)}</select>{!approvedSources.length && <small>Register and approve a source in Sources first.</small>}</div><Field key={`date-${sourceId}`} field={{ name: "sourceDate", label: "Actual source/export date", type: "date", required: true, hint: "Use the actual date of the data. A scheduled refresh preserves this date." }} /><label className="acq-upload acq-span"><Upload size={22} /><strong>{fileName || "Choose your PropStream CSV"}</strong><span>UTF-8 CSV · up to 500 rows and 1.5 MB · use the Acquisition import column format</span><input key={`${workspaceId}-${fileName ? "chosen" : "empty"}`} aria-label="Source CSV export" type="file" accept=".csv,text/csv" onChange={event => void uploadFile(event.target.files?.[0])} /></label><div className="acq-span flex gap-3 flex-wrap"><button className="btn btn-primary" disabled={!csv || !sourceId} type="submit">Process export<ArrowRight size={14} /></button><button type="button" className="btn btn-ghost" onClick={downloadTemplate}>Download CSV template</button></div></fieldset></form></Panel>
        <Panel title="Processing history" description="Uploads and refreshes share the same limits and permission checks. A completed job never means a person was contacted." action={<button className="acq-text-button" disabled={busy} onClick={() => void reload(workspaceId)}>Refresh status<RefreshCw size={13} /></button>}>
          {payload.jobs.length ? <div className="acq-table-wrap"><table><thead><tr><th>Job</th><th>Source</th><th>Status</th><th>Rows</th><th>Attempts</th><th>Details</th></tr></thead><tbody>{payload.jobs.map(job => <tr key={job.id}><td><strong>{job.kind === "ingest" ? "Process export" : "Refresh existing records"}</strong><small>{prettyDate(job.createdAt)}</small></td><td>{payload.sources.find(item => item.id === job.sourceId)?.name ?? "Source unavailable"}<small>Source revision {job.sourceRevision}</small></td><td><Pill tone={job.status === "completed" ? "good" : ["held", "dead_letter"].includes(job.status) ? "warn" : "muted"}>{formatStatus(job.status)}</Pill></td><td>{job.recordCount}</td><td>{job.attempts}</td><td>{job.errorCode ? <span>{jobExplanation(job.errorCode)}</span> : job.completedAt ? `Completed ${prettyDate(job.completedAt)}` : `Next check ${prettyDate(job.nextAttemptAt)}`}<small className="font-mono">{job.id}</small></td></tr>)}</tbody></table></div> : <Empty title="No processing jobs yet">Upload an approved export. Its validation, row count and outcome will appear here.</Empty>}
        </Panel>
      </div>}
      {tab === "matches" && <div className="acq-stack">
        <Panel title="Seller research queue" description="Saved decisions describe the facts at evaluation time. Source permission, rules and suppression are checked again before moving a candidate into Acquisition." action={<button className="btn btn-ghost" disabled={busy || !payload.records.length} onClick={() => void command({ type: "evaluate", offset }, "Research decisions refreshed against the current published rule and current permission evidence.")}>Evaluate current records<RefreshCw size={14} /></button>}>
          <div className="acq-toolbar"><label className="acq-search"><span className="sr-only">Search this page of research records</span><input placeholder="Search this page by address, owner or parcel…" value={search} onChange={event => setSearch(event.target.value)} /></label><span className="acq-muted">Showing {payload.records.length ? offset + 1 : 0}–{offset + payload.records.length} of {payload.recordCount} records</span></div>
          {filteredRecords.length ? <div className="acq-table-wrap"><table><thead><tr><th>Candidate</th><th>Source</th><th>Decision</th><th>Score</th><th>Observed</th></tr></thead><tbody>{filteredRecords.map(item => { const evaluation = decisionFor(item); return <tr key={item.id} className={focusedRecord === item.id ? "selected" : ""}><td><button className="acq-cell-button" onClick={() => { setFocusedRecord(item.id); setPromotion(null); }}><strong>{item.lead.address}</strong><small>{item.lead.ownerName} · {item.lead.apn}</small></button>{item.lead.synthetic && <Pill>Practice</Pill>}</td><td>{payload.sources.find(source => source.id === item.sourceId)?.name ?? item.lead.source}</td><td>{evaluation ? <Pill tone={decisionTone(evaluation.decision)}>{decisionLabel(evaluation.decision)}</Pill> : <Pill tone="warn">Awaiting evaluation</Pill>}{evaluation && <small>{decisionIsCurrent(item) ? "Saved result · rechecked before use" : "Historical · re-evaluate"}</small>}</td><td>{evaluation ? `${evaluation.scoreRange.minimum}–${evaluation.scoreRange.maximum}` : "—"}</td><td>{item.lead.sourceDate.slice(0, 10)}</td></tr>; })}</tbody></table></div> : <Empty title={payload.recordCount ? "No records match this search" : "Your research queue is empty"}>{payload.recordCount ? "Try an address, owner name or parcel number on this page, or browse the other pages." : "Process an approved export and publish a seller rule to see explained research decisions."}</Empty>}
          <div className="acq-panel-footer"><p>Search covers this page. Browse the next page to review more records.</p><div className="flex gap-3"><button className="btn btn-ghost" disabled={busy || offset === 0} onClick={() => void changePage(Math.max(0, offset - payload.recordLimit))}>Previous page</button><button className="btn btn-ghost" disabled={busy || offset + payload.records.length >= payload.recordCount} onClick={() => void changePage(offset + payload.recordLimit)}>Next page</button></div></div>
        </Panel>
        {record && <Panel title={record.lead.address} description={`${record.lead.ownerName} · ${record.lead.synthetic ? "Fictional practice candidate" : "Real research candidate"}`} action={<button className="acq-text-button" onClick={() => { setFocusedRecord(""); setPromotion(null); }}>Close</button>}><div className="px-6"><dl className="acq-facts !px-0"><div><dt>Source permission</dt><dd>{record.lead.permissionReference}</dd></div><div><dt>Source date</dt><dd>{record.lead.sourceDate.slice(0, 10)}</dd></div><div><dt>Parcel</dt><dd>{record.lead.county} · {record.lead.apn}</dd></div></dl>{decisionFor(record) ? <DecisionDetail evaluation={decisionFor(record)!} /> : <p className="acq-muted py-4">Publish a seller rule and evaluate current records to inspect this candidate’s decision.</p>}</div><div className="acq-panel-footer"><p>Current source permission, suppression and import gates are checked again before adding a candidate.</p><button className="btn btn-primary" disabled={busy || decisionFor(record)?.decision !== "eligible" || !decisionIsCurrent(record)} onClick={() => void preparePromotion(record)}>Review for Acquisition<ArrowRight size={14} /></button></div>{promotion?.recordId === record.id && <div className="m-6 mt-0 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-5"><h3>Confirm this reviewed candidate</h3><p className="acq-muted mt-2">{record.lead.address} · {record.lead.ownerName}. This adds or updates the lead in Acquisition and preserves its {record.lead.synthetic ? "practice" : "real"} status. It does not prepare or send outreach.</p><div className="mt-4 flex gap-3"><button className="btn btn-primary" disabled={busy} onClick={async () => { const result = await command({ type: "promote_record", recordId: record.id, previewHash: promotion.previewHash }, "Candidate added to Acquisition. Review contact evidence and prepare any mail or calls manually."); if (result !== undefined) setPromotion(null); }}>Add reviewed candidate</button><button className="btn btn-ghost" disabled={busy} onClick={() => setPromotion(null)}>Cancel</button></div></div>}</Panel>}
        <Panel title="Match a contracted deal to buyers" description="Automatic matching results are saved here by contract. Select a property to review its latest available results; buyer delivery stays manual.">
          <form className="acq-form" onSubmit={async event => { event.preventDefault(); const contractId = selectedBuyerContract; const result = await command({ type: "match_buyers", contractId }, "Buyer matching completed. Inspect each reason before preparing a manual packet in Acquisition."); if (result !== undefined) setBuyerResults({ contractId, result }); }}>
            <h3>Choose a signed contract</h3><fieldset className="acq-form-grid" disabled={busy || !contractOptions.length}><div className="acq-field"><label htmlFor="buyer-contract">Contracted property</label><select id="buyer-contract" className="acq-input" required value={selectedBuyerContract} onChange={event => { setBuyerContractId(event.target.value); setBuyerResults(null); }}><option value="">Choose a contract…</option>{contractOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div><div className="acq-span"><button className="btn btn-primary" type="submit">Find suitable buyers<ArrowRight size={14} /></button></div></fieldset>
          </form>
          {!contractOptions.length && <p className="acq-muted px-6 pb-6">Record an actual signed contract in Acquisition, or use a fictional contract in your practice workspace, to test buyer matching.</p>}
          {selectedBuyerContract && <div className="px-6 pb-6">{displayedBuyerItems.length ? <><p className="acq-muted pb-4">{explicitBuyerResults === null ? "Saved matching results" : "Latest matching results"} for the selected contract. Changes to source evidence, buyer profiles or rules require a fresh check before use.</p>{displayedBuyerItems.map(item => <Fold key={item.recordId} title={`${item.name} · ${decisionLabel(item.evaluation.decision)}`}><div className="pt-4"><Pill tone={buyerDecisionCurrent(item) ? "muted" : "warn"}>{buyerDecisionCurrent(item) ? "Saved result · rechecked before use" : "Historical · re-evaluate"}</Pill></div><DecisionDetail evaluation={item.evaluation} /></Fold>)}</> : <Empty title="No saved buyer decisions for this contract">Add current buyer profiles, publish a buyer rule and run matching. Future automatic evaluations and manual checks appear here and remain available after reloading.</Empty>}</div>}
        </Panel>
        <div className="acq-info"><ShieldCheck size={18} /><p>Matching does not send buyer alerts, mail, texts or calls. Continue in <Link href="/acquisition" className="underline text-emerald-300">Acquisition</Link> to prepare and approve a manual batch or buyer packet.</p></div>
      </div>}
      <footer className="acq-footer"><span><ShieldCheck size={12} />Workspace data stays private. Outbound sending is disabled.</span><span>Research activity does not start the 90-day outreach clock.</span></footer>
    </>}
  </div>;
}

function RuleDescription({ rule }: { rule: RuleSet }) {
  return <div className="px-6 py-5 space-y-4"><div className="flex gap-3 flex-wrap text-xs text-ink-300"><Pill>{rule.purpose === "seller_research" ? "Seller research" : "Buyer fit"}</Pill><span>Minimum score: {rule.minimumScore}</span><span>{rule.ranking.length} scoring conditions</span></div><div><h3>Required conditions</h3><RuleNodeView node={rule.eligibility} /></div><div><h3>Scoring weights</h3><div className="grid sm:grid-cols-2 gap-x-6 mt-2">{rule.ranking.map(item => <div className="flex justify-between gap-3 py-2 border-b border-ink-800 text-xs" key={item.id}><span className="text-ink-300">{item.label}</span><span className="text-emerald-300">{item.points > 0 ? "+" : ""}{item.points}</span></div>)}</div></div></div>;
}
function RuleNodeView({ node }: { node: RuleSet["eligibility"] }) {
  let children: ReactNode = null;
  if (node.kind === "all" || node.kind === "any") children = node.children.map(child => <RuleNodeView key={child.id} node={child} />);
  else if (node.kind === "not") children = <RuleNodeView node={node.child} />;
  else if (node.kind === "predicate" && node.right.kind === "literal") children = <p className="text-[11px] text-ink-400 break-words mt-1">{Array.isArray(node.right.value) ? node.right.value.join(", ") : typeof node.right.value === "boolean" ? "" : `${String(node.right.value)}${node.right.unit === "none" ? "" : ` ${humanize(node.right.unit)}`}`}</p>;
  return <div className="border-l border-ink-700 pl-4 mt-3"><div className="text-xs text-ink-200">{node.kind === "all" ? "All conditions" : node.kind === "any" ? "Any condition" : node.kind === "not" ? "Must not match" : node.label}{node.kind !== "predicate" && <span className="text-ink-400"> · {node.label}</span>}</div>{children}</div>;
}
function DryRunResults({ value, evaluations }: { value: unknown; evaluations: Evaluation[] }) {
  const object = objectResult(value);
  const comparison = objectResult(object.comparison);
  return <div className="space-y-4"><div className="acq-info"><GitBranch size={16} /><div><strong>Draft preview</strong><p>{evaluations.length} decisions evaluated.{typeof comparison.changedCount === "number" ? ` ${comparison.changedCount} changed from the published version.` : " No published rule was changed."}</p></div></div>{evaluations.length ? evaluations.map(evaluation => <Fold key={evaluation.recordId} title={`${resultLabel(value, evaluation)} · ${decisionLabel(evaluation.decision)}`}><DecisionDetail evaluation={evaluation} /></Fold>) : <p className="acq-muted">No compatible records are available for this preview. Process an authorized export or add the required contract and buyer profiles.</p>}</div>;
}
