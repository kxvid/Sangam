import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { Client } from 'pg';

const url = process.env.PG_TEST_URL;
test('migration isolates workspaces, denies direct writes and commits state and audit atomically', { skip: !url }, async () => {
  const db = new Client({ connectionString: url });
  await db.connect();
  try {
    const database = (await db.query('select current_database() as name')).rows[0].name;
    assert.match(database, /^sangam_test/, 'Only a disposable sangam_test database may run this test');
    await db.query("do $$ begin if not exists(select from pg_roles where rolname='anon') then create role anon nologin; end if; if not exists(select from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; if not exists(select from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if; end $$;");
    for (const path of readdirSync('supabase/migrations').filter(p=>p.endsWith('.sql')).sort()) {
      await db.query(readFileSync('supabase/migrations/'+path, 'utf8'));
    }
    const a = '10000000-0000-4000-8000-000000000001';
    const b = '10000000-0000-4000-8000-000000000002';
    await db.query("insert into public.workspaces(id,name) values($1,'A'),($2,'B')", [a,b]);
    await db.query("insert into public.workspace_members(workspace_id,user_id,role) values($1,'user_a','admin'),($1,'operator_a','operator'),($2,'user_b','reviewer')", [a,b]);
    await db.query("insert into public.buyers(full_name,source,workspace_id) values('A buyer','test',$1),('B buyer','test',$2),('Unowned legacy','test',null)",[a,b]);
    await db.query('set role anon');
    await assert.rejects(db.query('select * from public.workspaces'),/permission denied/);
    await assert.rejects(db.query("select public.workspace_context($1,'user_a')",[a]),/permission denied/);
    await db.query('reset role');
    await db.query('set role authenticated');
    await db.query("select set_config('request.jwt.claims', $1, false)",[JSON.stringify({sub:'user_a'})]);
    assert.deepEqual((await db.query('select full_name from public.buyers')).rows,[{full_name:'A buyer'}]);
    assert.equal((await db.query('select * from public.workspaces')).rowCount,1);
    await assert.rejects(db.query("insert into public.workspace_members(workspace_id,user_id,role) values($1,'intruder','admin')",[a]), /permission denied/);
    await assert.rejects(db.query("select public.acquisition_load($1,'user_a')",[a]), /permission denied/);
    await db.query("select set_config('request.jwt.claims', $1, false)",[JSON.stringify({sub:'user_b'})]);
    assert.deepEqual((await db.query('select full_name from public.buyers')).rows,[{full_name:'B buyer'}]);
    await db.query('reset role');
    await db.query('set role service_role');
    await assert.rejects(db.query("select public.acquisition_load($1,'user_b')",[a]), /workspace access denied/);
    const state = JSON.stringify({schemaVersion:1,leads:[]});
    const save = (version:number, action='import.commit',actor='user_a')=>db.query('select public.acquisition_save($1,$2,$3,$4::jsonb,$5::jsonb) as version',[a,actor,version,state,JSON.stringify({action})]);
    assert.equal(Number((await save(0)).rows[0].version),1);
    await assert.rejects(save(0), /state version conflict/);
    await assert.rejects(save(1,'set_gate','operator_a'), /reviewer role required/);
    await assert.rejects(db.query('update public.acquisition_states set version=99 where workspace_id=$1',[a]), /permission denied/);
    await assert.rejects(db.query('delete from public.acquisition_audit where workspace_id=$1',[a]), /permission denied/);
    assert.equal((await db.query("select public.acquisition_load($1,'user_a') as loaded",[a])).rows[0].loaded.version,1);
    const peer = new Client({ connectionString: url });
    await peer.connect();
    try {
      await peer.query('set role service_role');
      const concurrent = await Promise.allSettled([
        save(1),
        peer.query('select public.acquisition_save($1,$2,$3,$4::jsonb,$5::jsonb)',[a,'user_a',1,state,JSON.stringify({action:'import.commit'})])
      ]);
      assert.equal(concurrent.filter(r=>r.status==='fulfilled').length,1,'A stale concurrent writer must lose');
      const rejected = concurrent.find(r=>r.status==='rejected') as PromiseRejectedResult;
      assert.match(String(rejected.reason),/state version conflict/);
    }finally{await peer.end();}
    await assert.rejects(db.query('select public.acquisition_save($1,$2,$3,$4::jsonb,$5::jsonb)',[a,'user_a',2,state,JSON.stringify({action:'import.commit',details:[]})]),/check constraint/);
    assert.equal((await db.query("select public.acquisition_load($1,'user_a') as loaded",[a])).rows[0].loaded.version,2,'Audit failure must roll state back');
    await db.query('reset role');
    assert.equal((await db.query('select count(*)::int as n from public.acquisition_audit')).rows[0].n,2);
    await db.query('set role authenticated');
    await db.query("select set_config('request.jwt.claims', $1, false)",[JSON.stringify({sub:'user_b'})]);
    assert.equal((await db.query('select * from public.acquisition_states')).rowCount,0,'Another workspace must not read the export/lead document');
    assert.equal((await db.query('select * from public.acquisition_audit')).rowCount,0,'Another workspace must not read audit history');
    await db.query("select set_config('request.jwt.claims', $1, false)",[JSON.stringify({sub:'user_a'})]);
    assert.equal((await db.query('select * from public.acquisition_states')).rowCount,1);
    assert.equal((await db.query('select * from public.acquisition_audit')).rowCount,2);
    await assert.rejects(db.query("update public.acquisition_states set state='{}'"),/permission denied/);
    await db.query('reset role');
    await db.query("update public.workspace_members set active=false where user_id='user_a'");
    await db.query('set role service_role');
    await assert.rejects(save(2), /workspace access denied/);
    await db.query('reset role');
    await db.query('set role authenticated');
    await db.query("select set_config('request.jwt.claims', $1, false)",[JSON.stringify({sub:'user_a'})]);
    assert.equal((await db.query('select * from public.buyers')).rowCount,0);
    await db.query('reset role');
  } finally { await db.end(); }
});
