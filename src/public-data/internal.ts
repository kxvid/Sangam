export const REQUEST_TIMEOUT_MS = 10_000;
export const MAX_RESPONSE_BYTES = 256 * 1024;

export class PublicDataError extends Error {
  constructor(public readonly code: 'invalid_request' | 'unavailable' | 'invalid_response' | 'too_large' | 'aborted' | 'timeout', message: string) {
    super(message);
    this.name = 'PublicDataError';
  }
}

/** These are trusted server dependencies, not browser-supplied options. */
export type LookupOptions = {signal?: AbortSignal; fetch?: typeof fetch; now?: () => Date};

export function retrievalTime(options: LookupOptions): string {
  const date = (options.now ?? (() => new Date()))();
  if (!Number.isFinite(date.getTime())) throw new PublicDataError('invalid_request', 'Retrieval time is invalid.');
  return date.toISOString();
}

// Intentionally private: there is no caller-provided URL, headers, credentials or provider filter.
function censusLocationUrl(address: string): URL {
  const url = new URL('https://geocoding.geo.census.gov/geocoder/locations/onelineaddress');
  url.search = new URLSearchParams({address, benchmark: 'Public_AR_Current', format: 'json'}).toString();
  return url;
}

export async function readCensusLocationJson(address: string, options: LookupOptions): Promise<unknown> {
  if (typeof window !== 'undefined') throw new PublicDataError('invalid_request', 'Public data lookups run on the server.');
  const url = censusLocationUrl(address);
  const controller = new AbortController();
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let callerAbort: (() => void) | undefined;
  const cancelled = new Promise<never>((_, reject) => {
    const cancel = (code: 'aborted' | 'timeout') => {
      controller.abort();
      reject(new PublicDataError(code, code === 'timeout' ? 'The public data lookup timed out.' : 'The public data lookup was cancelled.'));
    };
    callerAbort = () => cancel('aborted');
    if (options.signal?.aborted) cancel('aborted');
    else options.signal?.addEventListener('abort', callerAbort, {once: true});
    deadline = setTimeout(() => cancel('timeout'), REQUEST_TIMEOUT_MS);
  });
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    return await Promise.race([cancelled, (async () => {
      if (controller.signal.aborted) throw new PublicDataError('aborted', 'The public data lookup was cancelled.');
      const response = await (options.fetch ?? fetch)(url, {
        method: 'GET', redirect: 'error', credentials: 'omit', cache: 'no-store',
        headers: {Accept: 'application/json'}, signal: controller.signal,
      });
      if (!response.ok || response.redirected) throw new PublicDataError('unavailable', 'The public data service did not return a successful direct response.');
      if (response.url) {
        const returnedUrl = new URL(response.url);
        if (returnedUrl.origin !== url.origin || returnedUrl.pathname !== url.pathname) throw new PublicDataError('invalid_response', 'The public data response came from an unexpected endpoint.');
      }
      if (response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new PublicDataError('invalid_response', 'The public data service did not return JSON.');
      const length = response.headers.get('content-length');
      if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_RESPONSE_BYTES)) throw new PublicDataError('too_large', 'The public data response exceeds its size limit.');
      if (!response.body) throw new PublicDataError('invalid_response', 'The public data service returned an empty body.');
      reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8', {fatal: true});
      let bytes = 0, text = '';
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > MAX_RESPONSE_BYTES) throw new PublicDataError('too_large', 'The public data response exceeds its size limit.');
        text += decoder.decode(chunk.value, {stream: true});
      }
      text += decoder.decode();
      try { return JSON.parse(text) as unknown; }
      catch { throw new PublicDataError('invalid_response', 'The public data service returned invalid JSON.'); }
    })()]);
  } catch (error) {
    if (error instanceof PublicDataError) throw error;
    // Do not log provider error text: it can contain the submitted property address.
    throw new PublicDataError('unavailable', 'The public data lookup could not be completed.');
  } finally {
    if (deadline) clearTimeout(deadline);
    if (callerAbort) options.signal?.removeEventListener('abort', callerAbort);
    controller.abort();
    void reader?.cancel().catch(() => undefined);
  }
}
