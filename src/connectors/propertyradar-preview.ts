import {z} from 'zod';

/** Cost estimation only: this module has no record-purchase or outreach operation. */
export const PROPERTYRADAR_PREVIEW_MAX_BYTES = 32 * 1024;
export const PROPERTYRADAR_PREVIEW_TIMEOUT_MS = 10_000;
const ENDPOINT = 'https://api.propertyradar.com/v1/properties';
const FARM_ZIPS = Object.freeze(['92501','92503','92505','92507','92401','92404','92408','92410','92551','92553','92555','92335','92336','91761','91762','92376','92324']);
const FIELDS = Object.freeze(['RadarID','APN','County','FIPS','Address','City','State','ZipFive','Owner','OwnerAddress','OwnerCity','OwnerState','OwnerZipFive','PType','AVM','EquityPercent','inTaxDelinquency','YearsDelinquent','DelinquentYear','isSameMailing','LastTransferRecDate']);
const requestSchema = z.object({limit: z.number().int().min(1).max(100).default(10)}).strict();
export type PropertyRadarPreviewRequest = {limit?: number};
type Criterion = {name: string; value: Array<string | number | null | Array<number | null>>};
export type PropertyRadarPreviewPlan = {
  purpose: 'cost_estimate_only'; method: 'POST'; url: string;
  body: {Criteria: Criterion[]}; requestedLimit: number;
  sourceStrategy: 'tax_delinquent_absentee_high_equity';
};
export class PropertyRadarPreviewError extends Error {
  constructor(public readonly code: 'invalid_request' | 'missing_token' | 'unavailable' | 'invalid_response' | 'too_large' | 'aborted' | 'timeout', message: string) {
    super(message); this.name = 'PropertyRadarPreviewError';
  }
}

/** Offline, fixed-host plan. No token, environment lookup, network or mutable purchase flag. */
export function buildPropertyRadarPreviewPlan(request: PropertyRadarPreviewRequest = {}): PropertyRadarPreviewPlan {
  const parsed = requestSchema.safeParse(request);
  if (!parsed.success) throw new PropertyRadarPreviewError('invalid_request', 'Only a whole-number preview limit from 1 to 100 is accepted.');
  const url = new URL(ENDPOINT);
  url.search = new URLSearchParams({Purchase: '0', Limit: String(parsed.data.limit), Fields: FIELDS.join(',')}).toString();
  return {
    purpose: 'cost_estimate_only', method: 'POST', url: url.href,
    requestedLimit: parsed.data.limit, sourceStrategy: 'tax_delinquent_absentee_high_equity',
    body: {Criteria: [
      {name: 'State', value: ['CA']},
      {name: 'County', value: ['06065', '06071']},
      {name: 'ZipFive', value: [...FARM_ZIPS]},
      {name: 'inTaxDelinquency', value: [1]},
      {name: 'YearsDelinquent', value: ['2 years', '3 years', '4 years', '5 years or more']},
      {name: 'isSameMailing', value: [0]},
      {name: 'EquityPercent', value: [[50, null]]},
    ]},
  };
}

const countSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const estimateSchema = z.object({
  totalCost: z.string().max(24).regex(/^\d+(?:\.\d{1,2})?$/),
  quantityFreeRemaining: countSchema,
  resultCount: countSchema,
  totalResultCount: countSchema,
  results: z.array(z.unknown()).max(0).optional(),
});
export type PropertyRadarCostEstimate = {
  mode: 'cost_estimate_only'; estimatedCostCents: number; quantityFreeRemaining: number;
  estimatedRecords: number; totalMatchingRecords: number; moreMatchingRecords: boolean;
  requestedLimit: number; recordsImported: 0; purchasePerformed: false;
  creditsReserved: false; guaranteesNoOverageForFuturePurchase: false;
};
type PreviewOptions = {fetch?: typeof fetch; signal?: AbortSignal};

function decodeEstimate(raw: unknown, limit: number): PropertyRadarCostEstimate {
  const parsed = estimateSchema.safeParse(raw);
  if (!parsed.success || parsed.data.resultCount > limit || parsed.data.resultCount > parsed.data.totalResultCount) {
    throw new PropertyRadarPreviewError('invalid_response', 'The provider did not return a complete, bounded cost estimate without lead records.');
  }
  const data = parsed.data;
  const [whole, fraction = ''] = data.totalCost.split('.');
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) throw new PropertyRadarPreviewError('invalid_response', 'The estimated cost is outside the supported range.');
  return {
    mode: 'cost_estimate_only', estimatedCostCents: Number(cents), quantityFreeRemaining: data.quantityFreeRemaining,
    estimatedRecords: data.resultCount, totalMatchingRecords: data.totalResultCount,
    moreMatchingRecords: data.totalResultCount > data.resultCount, requestedLimit: limit,
    recordsImported: 0, purchasePerformed: false, creditsReserved: false, guaranteesNoOverageForFuturePurchase: false,
  };
}

/** Server-only explicit preview. Never retries, buys records, appends contacts or follows redirects. */
export async function previewPropertyRadarCost(request: PropertyRadarPreviewRequest, token: string, options: PreviewOptions = {}): Promise<PropertyRadarCostEstimate> {
  if (typeof window !== 'undefined') throw new PropertyRadarPreviewError('invalid_request', 'Provider estimates run only in a trusted server process.');
  const plan = buildPropertyRadarPreviewPlan(request);
  if (typeof token !== 'string' || token.length < 16 || token.length > 4096 || !/^[A-Za-z0-9\-._~+/]+=*$/.test(token)) {
    throw new PropertyRadarPreviewError('missing_token', 'A valid server-only PropertyRadar API token is required for an explicit preview.');
  }
  const controller = new AbortController();
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let callerAbort: (() => void) | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const cancelled = new Promise<never>((_, reject) => {
    const cancel = (reason: 'aborted' | 'timeout') => {
      controller.abort();
      reject(new PropertyRadarPreviewError(reason, reason === 'timeout' ? 'The cost preview timed out.' : 'The cost preview was cancelled.'));
    };
    callerAbort = () => cancel('aborted');
    if (options.signal?.aborted) cancel('aborted');
    else options.signal?.addEventListener('abort', callerAbort, {once:true});
    deadline = setTimeout(() => cancel('timeout'), PROPERTYRADAR_PREVIEW_TIMEOUT_MS);
  });
  try {
    return await Promise.race([cancelled, (async () => {
      if (controller.signal.aborted) throw new PropertyRadarPreviewError('aborted', 'The cost preview was cancelled.');
      const response = await (options.fetch ?? fetch)(plan.url, {
        method: 'POST', redirect: 'error', credentials: 'omit', cache: 'no-store',
        headers: {Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${token}`},
        body: JSON.stringify(plan.body), signal: controller.signal,
      });
      if (!response.ok || response.redirected) throw new PropertyRadarPreviewError('unavailable', 'The provider refused or could not complete the cost preview.');
      if (response.url && response.url !== plan.url) throw new PropertyRadarPreviewError('invalid_response', 'The provider response came from an unexpected endpoint.');
      if (response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
        throw new PropertyRadarPreviewError('invalid_response', 'The provider did not return JSON.');
      }
      const length = response.headers.get('content-length');
      if (length !== null && (!/^\d+$/.test(length) || Number(length) > PROPERTYRADAR_PREVIEW_MAX_BYTES)) {
        throw new PropertyRadarPreviewError('too_large', 'The cost preview exceeds its response-size limit.');
      }
      if (!response.body) throw new PropertyRadarPreviewError('invalid_response', 'The provider returned an empty response.');
      reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8', {fatal:true});
      let bytes = 0, body = '';
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > PROPERTYRADAR_PREVIEW_MAX_BYTES) throw new PropertyRadarPreviewError('too_large', 'The cost preview exceeds its response-size limit.');
        body += decoder.decode(chunk.value, {stream:true});
      }
      body += decoder.decode();
      let raw: unknown;
      try {raw = JSON.parse(body) as unknown;}
      catch {throw new PropertyRadarPreviewError('invalid_response', 'The provider returned an incomplete or invalid JSON estimate.');}
      return decodeEstimate(raw, plan.requestedLimit);
    })()]);
  } catch (error) {
    if (error instanceof PropertyRadarPreviewError) throw error;
    // Provider and transport errors may contain tokens or unexpected personal data.
    throw new PropertyRadarPreviewError('unavailable', 'The cost preview could not be completed.');
  } finally {
    if (deadline) clearTimeout(deadline);
    if (callerAbort) options.signal?.removeEventListener('abort', callerAbort);
    controller.abort();
    void reader?.cancel().catch(() => undefined);
  }
}
