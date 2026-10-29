import {test} from 'node:test';
import assert from 'node:assert/strict';
import {lookupCensusAddress, loadFemaCountyContext, parseFemaCountyContext, PUBLIC_DATA_SOURCES, PublicDataError} from '../src/public-data';
import type {CensusLookupRequest} from '../src/public-data';
import {MAX_RESPONSE_BYTES, REQUEST_TIMEOUT_MS} from '../src/public-data/internal';

const request: CensusLookupRequest = {
  requestKind: 'operator_address_lookup', propertyId: 'fixture-property', requestedBy: 'fixture-operator',
  address: {street: '3900 Main St', city: 'Riverside', state: 'CA', zip: '92522'},
};
const now = () => new Date('2026-10-29T12:00:00.000Z');
const candidate = {matchedAddress: 'PUBLIC GOVERNMENT ADDRESS', coordinates: {x: -117.37, y: 33.98}};
function censusResponse(matches: unknown[] = [candidate]) {
  return {result: {input: {benchmark: {id: '4', benchmarkName: 'Public_AR_Current'}}, addressMatches: matches}};
}
const response = (body: unknown) => new Response(JSON.stringify(body), {headers: {'content-type': 'application/json; charset=utf-8'}});
const fixtureFetch = (body: unknown): typeof fetch => async () => response(body);
const hasCode = (code: PublicDataError['code']) => (error: unknown) => error instanceof PublicDataError && error.code === code;

test('catalog keeps sources disabled and identifies holds without granting permission', () => {
  assert.equal(PUBLIC_DATA_SOURCES.length, 3);
  assert.ok(PUBLIC_DATA_SOURCES.every(source => source.enabled === false));
  assert.ok(PUBLIC_DATA_SOURCES.filter(source => source.id !== 'census_geocoder').every(source => source.status === 'held' && source.holdReason));
  assert.ok(Object.isFrozen(PUBLIC_DATA_SOURCES));
  assert.ok(PUBLIC_DATA_SOURCES.every(Object.isFrozen));
});

test('explicit single-address lookup sends only address parameters to the fixed endpoint', async () => {
  const before = structuredClone(request);
  let calls = 0;
  const fetcher: typeof fetch = async (input, init) => {
    calls++;
    const url = new URL(String(input));
    assert.equal(url.origin + url.pathname, 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress');
    assert.deepEqual([...url.searchParams.keys()].sort(), ['address','benchmark','format']);
    assert.equal(url.searchParams.get('address'), '3900 Main St, Riverside, CA 92522');
    assert.equal(url.searchParams.get('benchmark'), 'Public_AR_Current');
    assert.equal(init?.redirect, 'error');
    assert.equal(init?.credentials, 'omit');
    assert.equal(init?.cache, 'no-store');
    assert.ok(init?.signal instanceof AbortSignal);
    assert.ok(!String(input).includes('fixture-operator'));
    return response(censusResponse());
  };
  const result = await lookupCensusAddress(request, {fetch: fetcher, now});
  assert.equal(calls, 1);
  assert.equal(result.status, 'unique');
  assert.equal(result.purpose, 'address_enrichment');
  assert.equal(result.provenance.retrievedAt, now().toISOString());
  assert.equal(result.provenance.sourceUpdatedAt, null);
  assert.equal(result.provenance.benchmarkName, 'Public_AR_Current');
  assert.ok(!result.provenance.sourceUrl.includes('?'));
  assert.deepEqual(request, before);
  assert.ok(!('score' in result) && !('consent' in result) && !('contactPermission' in result));
});

test('no-match and ambiguous responses are returned as suggestions without selecting or overwriting', async () => {
  const empty = await lookupCensusAddress(request, {fetch: fixtureFetch(censusResponse([])), now});
  assert.equal(empty.status, 'no_match');
  assert.deepEqual(empty.candidates, []);
  const ambiguous = await lookupCensusAddress(request, {fetch: fixtureFetch(censusResponse([candidate,candidate])), now});
  assert.equal(ambiguous.status, 'ambiguous');
  assert.equal(ambiguous.candidates.length, 2);
});

test('requests with bulk data, extra personal data or arbitrary URLs fail before fetching', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => {calls++; return response(censusResponse());};
  for (const invalid of [
    {...request, requestKind: 'scheduled'},
    {...request, requestedBy: ''},
    {...request, addresses: [request.address]},
    {...request, url: 'https://elsewhere.example'},
    {...request, address: {...request.address, ownerName: 'Never transmit'}},
    {...request, address: {...request.address, street: 'Line\nBreak'}},
    {...request, address: {...request.address, state: 'NY'}},
  ]) await assert.rejects(lookupCensusAddress(invalid as CensusLookupRequest, {fetch: fetcher, now}), hasCode('invalid_request'));
  assert.equal(calls, 0);
});

test('provider failures are sanitized and HTML, redirects and unexpected shapes are rejected', async () => {
  const badResponses = [
    new Response('Forbidden', {status: 403}),
    new Response('Redirect', {status: 302, headers: {location: 'https://elsewhere.example'}}),
    new Response('<html>Login</html>', {headers: {'content-type': 'text/html'}}),
    new Response('not json', {headers: {'content-type': 'application/json'}}),
    response({result: {addressMatches: []}}),
    response(censusResponse([{...candidate, coordinates: {x: 999, y: 30}}])),
    response(censusResponse(Array.from({length: 11}, () => candidate))),
  ];
  for (const bad of badResponses) await assert.rejects(lookupCensusAddress(request, {fetch: async () => bad, now}), PublicDataError);
  await assert.rejects(lookupCensusAddress(request, {fetch: async () => {throw new Error('private address and URL');}, now}), error => {
    assert.ok(error instanceof PublicDataError);
    assert.ok(!error.message.includes('private address'));
    return true;
  });
});

test('size bounds apply to declared and streamed bodies', async () => {
  await assert.rejects(lookupCensusAddress(request, {fetch: async () => new Response('{}', {headers: {'content-type':'application/json', 'content-length': String(MAX_RESPONSE_BYTES + 1)}}), now}), hasCode('too_large'));
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {controller.enqueue(new Uint8Array(MAX_RESPONSE_BYTES + 1));},
    cancel() {cancelled = true;},
  });
  await assert.rejects(lookupCensusAddress(request, {fetch: async () => new Response(stream, {headers:{'content-type':'application/json'}}), now}), hasCode('too_large'));
  assert.equal(cancelled, true);
});

test('external cancellation stops work before sending and during a pending lookup', async () => {
  const alreadyCancelled = new AbortController(); alreadyCancelled.abort();
  let calls = 0;
  await assert.rejects(lookupCensusAddress(request, {signal: alreadyCancelled.signal, fetch: async () => {calls++; return response(censusResponse());}}), hasCode('aborted'));
  assert.equal(calls, 0);
  const controller = new AbortController();
  let sentSignal: AbortSignal | null | undefined;
  const pending = lookupCensusAddress(request, {signal: controller.signal, fetch: async (_url, init) => {
    sentSignal = init?.signal;
    return new Promise<Response>(() => undefined);
  }});
  const rejected = assert.rejects(pending, hasCode('aborted'));
  controller.abort();
  await rejected;
  assert.equal(sentSignal?.aborted, true);
});

test('ten-second deadline bounds the whole lookup even when a transport does not settle', async context => {
  context.mock.timers.enable({apis: ['setTimeout']});
  try {
    const pending = lookupCensusAddress(request, {fetch: async () => new Promise<Response>(() => undefined)});
    const rejected = assert.rejects(pending, hasCode('timeout'));
    context.mock.timers.tick(REQUEST_TIMEOUT_MS);
    await rejected;
  } finally {context.mock.timers.reset();}
});

test('FEMA decoder preserves original dates and county scope; loading remains held', async () => {
  const sourceUpdatedAt = '2026-10-05T11:26:24.661Z';
  const row = {disasterNumber: 5636, declarationDate: '2026-05-20T00:00:00.000Z', state: 'CA', designatedArea: 'Riverside (County)', fipsCountyCode: '065', incidentType: 'Fire', lastRefresh: sourceUpdatedAt};
  const raw = {DisasterDeclarationsSummaries: [row]};
  const decoded = parseFemaCountyContext(raw, 'Riverside', now().toISOString());
  assert.equal(decoded.declarations[0].sourceUpdatedAt, sourceUpdatedAt);
  assert.equal(decoded.declarations[0].declarationDate, row.declarationDate);
  assert.equal(decoded.retrievedAt, now().toISOString());
  assert.equal(decoded.purpose, 'area_context');
  assert.equal(decoded.potentiallyTruncated, false);
  assert.throws(() => parseFemaCountyContext(raw, 'San Bernardino', now().toISOString()), hasCode('invalid_response'));
  assert.throws(() => parseFemaCountyContext({DisasterDeclarationsSummaries:Array.from({length:101},()=>row)}, 'Riverside', now().toISOString()), hasCode('invalid_response'));
  assert.equal(parseFemaCountyContext({DisasterDeclarationsSummaries:Array.from({length:100},()=>row)}, 'Riverside', now().toISOString()).potentiallyTruncated, true);
  assert.equal((await loadFemaCountyContext({county:'Riverside'})).status, 'held');
  await assert.rejects(loadFemaCountyContext({county:'Riverside', address:'never transmit'} as {county:'Riverside'}), hasCode('invalid_request'));
});
