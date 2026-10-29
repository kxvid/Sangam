import { disabled } from '../lib/manual-only';
export type FBCommenter = {
  name: string;
  profileUrl: string;
  groupName: string;
  lastCommentAt: string;
};

export async function scrapeActiveCommenters(_groupSlug: string): Promise<FBCommenter[]> {
  return disabled('External scraping');
}
