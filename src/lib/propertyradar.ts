import "dotenv/config";

const BASE = "https://api.propertyradar.com/v1";
const KEY = process.env.PROPERTYRADAR_API_KEY;

type PropertyRadarRow = {
  RadarID: string;
  OwnerFirstName?: string;
  OwnerLastName?: string;
  OwnerEntity?: string;
  OwnerPhone?: string;
  OwnerEmail?: string;
  PropertyCity?: string;
  PropertyZip?: string;
  LastSalePrice?: number;
  LastSaleDate?: string;
  PurchasedWithCash?: boolean;
  TotalPropertiesOwned?: number;
};

export type CashBuyerFilters = {
  state?: string;
  cashOnly?: boolean;
  entityOnly?: boolean;
  minPropertiesOwned?: number;
  purchasedSince?: string;
  limit?: number;
};

export async function fetchCashBuyers(filters: CashBuyerFilters): Promise<PropertyRadarRow[]> {
  if (!KEY) throw new Error("PROPERTYRADAR_API_KEY not set");

  const body = {
    State: filters.state ?? "CA",
    PurchasedWithCash: filters.cashOnly ?? true,
    OwnerType: filters.entityOnly ? "LLC" : undefined,
    MinPropertiesOwned: filters.minPropertiesOwned ?? 2,
    PurchasedSince: filters.purchasedSince,
    Limit: filters.limit ?? 500,
  };

  const res = await fetch(`${BASE}/properties`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`PropertyRadar ${res.status}: ${await res.text()}`);
  }

  const json = (await res.json()) as { results?: PropertyRadarRow[] };
  return json.results ?? [];
}
