import {execFileSync} from 'node:child_process';
import {mkdtempSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import assert from 'node:assert/strict';

if(process.env.PG_TEST_URL) {
  execFileSync(process.execPath,['--import','tsx','--test','tests/database.test.ts'],{stdio:'inherit'});
} else {
  // An isolated socket-only cluster; never uses application SUPABASE_* settings.
  const directory=mkdtempSync('/tmp/sangam-test-');
  const bindir=process.env.PG_BIN ?? execFileSync('pg_config',['--bindir'],{encoding:'utf8'}).trim();
  const tool=(name,args,options={})=>execFileSync(join(bindir,name),args,{encoding:'utf8',...options});
  let running=false;
  const connection=['-h',directory,'-p','55439','-U','postgres'];
  try {
    tool('initdb',['-D',join(directory,'data'),'-A','trust','--no-locale','-U','postgres']);
    tool('pg_ctl',['-D',join(directory,'data'),'-l',join(directory,'server.log'),'-o',"-k "+directory+" -h '' -p 55439",'start']);
    running=true;
    tool('createdb',[...connection,'sangam_test']);
    const testUrl='postgresql://postgres@localhost:55439/sangam_test?host='+encodeURIComponent(directory);
    execFileSync(process.execPath,['--import','tsx','--test','tests/database.test.ts'],{stdio:'inherit',env:{...process.env,PG_TEST_URL:testUrl}});
    tool('pg_dump',[...connection,'--file',join(directory,'backup.sql'),'sangam_test']);
    tool('createdb',[...connection,'sangam_test_restore']);
    tool('psql',[...connection,'-v','ON_ERROR_STOP=1','-f',join(directory,'backup.sql'),'sangam_test_restore']);
    const verification="select (select md5(string_agg(workspace_id::text || state::text || version::text,'' order by workspace_id)) from public.acquisition_states), (select count(*) from public.acquisition_audit), (select count(*) from pg_class where relnamespace='public'::regnamespace and relrowsecurity);";
    const original=tool('psql',[...connection,'-Atc',verification,'sangam_test']).trim();
    const restored=tool('psql',[...connection,'-Atc',verification,'sangam_test_restore']).trim();
    assert.equal(restored,original,'Backup restore must preserve state, audit records and RLS');
    console.log('Disposable database backup/restore verification passed.');
  } catch(error) {
    if(running) console.error('Disposable database verification failed; application databases were not used.');
    throw error;
  } finally {
    if(running) tool('pg_ctl',['-D',join(directory,'data'),'-m','fast','stop']);
    rmSync(directory,{recursive:true,force:true});
  }
}
