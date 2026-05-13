import "dotenv/config";

const BASE = "https://api.rentcast.io/v1";
const KEY = process.env.RENTCAST_API_KEY;

if (!KEY) {
  console.warn("RENTCAST_API_KEY not set — RentCast calls will fail");
}

async function get<T>(path: string, params: Record<string, string | number | undefined>): Promise<T> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) qs.set(k, String(v));
  }
  const url = `${BASE}${path}?${qs.toString()}`;
  const res = await fetch(url, {
    headers: { "X-Api-Key": KEY ?? "", Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`RentCast ${path} ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as T;
}

export type RentCastProperty = {
  id: string;
  formattedAddress: string;
  bedrooms?: number;
  bathrooms?: number;
  squareFootage?: number;
  lotSize?: number;
  yearBuilt?: number;
  lastSalePrice?: number;
  lastSaleDate?: string;
};

export type RentCastAvm = {
  price: number;
  priceRangeLow: number;
  priceRangeHigh: number;
  comparables: Array<{
    formattedAddress: string;
    bedrooms: number;
    bathrooms: number;
    squareFootage: number;
    price: number;
    listedDate?: string;
    removedDate?: string;
    distance: number;
  }>;
};

export async function getProperty(address: string): Promise<RentCastProperty> {
  return get<RentCastProperty>("/properties", { address });
}

export async function getSaleAvm(address: string): Promise<RentCastAvm> {
  return get<RentCastAvm>("/avm/sale-price", { address });
}
