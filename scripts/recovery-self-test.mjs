// Entirely fictional source data and socket-only temporary PostgreSQL clusters.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { MANIFEST_SQL } from './recovery-manifest.mjs';
import { validateManifest, verifyArchive } from './recovery-verify.mjs';

const local=mkdtempSync('/tmp/sangam-recovery-fixture-');
chmodSync(local,0o700);
const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!/^PG/.test(key)));
const bindir=process.env.PG_BIN ?? execFileSync('pg_config',['--bindir'],{encoding:'utf8',env}).trim();
const tool=(name,args)=>execFileSync(join(bindir,name),args,{encoding:'utf8',env,timeout:180000,maxBuffer:4*1024*1024});
const connection=['-h',local,'-p','55442','-U','postgres'];
const query=sql=>tool('psql',[...connection,'-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-d','sangam_test_recovery','-c',sql]).trim();
let running=false;
try {
  tool('initdb',['-D',join(local,'data'),'-A','trust','--no-locale','-U','postgres']);
  tool('pg_ctl',['-D',join(local,'data'),'-l',join(local,'server.log'),'-o',`-k ${local} -h '' -p 55442`,'start']);
  running=true;
  tool('createdb',[...connection,'sangam_test_recovery']);
  const fixtureEnv={...env,PG_TEST_URL:'postgresql://postgres@localhost:55442/sangam_test_recovery?host='+encodeURIComponent(local)};
  for (const file of ['tests/database.test.ts','tests/automation-database.test.ts']) {
    execFileSync(process.execPath,['--import','tsx','--test',file],{env:fixtureEnv,stdio:'pipe'});
  }
  const archive=join(local,'fixture.dump'),manifest=join(local,'manifest.json');
  tool('pg_dump',[...connection,'--format=custom','--no-owner','--schema=public','--schema=sangam_private','--file',archive,'sangam_test_recovery']);
  chmodSync(archive,0o600);
  writeFileSync(manifest,query(MANIFEST_SQL)+'\n',{mode:0o600});
  const expected=JSON.parse(readFileSync(manifest,'utf8'));
  validateManifest(expected);
  assert.ok(Number(expected.tables.find(t=>t.name==='acquisition_states').rows)>0);
  assert.ok(Number(expected.tables.find(t=>t.name==='automation_records').rows)>0);
  // Host/service variables cannot redirect the restore to an external database.
  const before={PGHOST:process.env.PGHOST,PGSERVICE:process.env.PGSERVICE,PGDATABASE:process.env.PGDATABASE};
  process.env.PGHOST='do-not-connect.invalid'; process.env.PGSERVICE='do-not-use'; process.env.PGDATABASE='production';
  try {
    const result=verifyArchive({archive,manifest,report:join(local,'report.json')});
    assert.equal(result.productionRestoreVerified,false);
    assert.equal(result.verifiedTableCount,15);
    assert.equal(result.sourceAuthenticityVerified,false);
  } finally { for(const [key,value] of Object.entries(before)) { if(value===undefined) delete process.env[key]; else process.env[key]=value; } }
  const tampered=structuredClone(expected); tampered.tables[0].contentHash='f'.repeat(64);
  const wrong=join(local,'wrong-manifest.json'); writeFileSync(wrong,JSON.stringify(tampered),{mode:0o600});
  assert.throws(()=>verifyArchive({archive,manifest:wrong,report:join(local,'must-not-pass.json')}),/Recovery verification failed/);
  const insecure=structuredClone(expected); insecure.tables[0].rls=false;
  assert.throws(()=>validateManifest(insecure),/row security/);
  const missing=structuredClone(expected); missing.tables.pop();
  assert.throws(()=>validateManifest(missing),/15 application tables/);
  const extraAccess=structuredClone(expected); extraAccess.tables[0].privileges.authenticated.update=true;
  assert.throws(()=>validateManifest(extraAccess),/direct application-table access/);
  const bypass=structuredClone(expected); bypass.roleSecurity.find(r=>r.name==='authenticated').bypassRls=true;
  assert.throws(()=>validateManifest(bypass),/RLS-bypass/);
  const nonSuperOwner=structuredClone(expected); nonSuperOwner.roleSecurity.find(r=>r.name==='postgres').superuser=false;
  const roleManifest=join(local,'role-manifest.json'); writeFileSync(roleManifest,JSON.stringify(nonSuperOwner),{mode:0o600});
  assert.throws(()=>verifyArchive({archive,manifest:roleManifest,report:join(local,'role-must-not-pass.json')}),/Recovery verification failed/);
  query('create role alternate_owner nologin; alter function sangam_private.acquisition_load(uuid,text) owner to alternate_owner;');
  const changedOwner=join(local,'changed-owner.dump');
  tool('pg_dump',[...connection,'--format=custom','--no-owner','--schema=public','--schema=sangam_private','--file',changedOwner,'sangam_test_recovery']);
  chmodSync(changedOwner,0o600);
  const ownerManifest=join(local,'owner-manifest.json'); writeFileSync(ownerManifest,query(MANIFEST_SQL)+'\n',{mode:0o600});
  assert.throws(()=>verifyArchive({archive:changedOwner,manifest:ownerManifest,report:join(local,'owner-must-not-pass.json')}),/Recovery verification failed/);
  const plain=join(local,'plain.sql'); writeFileSync(plain,'select 1;\n',{mode:0o600});
  assert.throws(()=>verifyArchive({archive:plain,manifest,report:join(local,'plain-report.json')}),/custom archive/);
  const secretMarker='PRIVATE-SELLER-CREDENTIAL-DO-NOT-PRINT';
  const malformed=join(local,secretMarker+'.json');
  writeFileSync(malformed,JSON.stringify({privateData:secretMarker})+'invalid trailing input',{mode:0o600});
  const invoke=source=>spawnSync(process.execPath,['scripts/recovery-verify.mjs','--trusted-archive',archive,'--manifest',source,'--report',join(local,'redaction-report.json')],{encoding:'utf8'});
  for (const source of [malformed,join(local,'missing-'+secretMarker+'.json')]) {
    const result=invoke(source);
    assert.equal(result.status,1);
    assert.equal(result.stdout,'');
    assert.ok(!result.stderr.includes(secretMarker),'Neither malformed JSON nor filesystem diagnostics may echo private content or filenames');
    assert.ok(!result.stderr.includes(local),'Private input directory must not be disclosed by raw diagnostics');
    assert.match(result.stderr,/Recovery inputs or output could not be processed/);
  }
  assert.throws(()=>verifyArchive({archive,manifest:malformed,report:join(local,'no-report.json')}),error=>{
    assert.ok(!error.message.includes(secretMarker));
    assert.match(error.message,/Recovery inputs or output could not be processed/);
    return true;
  });
  const rejected=execFileSync(process.execPath,['scripts/recovery-verify.mjs','--help'],{encoding:'utf8'});
  assert.match(rejected,/No destination URL/);
  console.log('Recovery rehearsal passed: 15 tables with data, matching restore, tampered fingerprint rejected, missing table rejected, RLS/direct-access/role-bypass and changed-owner regressions rejected, plain SQL rejected, malformed JSON and filesystem diagnostics redacted, inherited production connection settings ignored. No production database used.');
} finally {
  if(running) tool('pg_ctl',['-D',join(local,'data'),'-m','immediate','stop']);
  rmSync(local,{recursive:true,force:true});
}
