import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readCommandRequest, HttpError, json, workspaceId} from '../src/acquisition/http';
import {gunzipSync} from 'node:zlib';

const payload = {workspaceId:'11111111-1111-4111-8111-111111111111', version:0, command:{type:'preview_import'}};
function request(body: unknown = payload, extra: Record<string,string> = {}) {
  return new Request('https://sangam.example/api/acquisition', {method:'POST', headers:{origin:'https://sangam.example','content-type':'application/json',...extra}, body: JSON.stringify(body)});
}
test('a cross-site request cannot submit a workspace command even with a session cookie', async()=>{
  await assert.rejects(readCommandRequest(request(payload, {origin:'https://attacker.example'})), (e: unknown)=> e instanceof HttpError && e.status === 403);
});
test('a request without an origin cannot silently bypass browser CSRF checks', async()=>{
  const req = request(); req.headers.delete('origin');
  await assert.rejects(readCommandRequest(req), (e: unknown)=> e instanceof HttpError && e.status === 403);
});
test('streamed oversized uploads are stopped without trusting Content-Length', async()=>{
  await assert.rejects(readCommandRequest(request(), 20), (e: unknown)=> e instanceof HttpError && e.status === 413);
});
test('invalid UTF-8 cannot be silently replaced and imported under a different hash', async()=>{
  const req = new Request('https://sangam.example/api/acquisition', {method:'POST',headers:{origin:'https://sangam.example','content-type':'application/json'},body:new Uint8Array([0xff,0xfe])});
  await assert.rejects(readCommandRequest(req), /UTF-8/);
});
test('a valid same-origin command preserves its explicit version for CAS', async()=>{
  assert.deepEqual(await readCommandRequest(request()), payload);
  await assert.rejects(readCommandRequest(request({...payload,version:-1})),(e: unknown)=> e instanceof HttpError && e.status === 409);
  assert.throws(()=>workspaceId('other-workspace'), /valid workspace/);
});
test('private responses prohibit browser and intermediary caching', ()=>{
  const res = json({private:true});
  assert.equal(res.headers.get('cache-control'), 'private, no-store, max-age=0');
  assert.equal(res.headers.get('vary'), 'Cookie, Origin, Accept-Encoding');
});
test('large private workspace responses use negotiated gzip and remain valid JSON', async()=>{
  const value = {records:Array.from({length:2500},(_,id)=>({id,address:'Fictional test address',notes:'x'.repeat(1800)}))};
  const req = new Request('https://sangam.example', {headers:{'accept-encoding':'gzip, br'}});
  const res = json(value,200,req);
  assert.equal(res.headers.get('content-encoding'),'gzip');
  assert.deepEqual(JSON.parse(gunzipSync(Buffer.from(await res.arrayBuffer())).toString()),value);
  assert.throws(()=>json(value), (e: unknown)=> e instanceof HttpError && e.status === 413);
});
