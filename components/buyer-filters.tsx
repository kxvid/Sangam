"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { useState, useEffect } from "react";

export function BuyerFilters() {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [region, setRegion] = useState(params.get("region") ?? "");
  const [source, setSource] = useState(params.get("source") ?? "");

  useEffect(() => {
    const handle = setTimeout(() => {
      const sp = new URLSearchParams();
      if (q) sp.set("q", q);
      if (region) sp.set("region", region);
      if (source) sp.set("source", source);
      router.replace(`/buyers${sp.toString() ? "?" + sp.toString() : ""}`);
    }, 250);
    return () => clearTimeout(handle);
  }, [q, region, source, router]);

  return (
    <div className="card p-4 flex flex-wrap gap-3 items-center">
      <div className="relative flex-1 min-w-[220px]">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-ink-500" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, entity, phone, email…"
          className="input w-full pl-9 pr-3 py-2 text-sm"
        />
      </div>
      <input
        value={region}
        onChange={(e) => setRegion(e.target.value)}
        placeholder="Region (e.g. Los Angeles)"
        className="input w-48 px-3 py-2 text-sm"
      />
      <select
        value={source}
        onChange={(e) => setSource(e.target.value)}
        className="input form-select w-48 px-3 py-2 text-sm"
      >
        <option value="">Any source</option>
        <option value="propertyradar">PropertyRadar</option>
        <option value="manual">Manual</option>
        <option value="county-recorder">County recorder</option>
        <option value="biggerpockets">BiggerPockets</option>
        <option value="fb-groups">FB groups</option>
      </select>
    </div>
  );
}
