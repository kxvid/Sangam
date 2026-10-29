import { disabled } from './manual-only';
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

export async function fetchCashBuyers(_filters:CashBuyerFilters):Promise<PropertyRadarRow[]>{return disabled('Buyer discovery');}
