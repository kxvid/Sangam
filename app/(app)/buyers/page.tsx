import { supabase } from "@/src/lib/supabase";
import { BuyerFilters } from "@/components/buyer-filters";
import type { Buyer } from "@/src/types";

export const dynamic = "force-dynamic";

type SP = { q?: string; region?: string; source?: string };

export default async function BuyersPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  let q = supabase
    .from("buyers")
    .select("*", { count: "exact" })
    .order("updated_at", { ascending: false })
    .limit(100);

  if (sp.q) {
    const term = `%${sp.q}%`;
    q = q.or(
      `full_name.ilike.${term},entity_name.ilike.${term},phone.ilike.${term},email.ilike.${term}`,
    );
  }
  if (sp.region) q = q.ilike("primary_region", `%${sp.region}%`);
  if (sp.source) q = q.eq("source", sp.source);

  const { data, count } = await q;
  const buyers = (data ?? []) as Buyer[];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Buyers</h1>
        <p className="mt-1 text-sm text-ink-400">
          {count?.toLocaleString() ?? buyers.length} matching · showing first {buyers.length}
        </p>
      </header>

      <BuyerFilters />

      {buyers.length === 0 ? (
        <div className="card p-10 text-center text-ink-400 text-sm">
          No buyers match. Try clearing filters, or run discovery to populate the DB.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-ink-900/60 text-ink-400 text-xs uppercase tracking-widest">
              <tr>
                <th className="text-left px-5 py-3">Name / Entity</th>
                <th className="text-left px-5 py-3">Region</th>
                <th className="text-right px-5 py-3">Price band</th>
                <th className="text-right px-5 py-3">Owned</th>
                <th className="text-left px-5 py-3">Last purchase</th>
                <th className="text-left px-5 py-3">Source</th>
                <th className="text-left px-5 py-3">Contact</th>
              </tr>
            </thead>
            <tbody>
              {buyers.map((b) => (
                <tr key={b.id} className="table-row">
                  <td className="px-5 py-3">
                    <div className="text-ink-100">{b.entity_name ?? b.full_name ?? "—"}</div>
                    {b.entity_name && b.full_name && (
                      <div className="text-xs text-ink-400">{b.full_name}</div>
                    )}
                  </td>
                  <td className="px-5 py-3 text-ink-300">{b.primary_region ?? "—"}</td>
                  <td className="px-5 py-3 text-right font-mono text-ink-300 text-xs">
                    {b.min_price || b.max_price
                      ? `$${(b.min_price ?? 0).toLocaleString()}–$${(b.max_price ?? 0).toLocaleString()}`
                      : "—"}
                  </td>
                  <td className="px-5 py-3 text-right font-mono">{b.total_properties_owned}</td>
                  <td className="px-5 py-3 text-ink-300 text-xs">
                    {b.last_purchase_date ?? "—"}
                  </td>
                  <td className="px-5 py-3">
                    <span className="badge badge-muted text-[10px]">
                      {b.source} · {b.source_confidence}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-xs text-ink-300">
                    {b.phone && <div className="font-mono">{b.phone}</div>}
                    {b.email && <div className="text-ink-400">{b.email}</div>}
                    {!b.phone && !b.email && <span className="text-ink-500">no contact</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
