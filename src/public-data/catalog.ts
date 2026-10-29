export type PublicDataSourceId = 'census_geocoder' | 'openfema_disaster_declarations_v2' | 'riverside_city_permits';
export type PublicDataSource = Readonly<{
  id: PublicDataSourceId;
  name: string;
  purpose: 'address_enrichment' | 'area_context' | 'research_candidate';
  status: 'manual_lookup_only' | 'held';
  enabled: false;
  noKey: true;
  verifiedOn: string;
  referenceUrl: string;
  termsUrl: string;
  summary: string;
  holdReason: string | null;
}>;

/** Public catalog only. Availability is not an approval or an enabled connection. */
export const PUBLIC_DATA_SOURCES: readonly PublicDataSource[] = Object.freeze([
  Object.freeze({
    id: 'census_geocoder', name: 'Census address lookup', purpose: 'address_enrichment',
    status: 'manual_lookup_only', enabled: false, noKey: true, verifiedOn: '2026-10-29',
    referenceUrl: 'https://geocoding.geo.census.gov/geocoder/Geocoding_Services_API.html',
    termsUrl: 'https://www.census.gov/about/policies.html',
    summary: 'Look up one property address when requested. Approximate coordinates; no seller or contact data.',
    holdReason: null,
  }),
  Object.freeze({
    id: 'openfema_disaster_declarations_v2', name: 'FEMA county disaster context', purpose: 'area_context',
    status: 'held', enabled: false, noKey: true, verifiedOn: '2026-10-29',
    referenceUrl: 'https://www.fema.gov/openfema-data-page/disaster-declarations-summaries-v2',
    termsUrl: 'https://www.fema.gov/about/openfema/terms-conditions',
    summary: 'County declarations only. Does not establish damage, distress or seller motivation at a property.',
    holdReason: 'Current terms and attribution review is pending; the official terms page could not be read.',
  }),
  Object.freeze({
    id: 'riverside_city_permits', name: 'Riverside city permit research', purpose: 'research_candidate',
    status: 'held', enabled: false, noKey: true, verifiedOn: '2026-10-29',
    referenceUrl: 'https://riversideca.gov/transparency/data/dataset/show/34/Permit_Activity_Reports',
    termsUrl: 'https://riversideca.gov/transparency/data/dataset/show/34/Permit_Activity_Reports',
    summary: 'Potential property research records within Riverside city. Permits do not prove distress.',
    holdReason: 'The documented feed returned 403. JSON fields and required application attribution must be verified.',
  }),
]);

export function publicDataSource(id: PublicDataSourceId): PublicDataSource {
  const source = PUBLIC_DATA_SOURCES.find(value => value.id === id);
  if (!source) throw new Error('Unknown public data source.');
  return source;
}
