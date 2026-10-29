import { disabled } from './manual-only';
export type SkipInput = {
  firstName?: string;
  lastName?: string;
  entityName?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
};

export type SkipResult = {
  phones: string[];
  emails: string[];
  cost: number;
};

export async function skipTrace(_input:SkipInput):Promise<SkipResult>{return disabled('Skip tracing');}
