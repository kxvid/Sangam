import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, closeSync, mkdtempSync, openSync, readFileSync, readSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { MANIFEST_SQL, TABLES } from './recovery-manifest.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HELP = 'Usage: node scripts/recovery-verify.mjs --trusted-archive /private/sangam.dump --manifest /private/source-manifest.json --report /private/recovery-report.json\nOnly trusted PostgreSQL custom archives are accepted. No destination URL or production credentials are accepted.';
const hash = value => createHash('sha256').update(value).digest('hex');
class RecoveryValidationError extends Error {}

function privateInput(value, maximum) {
  if (!isAbsolute(value)) throw new RecoveryValidationError('Input paths must be absolute.');
  const path = realpathSync(value);
  if (path === ROOT || path.startsWith(ROOT + '/')) throw new RecoveryValidationError('Keep backup inputs outside the repository.');
  const stat = statSync(path);
  if (!stat.isFile() || stat.size > maximum || (stat.mode & 0o077)) throw new RecoveryValidationError('Input must be an owner-only regular file within the documented size limit.');
  return path;
}

export function validateManifest(manifest) {
  if (manifest?.format !== 'sangam-recovery-manifest-v1' || !Array.isArray(manifest.tables) || !Array.isArray(manifest.functions) || !Array.isArray(manifest.sequences)) throw new RecoveryValidationError('Unexpected source manifest format.');
  if (!manifest.databaseOwner || !manifest.schemaOwners || !Array.isArray(manifest.roleSecurity) || !Array.isArray(manifest.roleMemberships)) throw new RecoveryValidationError('Owner and role security evidence is required.');
  for (const name of ['anon','authenticated','service_role']) {
    const role=manifest.roleSecurity.find(r=>r.name===name);
    if(!role || role.superuser!==false || (name!=='service_role' && role.bypassRls!==false)) throw new RecoveryValidationError('Unexpected superuser or RLS-bypass role attributes.');
  }
  if (!isDeepStrictEqual(manifest.tables.map(t => t.name).sort(), TABLES)) throw new RecoveryValidationError('The manifest must include all 15 application tables exactly once.');
  if (!isDeepStrictEqual(manifest.tableInventory, TABLES)) throw new RecoveryValidationError('Unexpected public tables; extend the reviewed recovery inventory before proceeding.');
  for (const table of manifest.tables) {
    if (!table.owner || table.rls !== true || !/^\d+$/.test(table.rows) || !/^[a-f0-9]{64}$/.test(table.contentHash) || !Array.isArray(table.policies) || !table.policies.length) throw new RecoveryValidationError('Manifest is missing table integrity or row security evidence.');
    for (const role of ['anon','authenticated','service_role']) {
      const privileges = table.privileges?.[role];
      if (!privileges || ['insert','update','delete','truncate','references','trigger'].some(p => privileges[p] !== false) || (role !== 'authenticated' && privileges.select !== false)) throw new RecoveryValidationError('Unexpected direct application-table access in the source manifest.');
    }
  }
  for (const name of ['public.acquisition_load','public.acquisition_save','public.workspace_context','public.automation_load','public.automation_commit_acquisition','sangam_private.member_of']) {
    if (!manifest.functions.some(f => f.name === name)) throw new RecoveryValidationError('Required authorization functions are absent.');
  }
  if (manifest.functions.some(f => !f.owner || f.anonExecute !== false || (f.name !== 'sangam_private.member_of' && f.authenticatedExecute !== false))) throw new RecoveryValidationError('Unexpected public function ownership or execution rights.');
}

export function verifyArchive(options) {
  try { return verifyArchiveInternal(options); }
  catch (error) {
    if (error instanceof RecoveryValidationError) throw error;
    // JSON and filesystem failures can include raw private input or filenames.
    throw new RecoveryValidationError('Recovery inputs or output could not be processed. Check private file paths, permissions and the manifest format.');
  }
}

function verifyArchiveInternal({ archive, manifest: manifestPath, report }) {
  archive = privateInput(archive, 512 * 1024 * 1024);
  manifestPath = privateInput(manifestPath, 2 * 1024 * 1024);
  if (!isAbsolute(report)) throw new RecoveryValidationError('Report path must be absolute.');
  const parent = realpathSync(dirname(report));
  if (parent === ROOT || parent.startsWith(ROOT + '/')) throw new RecoveryValidationError('Keep recovery evidence outside the repository.');
  if ((statSync(parent).mode & 0o077) !== 0) throw new RecoveryValidationError('Use an owner-only report directory (chmod 700).');
  report = join(parent, report.split('/').at(-1));
  const expected = JSON.parse(readFileSync(manifestPath, 'utf8'));
  validateManifest(expected);
  const fd = openSync(archive, 'r');
  const magic = Buffer.alloc(5);
  try { readSync(fd, magic, 0, 5, 0); } finally { closeSync(fd); }
  if (magic.toString() !== 'PGDMP') throw new RecoveryValidationError('Expected PostgreSQL custom archive; plain SQL is not accepted.');

  // Ignore every inherited PostgreSQL connection knob and application secret.
  // Tools only receive an explicitly created local Unix socket destination.
  const env = { PATH:process.env.PATH ?? '/usr/bin:/bin', LANG:'C', LC_ALL:'C', TZ:'UTC' };
  const bindir = process.env.PG_BIN ?? execFileSync('pg_config', ['--bindir'], { encoding:'utf8', env }).trim();
  const local = mkdtempSync('/tmp/sangam-recovery-');
  chmodSync(local, 0o700);
  const connection = ['-h', local, '-p', '55441', '-U', 'postgres'];
  const tool = (name, args, options={}) => execFileSync(join(bindir,name), args, { encoding:'utf8', env, stdio:'pipe', timeout:180000, maxBuffer:4*1024*1024, ...options });
  const query = sql => tool('psql',[...connection,'-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-d','sangam_recovery','-c',sql]).trim();
  let running = false;
  let result;
  const started = Date.now();
  try {
    tool('initdb',['-D',join(local,'data'),'-A','trust','--no-locale','-U','postgres']);
    tool('pg_ctl',['-D',join(local,'data'),'-l',join(local,'server.log'),'-o',`-k ${local} -h '' -p 55441`,'start']);
    running = true;
    tool('createdb',[...connection,'sangam_recovery']);
    query('create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;');
    // PostgreSQL's initial public schema has special default privileges. Keep it,
    // skip only its duplicate CREATE, and still restore any archived ACL changes.
    const toc = tool('pg_restore',['--list',archive]);
    const restoreList = toc.split('\n').filter(line => !/^\d+;\s+\d+\s+\d+\s+SCHEMA\s+-\s+public\s/.test(line)).join('\n');
    writeFileSync(join(local,'restore.list'),restoreList,{mode:0o600});
    // No --clean, --create, external destination, role passwords, or TCP listener.
    tool('pg_restore',[...connection,'--exit-on-error','--single-transaction','--no-owner','--no-tablespaces','--use-list',join(local,'restore.list'),'--dbname=sangam_recovery',archive]);
    const restored = JSON.parse(query(MANIFEST_SQL));
    validateManifest(restored);
    if (!isDeepStrictEqual(restored, expected)) throw new RecoveryValidationError('Restored content, schema, ownership, roles, policies, grants, functions or sequence fingerprint differs from the source snapshot.');
    result = {
      format:'sangam-recovery-report-v1', outcome:'local_restore_matches_source_manifest',
      completedAt:new Date().toISOString(), durationSeconds:Math.ceil((Date.now()-started)/1000),
      archiveSha256:hash(readFileSync(archive)), manifestSha256:hash(readFileSync(manifestPath)),
      verifiedTableCount:restored.tables.length, verifiedFunctionCount:restored.functions.length,
      tableRowCounts:Object.fromEntries(restored.tables.map(t=>[t.name,t.rows])),
      productionRestoreVerified:false, sourceAuthenticityVerified:false,
      limitations:['An operator must establish the backup came from the intended production project and snapshot.','No hosted Supabase restore, Clerk identity recovery, storage-object recovery or application sign-in was exercised.','Managed platform roles/owners are not recreated; differences fail closed and require the isolated hosted recovery procedure.','This tool accepts trusted dumps only; a PostgreSQL dump can execute code. A local socket is not a hostile-code sandbox.'],
    };
  } catch {
    // Tool diagnostics may contain seller values from a failed COPY statement.
    throw new RecoveryValidationError('Recovery verification failed; no production connection was used and no success report was written. Check trusted archive compatibility and source fingerprints in a private environment.');
  } finally {
    if (running) {
      try { tool('pg_ctl',['-D',join(local,'data'),'-m','immediate','stop']); }
      catch { throw new RecoveryValidationError('Local recovery cleanup needs attention: PostgreSQL could not be stopped. Temporary data was retained; no production connection was used.'); }
    }
    rmSync(local,{recursive:true,force:true});
  }
  // A cleanup failure must never leave behind a success report.
  writeFileSync(report,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args=process.argv.slice(2);
    if (args.length===1 && args[0]==='--help') console.log(HELP);
    else {
      if(args.length!==6 || args[0]!=='--trusted-archive' || args[2]!=='--manifest' || args[4]!=='--report') throw new RecoveryValidationError(HELP);
      const result=verifyArchive({archive:args[1],manifest:args[3],report:args[5]});
      console.log(JSON.stringify({outcome:result.outcome,verifiedTableCount:result.verifiedTableCount,productionRestoreVerified:false}));
    }
  } catch(error) { console.error(error instanceof RecoveryValidationError ? error.message : 'Recovery verification failed. Private error details were suppressed.'); process.exitCode=1; }
}
