// Exercise the actual built Next routes with intentionally absent credentials.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';

const socket=createServer();
socket.listen(0,'127.0.0.1'); await once(socket,'listening');
const port=socket.address().port; await new Promise(resolve=>socket.close(resolve));
const env={...process.env,NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1',CLERK_SECRET_KEY:'',NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:'',SUPABASE_URL:'',SUPABASE_SERVICE_ROLE_KEY:'',CRON_SECRET:''};
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{env,stdio:['ignore','pipe','pipe']});
const origin=`http://127.0.0.1:${port}`;
let startup=''; server.stdout.on('data',data=>startup+=data.toString()); server.stderr.on('data',data=>startup+=data.toString());
try {
  let ready=false;
  for(let i=0;i<100;i++) {
    if(server.exitCode!==null) throw new Error('Production server exited before becoming ready.');
    try { const res=await fetch(origin+'/api/workspaces'); if(res.status===503) {ready=true;break;} } catch {}
    await delay(100);
  }
  assert.ok(ready,'Production server must fail closed with unconfigured authentication.');
  for(const path of ['/','/acquisition','/automation','/operations','/api/public-data','/api/automation?workspaceId=11111111-1111-4111-8111-111111111111','/api/workspaces','/api/acquisition?workspaceId=11111111-1111-4111-8111-111111111111']) {
    const res=await fetch(origin+path); assert.equal(res.status,503,path);
    assert.match(res.headers.get('cache-control')??'',/no-store/);
    assert.match(await res.text(),/Sign-in is not configured/);
  }
  for(const path of ['/api/outreach','/api/score','/api/match','/api/webhooks/twilio','/api/webhooks/resend']) {
    const res=await fetch(origin+path,{method:'POST',headers:{'content-type':'application/json',origin},body:'{}'});
    assert.equal(res.status,410,path);
  }
  assert.equal((await fetch(origin+'/api/cron/discovery')).status,410);
  assert.equal((await fetch(origin+'/api/cron/sourcing')).status,401);
  assert.equal((await fetch(origin+'/api/cron/sourcing',{headers:{authorization:'Bearer not-a-scheduler-secret'}})).status,401);
  console.log('Built production HTTP smoke passed: private routes fail closed; all six retired endpoints refuse operation.');
} catch(error) {
  // No credentials or live data were supplied to this process.
  console.error(startup.slice(-2000)); throw error;
} finally {
  server.kill('SIGTERM');
  await Promise.race([once(server,'exit'),delay(3000).then(()=>server.kill('SIGKILL'))]);
}
