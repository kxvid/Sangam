// Facebook investor group scraper.
// Targets: "LA Real Estate Investors", "SoCal Flippers", "Inland Empire REI",
// "OC Real Estate Investors". Captures active commenters in last 30 days.
//
// TODO: implement via Playwright with a persistent FB session. FB aggressively
// rate-limits; throttle to 1 group/run with manual rotation. Source confidence
// for this channel is 2 (lowest tier) — quality is mid.

export type FBCommenter = {
  name: string;
  profileUrl: string;
  groupName: string;
  lastCommentAt: string;
};

export async function scrapeActiveCommenters(_groupSlug: string): Promise<FBCommenter[]> {
  return [];
}
