import {z} from 'zod';
import {PublicDataError, readCensusLocationJson, retrievalTime, type LookupOptions} from './internal';

const requestSchema = z.object({
  requestKind: z.literal('operator_address_lookup'),
  propertyId: z.string().trim().min(1).max(100),
  requestedBy: z.string().trim().min(1).max(100),
  address: z.object({
    street: z.string().trim().min(1).max(160),
    city: z.string().trim().min(1).max(100),
    state: z.literal('CA'),
    zip: z.string().regex(/^\d{5}(?:-\d{4})?$/),
  }).strict(),
}).strict();
export type CensusLookupRequest = z.input<typeof requestSchema>;
const responseSchema = z.object({result: z.object({
  input: z.object({benchmark: z.object({id: z.string().max(50), benchmarkName: z.string().min(1).max(100)})}),
  addressMatches: z.array(z.object({
    matchedAddress: z.string().min(1).max(300),
    coordinates: z.object({x: z.number().finite().min(-180).max(180), y: z.number().finite().min(-90).max(90)}),
  })).max(10),
})});

export type CensusLookupResult = {
  sourceId: 'census_geocoder';
  purpose: 'address_enrichment';
  status: 'unique' | 'ambiguous' | 'no_match';
  propertyId: string;
  requestedBy: string;
  candidates: {matchedAddress: string; longitude: number; latitude: number}[];
  provenance: {retrievedAt: string; sourceUpdatedAt: null; benchmarkId: string; benchmarkName: string; sourceUrl: string};
};

/** Returns suggestions only. Never mutates an address, score, consent or contact permission. */
export async function lookupCensusAddress(request: CensusLookupRequest, options: LookupOptions = {}): Promise<CensusLookupResult> {
  const parsed = requestSchema.safeParse(request);
  if (!parsed.success) throw new PublicDataError('invalid_request', 'An explicit operator request for one California property address is required.');
  const input = parsed.data;
  const joined = `${input.address.street}, ${input.address.city}, ${input.address.state} ${input.address.zip}`;
  if (/[\u0000-\u001f\u007f]/.test(joined)) throw new PublicDataError('invalid_request', 'Property address contains unsupported characters.');
  const raw = await readCensusLocationJson(joined, options);
  const result = responseSchema.safeParse(raw);
  if (!result.success) throw new PublicDataError('invalid_response', 'The Census address response did not match the expected schema.');
  const candidates = result.data.result.addressMatches.map(match => ({matchedAddress: match.matchedAddress, longitude: match.coordinates.x, latitude: match.coordinates.y}));
  const benchmark = result.data.result.input.benchmark;
  return {
    sourceId: 'census_geocoder', purpose: 'address_enrichment',
    status: candidates.length === 0 ? 'no_match' : candidates.length === 1 ? 'unique' : 'ambiguous',
    propertyId: input.propertyId, requestedBy: input.requestedBy, candidates,
    provenance: {retrievedAt: retrievalTime(options), sourceUpdatedAt: null, benchmarkId: benchmark.id, benchmarkName: benchmark.benchmarkName,
      sourceUrl: 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress'},
  };
}
