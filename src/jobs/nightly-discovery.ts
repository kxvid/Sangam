import { supabase } from "../lib/supabase.js";
import { fetchCashBuyers } from "../lib/propertyradar.js";
import { skipTrace } from "../lib/skiptrace.js";

const SKIP_TRACE_BUDGET_USD = 20;

export async function runDiscovery() {
  const errors: string[] = [];
  let added = 0;
  let updated = 0;
  let spent = 0;

  const since = new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);

  let rows: Awaited<ReturnType<typeof fetchCashBuyers>> = [];
  try {
    rows = await fetchCashBuyers({
      state: "CA",
      cashOnly: true,
      entityOnly: true,
      minPropertiesOwned: 2,
      purchasedSince: since,
      limit: 500,
    });
  } catch (e) {
    errors.push(`PropertyRadar: ${(e as Error).message}`);
  }

  for (const r of rows) {
    const entity = r.OwnerEntity ?? null;
    const fullName =
      [r.OwnerFirstName, r.OwnerLastName].filter(Boolean).join(" ").trim() || null;

    let phone = r.OwnerPhone ?? null;
    let email = r.OwnerEmail ?? null;

    if ((!phone || !email) && spent < SKIP_TRACE_BUDGET_USD) {
      try {
        const trace = await skipTrace({
          firstName: r.OwnerFirstName,
          lastName: r.OwnerLastName,
          entityName: entity ?? undefined,
          city: r.PropertyCity,
          state: "CA",
          zip: r.PropertyZip,
        });
        phone = phone ?? trace.phones[0] ?? null;
        email = email ?? trace.emails[0] ?? null;
        spent += trace.cost;
      } catch (e) {
        errors.push(`SkipTrace ${r.RadarID}: ${(e as Error).message}`);
      }
    }

    // Determine insert vs update by looking up first. The unique indexes on
    // phone/email are partial (only when not null), so we can't rely on
    // upsert(onConflict=...) for null-phone rows.
    const existingQ = supabase.from("buyers").select("id").limit(1);
    if (phone) existingQ.eq("phone", phone);
    else if (email) existingQ.eq("email", email);
    else if (entity && r.PropertyCity) {
      existingQ.eq("entity_name", entity).eq("primary_region", r.PropertyCity);
    } else {
      existingQ.eq("entity_name", entity ?? "__never_match__");
    }
    const { data: existing, error: lookupErr } = await existingQ;
    if (lookupErr) {
      errors.push(`Lookup ${r.RadarID}: ${lookupErr.message}`);
      continue;
    }

    const payload = {
      full_name: fullName,
      entity_name: entity,
      phone,
      email,
      primary_region: r.PropertyCity ?? null,
      total_properties_owned: r.TotalPropertiesOwned ?? 0,
      last_purchase_date: r.LastSaleDate ?? null,
      source: "propertyradar",
      source_confidence: 5,
      updated_at: new Date().toISOString(),
    };

    if (existing && existing.length > 0) {
      const { error: uErr } = await supabase
        .from("buyers")
        .update(payload)
        .eq("id", existing[0].id);
      if (uErr) {
        errors.push(`Update ${r.RadarID}: ${uErr.message}`);
        continue;
      }
      updated += 1;
    } else {
      const { error: iErr } = await supabase.from("buyers").insert(payload);
      if (iErr) {
        errors.push(`Insert ${r.RadarID}: ${iErr.message}`);
        continue;
      }
      added += 1;
    }
  }

  await supabase.from("discovery_runs").insert({
    source: "propertyradar",
    buyers_added: added,
    buyers_updated: updated,
    errors: errors.length ? errors.join("\n") : null,
  });

  console.log("DISCOVERY RUN COMPLETE");
  console.log(`Source: propertyradar`);
  console.log(`Buyers added: ${added}`);
  console.log(`Buyers updated: ${updated}`);
  console.log(`Skip-trace spent: $${spent.toFixed(2)}`);
  if (errors.length) console.log(`Errors:\n${errors.join("\n")}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runDiscovery().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
