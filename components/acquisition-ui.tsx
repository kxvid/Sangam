"use client";

import { useId, type FormEvent, type ReactNode } from "react";
import { ArrowRight, CheckCircle2, ChevronDown } from "lucide-react";

export type FieldSpec = {
  name: string;
  label: string;
  type?: "text" | "textarea" | "number" | "date" | "datetime-local" | "email" | "tel" | "select" | "checkbox";
  hint?: string;
  required?: boolean;
  value?: string | number;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  step?: number | "any";
  placeholder?: string;
};

export function Field({ field }: { field: FieldSpec }) {
  const id = useId();
  const { label, hint, options, type = "text", value, ...props } = field;
  const common = { ...props, id, defaultValue: value, className: "acq-input", "aria-describedby": hint ? `${id}-hint` : undefined };
  if (type === "checkbox") return (
    <label className="acq-check" htmlFor={id}>
      <input id={id} name={field.name} type="checkbox" required={field.required} />
      <span>{label}{hint && <small id={`${id}-hint`}>{hint}</small>}</span>
    </label>
  );
  return <div className={type === "textarea" ? "acq-field acq-span" : "acq-field"}>
    <label htmlFor={id}>{label}{field.required && <span aria-hidden="true"> *</span>}</label>
    {type === "select" ? <select {...common}><option value="">Choose…</option>{options?.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
      : type === "textarea" ? <textarea {...common} rows={3} />
      : <input {...common} type={type} />}
    {hint && <small id={`${id}-hint`}>{hint}</small>}
  </div>;
}

export function DeskForm({ title, description, fields, submitLabel, busy, onSubmit, children, destructive = false }: {
  title: string; description?: string; fields: FieldSpec[]; submitLabel: string; busy: boolean;
  onSubmit: (values: FormData) => Promise<unknown>; children?: ReactNode; destructive?: boolean;
}) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSubmit(new FormData(event.currentTarget));
  }
  return <form onSubmit={submit} className="acq-form">
    <div><h3>{title}</h3>{description && <p className="acq-muted">{description}</p>}</div>
    <fieldset disabled={busy} className="acq-form-grid">
      {fields.map(field => <Field key={field.name} field={field} />)}
      {children}
      <div className="acq-span"><button className={destructive ? "btn btn-danger" : "btn btn-primary"} type="submit">{submitLabel}<ArrowRight size={14} /></button></div>
    </fieldset>
  </form>;
}

export function Panel({ title, description, children, action }: { title: string; description?: string; children: ReactNode; action?: ReactNode }) {
  return <section className="acq-panel"><header className="acq-panel-header"><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{action}</header>{children}</section>;
}

export function Fold({ title, children, open = false }: { title: string; children: ReactNode; open?: boolean }) {
  return <details className="acq-fold" open={open}><summary>{title}<ChevronDown size={16} /></summary><div className="acq-fold-content">{children}</div></details>;
}

export function Empty({ title, children }: { title: string; children: ReactNode }) {
  return <div className="acq-empty"><div className="acq-empty-icon"><CheckCircle2 size={20} /></div><h3>{title}</h3><p>{children}</p></div>;
}

export function Pill({ children, tone = "muted" }: { children: ReactNode; tone?: "good" | "warn" | "muted" }) {
  return <span className={`acq-pill acq-pill-${tone}`}>{children}</span>;
}

export function Money({ value }: { value: number | null | undefined }) {
  return <>{value == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value)}</>;
}

export const textValue = (data: FormData, name: string) => String(data.get(name) ?? "").trim();
export const numberValue = (data: FormData, name: string) => Number(textValue(data, name));
export const dateValue = (data: FormData, name: string) => new Date(textValue(data, name)).toISOString();
export const listValue = (data: FormData, name: string) => textValue(data, name).split(",").map(value => value.trim()).filter(Boolean);
export const prettyDate = (value: string | null | undefined) => value ? new Date(value).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "Not recorded";
export const humanize = (value: string) => value.replaceAll("_", " ");
