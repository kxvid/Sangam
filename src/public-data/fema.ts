import {z} from 'zod';
import {publicDataSource} from './catalog';
import {PublicDataError} from './internal';

const countySchema = z.enum(['Riverside', 'San Bernardino']);
export type PilotCounty = z.infer<typeof countySchema>;
const codes: Record<PilotCounty, string> = {Riverside: '065', 'San Bernardino': '071'};
const instant = z.string().datetime({offset: true});
const rowSchema = z.object({
  disasterNumber: z.number().int().positive(), declarationDate: instant,
  state: z.literal('CA'), designatedArea: z.string().min(1).max(150),
  fipsCountyCode: z.enum(['065','071']), incidentType: z.string().min(1).max(100), lastRefresh: instant,
});
const responseSchema = z.object({DisasterDeclarationsSummaries: z.array(rowSchema).max(100)});

/** Offline decoder for the verified county-only API shape; this does not authorize fetching. */
export function parseFemaCountyContext(raw: unknown, county: PilotCounty, retrievedAt: string) {
  if (!countySchema.safeParse(county).success || !instant.safeParse(retrievedAt).success) throw new PublicDataError('invalid_request', 'A pilot county and valid retrieval time are required.');
  const parsed = responseSchema.safeParse(raw);
  if (!parsed.success) throw new PublicDataError('invalid_response', 'The FEMA county response did not match the expected schema.');
  if (parsed.data.DisasterDeclarationsSummaries.some(row => row.fipsCountyCode !== codes[county])) throw new PublicDataError('invalid_response', 'The FEMA response contains a different county.');
  return {
    sourceId: 'openfema_disaster_declarations_v2' as const, purpose: 'area_context' as const,
    county, retrievedAt,
    // A full page may be truncated. Never claim this is a complete declaration history.
    potentiallyTruncated: parsed.data.DisasterDeclarationsSummaries.length === 100,
    declarations: parsed.data.DisasterDeclarationsSummaries.map(row => ({
      sourceRecordKey: `${row.disasterNumber}:CA:${row.fipsCountyCode}`,
      disasterNumber: row.disasterNumber, countyCode: row.fipsCountyCode,
      designatedArea: row.designatedArea, incidentType: row.incidentType,
      declarationDate: row.declarationDate, sourceUpdatedAt: row.lastRefresh,
    })),
  };
}

/** No network activity while the source's current terms are unverified. */
export async function loadFemaCountyContext(request: {county: PilotCounty}) {
  if (!z.object({county: countySchema}).strict().safeParse(request).success) throw new PublicDataError('invalid_request', 'Only a pilot county may be requested.');
  return {status: 'held' as const, sourceId: 'openfema_disaster_declarations_v2' as const, reason: publicDataSource('openfema_disaster_declarations_v2').holdReason!};
}
