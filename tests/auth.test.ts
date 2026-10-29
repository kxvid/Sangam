import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { generateKeyPairSync, sign } from 'node:crypto';
import { NextRequest, type NextFetchEvent } from 'next/server';

// A locally signed, fictional session exercises Clerk's real signature and azp
// verification. Only its external JWKS download is replaced with our public key.
const previousEnvironment = { ...process.env };
const originalFetch = globalThis.fetch;
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'synthetic-session-key', use: 'sig', alg: 'RS256' };
Object.assign(process.env, {
  NODE_ENV: 'production',
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: `pk_live_${Buffer.from('clerk.sangam-test.invalid$').toString('base64')}`,
  CLERK_SECRET_KEY: 'sk_live_synthetic_auth_test',
});
globalThis.fetch = async (input) => {
  const url = String(input instanceof Request ? input.url : input);
  assert.equal(url, 'https://api.clerk.com/v1/jwks', 'Only the fictional session public key may be requested');
  return new Response(JSON.stringify({ keys: [jwk] }), { headers: { 'content-type': 'application/json' } });
};
const proxyModule = import('../proxy');
const event = { waitUntil() {} } as unknown as NextFetchEvent;

after(() => {
  globalThis.fetch = originalFetch;
  for (const key of Object.keys(process.env)) if (!(key in previousEnvironment)) delete process.env[key];
  Object.assign(process.env, previousEnvironment);
});

function session(authorizedParty: string) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: jwk.kid })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: 'https://clerk.sangam-test.invalid', sub: 'user_synthetic_test', sid: 'sess_synthetic_test',
    azp: authorizedParty, iat: now, nbf: now - 5, exp: now + 300, v: 2, sts: 'active',
  })).toString('base64url');
  const input = `${header}.${payload}`;
  return `${input}.${sign('RSA-SHA256', Buffer.from(input), privateKey).toString('base64url')}`;
}

async function authenticatedRequest(authorizedParty: string, headers: Record<string, string> = {}) {
  const { default: proxy } = await proxyModule;
  return proxy(new NextRequest('https://sangam.kahlalabs.com/api/workspaces', {
    headers: { authorization: `Bearer ${session(authorizedParty)}`, ...headers },
  }), event);
}

test('configured keys without an origin allowlist fail closed before session validation', async () => {
  delete process.env.CLERK_AUTHORIZED_PARTIES;
  const response = await authenticatedRequest('https://sangam.kahlalabs.com');
  assert.equal(response?.status, 503);
  assert.match(response?.headers.get('cache-control') ?? '', /no-store/);
});

test('an invalid allowlist cannot silently fall back to unrestricted Clerk verification', async () => {
  for (const value of [
    '', ' ', '*', 'https://*.kahlalabs.com', 'https://sangam.kahlalabs.com,',
    'https://sangam.kahlalabs.com, https://*.vercel.app',
    'https://sangam.kahlalabs.com/sign-in', 'https://sangam.kahlalabs.com?x=1',
    'https://sangam.kahlalabs.com/', 'https://sangam.kahlalabs.com:443',
    'https://sangam.kahlalabs.com#fragment', 'https://user:pass@sangam.kahlalabs.com',
    'http://sangam.kahlalabs.com', 'http://localhost:3000', 'null',
  ]) {
    process.env.CLERK_AUTHORIZED_PARTIES = value;
    assert.equal((await authenticatedRequest('https://sangam.kahlalabs.com'))?.status, 503, value);
  }
});

test('a correctly signed session from the exact configured origin is accepted', async () => {
  process.env.CLERK_AUTHORIZED_PARTIES = 'https://sangam.kahlalabs.com';
  const response = await authenticatedRequest('https://sangam.kahlalabs.com');
  assert.equal(response?.status, 200);
  assert.equal(response?.headers.get('x-middleware-request-x-clerk-auth-status'), 'signed-in');
});

test('a valid signature cannot authorize a different origin or a spoofed forwarded host', async () => {
  process.env.CLERK_AUTHORIZED_PARTIES = 'https://sangam.kahlalabs.com';
  for (const origin of ['https://attacker.kahlalabs.com', 'https://sangam.kahlalabs.com.attacker.invalid', 'https://other.vercel.app']) {
    const response = await authenticatedRequest(origin, {
      origin, host: new URL(origin).host, 'x-forwarded-host': new URL(origin).host,
    });
    assert.equal(response?.status, 401, origin);
    assert.equal(response?.headers.get('x-middleware-rewrite'), null);
  }
});

test('each configured preview origin is exact and a port change is not authorized', async () => {
  process.env.CLERK_AUTHORIZED_PARTIES = 'https://sangam.kahlalabs.com, https://sangam-approved-preview.vercel.app';
  assert.equal((await authenticatedRequest('https://sangam-approved-preview.vercel.app'))?.status, 200);
  assert.equal((await authenticatedRequest('https://sangam.kahlalabs.com:444'))?.status, 401);
});

test('HTTP loopback is allowed only during local development', async () => {
  Object.assign(process.env, { NODE_ENV: 'development', CLERK_AUTHORIZED_PARTIES: 'http://localhost:3000' });
  try {
    assert.equal((await authenticatedRequest('http://localhost:3000'))?.status, 200);
    assert.equal((await authenticatedRequest('http://localhost:3001'))?.status, 401);
    process.env.CLERK_AUTHORIZED_PARTIES = 'http://sangam.kahlalabs.com';
    assert.equal((await authenticatedRequest('http://sangam.kahlalabs.com'))?.status, 503);
  } finally {
    Object.assign(process.env, { NODE_ENV: 'production' });
  }
});
