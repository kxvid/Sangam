import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {
  buildPropertyRadarPreviewPlan, previewPropertyRadarCost, PropertyRadarPreviewError,
  PROPERTYRADAR_PREVIEW_MAX_BYTES, PROPERTYRADAR_PREVIEW_TIMEOUT_MS,
} from '../src/connectors/propertyradar-preview';

const token = 'fictional-token-never-a-live-secret';
const response = (body: unknown) => new Response(JSON.stringify(body), {headers: {'content-type': 'application/json'}});
const cost = {totalCost: '0.25', quantityFreeRemaining: 7, resultCount: 10, totalResultCount: 450, results: []};
const code = (expected: PropertyRadarPreviewError['code']) => (error: unknown) => error instanceof PropertyRadarPreviewError && error.code === expected;

test('plan bounds the first cost estimate to the IE farm and cannot purchase or request arbitrary criteria', () => {
  const plan = buildPropertyRadarPreviewPlan();
  const url = new URL(plan.url);
  assert.equal(url.origin + url.pathname, 'https://api.propertyradar.com/v1/properties');
  assert.equal(url.searchParams.get('Purchase'), '0');
  assert.equal(url.searchParams.get('Limit'), '10');
  assert.deepEqual(plan.body.Criteria.slice(0, 2), [{name: 'State', value: ['CA']}, {name: 'County', value: ['06065', '06071']}]);
  const zips = plan.body.Criteria.find(row => row.name === 'ZipFive')?.value;
  assert.deepEqual(zips, ['92501','92503','92505','92507','92401','92404','92408','92410','92551','92553','92555','92335','92336','91761','91762','92376','92324']);
  assert.deepEqual(plan.body.Criteria.find(row => row.name === 'inTaxDelinquency')?.value, [1]);
  assert.deepEqual(plan.body.Criteria.find(row => row.name === 'EquityPercent')?.value, [[50, null]]);
  assert.ok(!JSON.stringify(plan).includes(token));
  for (const input of [{limit: 0}, {limit: 101}, {limit: 1.5}, {limit: '10'}, {url: 'http://127.0.0.1'}, {Purchase: 1}, {criteria: []}, {zip: '90210'}]) {
    assert.throws(() => buildPropertyRadarPreviewPlan(input as {limit?: number}), code('invalid_request'));
  }
});

test('cost preview uses bearer header only, makes one non-purchase request and returns no lead data', async () => {
  let calls = 0;
  const result = await previewPropertyRadarCost({}, token, {fetch: async (input, init) => {
    calls++;
    const url = new URL(String(input));
    assert.equal(url.searchParams.get('Purchase'), '0');
    assert.equal(url.searchParams.get('Limit'), '10');
    assert.ok(!String(input).includes(token));
    assert.equal(init?.method, 'POST');
    assert.equal(init?.redirect, 'error');
    assert.equal(init?.credentials, 'omit');
    assert.equal(init?.cache, 'no-store');
    assert.equal(new Headers(init?.headers).get('authorization'), `Bearer ${token}`);
    assert.ok(!String(init?.body).includes(token));
    assert.equal(JSON.parse(String(init?.body)).Criteria[0].name, 'State');
    return response(cost);
  }});
  assert.equal(calls, 1);
  assert.equal(result.estimatedCostCents, 25);
  assert.equal(result.quantityFreeRemaining, 7);
  assert.equal(result.estimatedRecords, 10);
  assert.equal(result.totalMatchingRecords, 450);
  assert.equal(result.moreMatchingRecords, true);
  assert.equal(result.recordsImported, 0);
  assert.equal(result.purchasePerformed, false);
  assert.ok(!('results' in result));
});

test('missing or malformed credentials fail before a request', async () => {
  let calls = 0;
  for (const invalid of ['', 'short', `Bearer ${token}`, `${token}\nInjected: x`]) {
    await assert.rejects(previewPropertyRadarCost({}, invalid, {fetch: async () => {calls++; return response(cost);}}), code('missing_token'));
  }
  assert.equal(calls, 0);
});

test('unknown, negative, non-finite and unsafe monetary/count values never become a free estimate', async () => {
  for (const value of [undefined, null, '', '-1.00', 'NaN', 'Infinity', '1e3', '0.001', 0, '9007199254740993.00']) {
    await assert.rejects(previewPropertyRadarCost({}, token, {fetch: async () => response({...cost, totalCost: value})}), code('invalid_response'));
  }
  for (const patch of [
    {quantityFreeRemaining: undefined}, {quantityFreeRemaining: -1}, {quantityFreeRemaining: 1.1},
    {resultCount: 11}, {resultCount: -1}, {totalResultCount: 9}, {totalResultCount: Number.MAX_SAFE_INTEGER + 1},
    {results: [{Owner: 'UNEXPECTED PRIVATE DATA'}]},
  ]) await assert.rejects(previewPropertyRadarCost({}, token, {fetch: async () => response({...cost, ...patch})}), code('invalid_response'));
  const zero = await previewPropertyRadarCost({}, token, {fetch: async () => response({...cost, totalCost: '0.00', resultCount: 0, totalResultCount: 0})});
  assert.equal(zero.estimatedCostCents, 0);
  assert.equal(zero.moreMatchingRecords, false);
});

test('HTML, redirects, changed response hosts and raw provider errors are refused without leaking details', async () => {
  const unsafe = response(cost);
  Object.defineProperty(unsafe, 'url', {value: 'https://evil.example/private'});
  const redirected = response(cost);
  Object.defineProperty(redirected, 'redirected', {value: true});
  for (const bad of [
    new Response(token, {status: 401}),
    new Response(token, {status: 403}),
    new Response(token, {status: 302, headers: {location: 'https://evil.example'}}),
    new Response(token, {headers: {'content-type': 'text/html'}}),
    new Response('{"truncated":', {headers: {'content-type': 'application/json'}}),
    unsafe, redirected,
  ]) await assert.rejects(previewPropertyRadarCost({}, token, {fetch: async () => bad}), error => {
    assert.ok(error instanceof PropertyRadarPreviewError);
    assert.ok(!error.message.includes(token));
    return true;
  });
  await assert.rejects(previewPropertyRadarCost({}, token, {fetch: async () => {throw new Error(token);}}), error => {
    assert.ok(error instanceof PropertyRadarPreviewError);
    assert.ok(!error.message.includes(token));
    return true;
  });
});

test('declared and streaming response limits prevent unbounded or partial estimates', async () => {
  await assert.rejects(previewPropertyRadarCost({}, token, {fetch: async () => new Response('{}', {
    headers: {'content-type': 'application/json', 'content-length': String(PROPERTYRADAR_PREVIEW_MAX_BYTES + 1)},
  })}), code('too_large'));
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({start(controller) {controller.enqueue(new Uint8Array(PROPERTYRADAR_PREVIEW_MAX_BYTES + 1));}, cancel() {cancelled = true;}});
  await assert.rejects(previewPropertyRadarCost({}, token, {fetch: async () => new Response(stream, {headers: {'content-type':'application/json'}})}), code('too_large'));
  assert.equal(cancelled, true);
});

test('cancellation and deadline abort a preview without retries', async context => {
  const controller = new AbortController(); controller.abort();
  let calls = 0;
  await assert.rejects(previewPropertyRadarCost({}, token, {signal: controller.signal, fetch: async () => {calls++; return response(cost);}}), code('aborted'));
  assert.equal(calls, 0);
  context.mock.timers.enable({apis: ['setTimeout']});
  try {
    let sentSignal: AbortSignal | null | undefined;
    const pending = previewPropertyRadarCost({}, token, {fetch: async (_url, init) => {calls++; sentSignal = init?.signal; return new Promise<Response>(() => undefined);}});
    const rejected = assert.rejects(pending, code('timeout'));
    context.mock.timers.tick(PROPERTYRADAR_PREVIEW_TIMEOUT_MS);
    await rejected;
    assert.equal(calls, 1);
    assert.equal(sentSignal?.aborted, true);
  } finally {context.mock.timers.reset();}
});

test('CLI defaults to an offline plan, never echoes credentials and refuses purchase/host/token arguments', () => {
  const run = (args: string[], env: Partial<NodeJS.ProcessEnv> = {}) => spawnSync(process.execPath, ['--import','tsx','scripts/propertyradar-preview.ts',...args], {
    cwd: process.cwd(), encoding:'utf8', env: {...process.env, PROPERTYRADAR_API_TOKEN: token, ...env}, timeout: 10_000,
  });
  const plan = run([]);
  assert.equal(plan.status, 0, plan.stderr);
  assert.equal(JSON.parse(plan.stdout).mode, 'offline_plan');
  assert.ok(!plan.stdout.includes(token));
  assert.equal(new URL(JSON.parse(plan.stdout).plan.url).searchParams.get('Purchase'), '0');
  for (const args of [['--purchase'], ['--url','http://127.0.0.1'], ['--token',token], ['--limit','101'], ['--limit','NaN']]) {
    const result = run(args);
    assert.equal(result.status, 1);
    assert.ok(!result.stdout.includes(token) && !result.stderr.includes(token));
  }
  const missing = run(['--preview'], {PROPERTYRADAR_API_TOKEN: ''});
  assert.equal(missing.status, 1);
  assert.ok(!missing.stdout.includes(token) && !missing.stderr.includes(token));
});
