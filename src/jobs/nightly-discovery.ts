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

    const upsert = await supabase
      .from("buyers")
      .upsert(
        {
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
        },
        { onConflict: "phone", ignoreDuplicates: false },
      )
      .select();

    if (upsert.error) {
      errors.push(`Upsert ${r.RadarID}: ${upsert.error.message}`);
      continue;
    }
    if (upsert.data?.length) {
      added += 1;
    } else {
      updated += 1;
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
