import {gzipSync} from 'node:zlib';
// Kept independent of Next so the actual request boundary is exercised in tests.
export class HttpError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export const PRIVATE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  'Pragma': 'no-cache',
  'X-Content-Type-Options': 'nosniff',
  'Vary': 'Cookie, Origin',
};

export function json(data: unknown, status = 200, request?: Request): Response {
  const body = JSON.stringify(data);
  const acceptsGzip = request?.headers.get('accept-encoding')?.split(',').some(value => /^gzip(?:\s*;\s*q=(?!0(?:\.0*)?$)[\d.]+)?$/i.test(value.trim())) ?? false;
  const bytes = Buffer.byteLength(body);
  const compressed = bytes > 65_536 && acceptsGzip ? gzipSync(body) : null;
  // Stay below common serverless response limits; validate before persistence.
  if ((compressed?.byteLength ?? bytes) > 4_000_000) throw new HttpError('This workspace response exceeds the pilot capacity. Contact your administrator to archive/export records before continuing.', 413);
  return new Response(compressed ? new Uint8Array(compressed) : body, {status, headers: {
    ...PRIVATE_HEADERS, 'Content-Type': 'application/json; charset=utf-8',
    'Vary': 'Cookie, Origin, Accept-Encoding',
    ...(compressed ? {'Content-Encoding':'gzip'} : {}),
  }});
}

export function workspaceId(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new HttpError('Choose a valid workspace.');
  }
  return value;
}

export async function readCommandRequest(request: Request, maxBytes = 2_000_000) {
  const origin = request.headers.get('origin');
  if (origin !== new URL(request.url).origin || request.headers.get('sec-fetch-site') === 'cross-site') {
    throw new HttpError('Open Sangam directly to submit this form.', 403);
  }
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') {
    throw new HttpError('Use a JSON request.', 415);
  }
  if (Number(request.headers.get('content-length')) > maxBytes) throw new HttpError('The upload is too large. Split the file into smaller batches.', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError('The request is empty.');
  const decoder = new TextDecoder('utf-8', {fatal: true});
  let text = '', size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new HttpError('The upload is too large. Split the file into smaller batches.', 413); }
      text += decoder.decode(chunk.value, {stream: true});
    }
    text += decoder.decode();
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError('Use a valid UTF-8 file.');
  } finally { reader.releaseLock(); }
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new HttpError('The request is not valid JSON.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError('The request is invalid.');
  const body = value as Record<string, unknown>;
  const id = workspaceId(body.workspaceId);
  if (!Number.isSafeInteger(body.version) || Number(body.version) < 0) throw new HttpError('Refresh the workspace before making changes.', 409);
  if (!body.command || typeof body.command !== 'object' || Array.isArray(body.command)) throw new HttpError('Choose an action.');
  return {workspaceId: id, version: Number(body.version), command: body.command};
}
