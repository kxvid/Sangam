import { disabled } from '../lib/manual-only';
export type RecorderRow = {
  granteeName: string;
  granteeEntity: string | null;
  propertyAddress: string;
  recordedDate: string;
  isCash: boolean;
};

export async function fetchRecentGrantDeeds(_daysBack = 30): Promise<RecorderRow[]> {
  return disabled('External scraping');
}
