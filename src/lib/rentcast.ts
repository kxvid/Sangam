import { disabled } from './manual-only';
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

export async function getProperty(_address:string):Promise<RentCastProperty>{return disabled('Property enrichment');}
export async function getSaleAvm(_address:string):Promise<RentCastAvm>{return disabled('Property valuations');}
