import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Client } from 'pg';

const url = process.env.PG_TEST_URL;
const a='20000000-0000-4000-8000-000000000001', b='20000000-0000-4000-8000-000000000002';
const sourceDate='2026-01-01T00:00:00.000Z';
const makeSource=(extra:Record<string,unknown>={})=>({name:'Fictional authorized export',kind:'upload',status:'approved',permissionReference:'PRACTICE: test fixture',rightsExpiresAt:null,synthetic:true,enabled:true,scheduleHours:24,maxRows:2,monthlyRowCap:10,config:{},...extra});
const makeRule=(revision=1,status='published')=>({ruleId:'seller-default',revision,purpose:'seller_research',status,rule:{workspaceId:a,id:'seller-default',revision,purpose:'seller_research',schemaVersion:1}});

test('automation storage enforces workspace rights, durable leases, idempotence, caps, revisions and source permissions', {skip:!url},async()=>{
 const db=new Client({connectionString:url}); await db.connect();
 const peer=new Client({connectionString:url}); await peer.connect();
 const query=async(sql:string,args:unknown[]=[])=> (await db.query(sql,args)).rows[0]?.result;
 const rpc=(name:string,args:unknown[]=[])=>query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as result`,args.map(value=>Array.isArray(value)?JSON.stringify(value):value));
 try{
  assert.match((await db.query('select current_database() name')).rows[0].name,/^sangam_test/);
  await db.query("insert into public.workspaces(id,name) values($1,'Automation A'),($2,'Automation B')",[a,b]);
  await db.query("insert into public.workspace_members(workspace_id,user_id,role) values($1,'auto_admin','admin'),($1,'auto_operator','operator'),($2,'other_admin','admin')",[a,b]);
  await db.query('set role anon');
  await assert.rejects(rpc('automation_load',[a,'auto_admin']),/permission denied/);
  await assert.rejects(db.query('select * from public.automation_jobs'),/permission denied/);
  await db.query('reset role'); await db.query('set role authenticated');
  await assert.rejects(rpc('automation_claim',[null]),/permission denied/);
  await assert.rejects(db.query('select * from public.automation_records'),/permission denied/);
  await db.query('reset role'); await db.query('set role service_role'); await peer.query('set role service_role');
  await assert.rejects(rpc('automation_load',[a,'other_admin']),/workspace access denied/);
  await assert.rejects(rpc('automation_save_source',[a,'auto_operator',0,makeSource()]),/workspace access denied/);
  await assert.rejects(db.query('insert into public.automation_sources(name) values($1)',['bad']),/permission denied/);
  const source=await rpc('automation_save_source',[a,'auto_admin',0,makeSource()]);
  assert.equal(source.revision,1); assert.equal(source.kind,'upload');
  await assert.rejects(rpc('automation_save_source',[b,'other_admin',0,{...makeSource(),id:source.id}]),/workspace source not found/);
  assert.equal((await rpc('automation_load',[a,'auto_admin'])).sources[0].revision,1,'Cross-workspace source IDs cannot update another workspace');
  const collisionId='20000000-0000-4000-8000-000000000088';
  const sameId=makeSource({id:collisionId});
  const collision=await Promise.allSettled([rpc('automation_save_source',[a,'auto_admin',0,sameId]),peer.query('select public.automation_save_source($1,$2,$3,$4) as result',[b,'other_admin',0,sameId]).then(r=>r.rows[0].result)]);
  assert.equal(collision.filter(item=>item.status==='fulfilled').length,1,'Concurrent identical IDs cannot cross workspace ownership');
  assert.match(String((collision.find(item=>item.status==='rejected') as PromiseRejectedResult).reason),/workspace source not found/);
  await assert.rejects(rpc('automation_save_source',[a,'auto_admin',0,{...makeSource(),id:source.id}]),/source revision conflict/);
  await assert.rejects(rpc('automation_save_source',[a,'auto_admin',1,{...makeSource({synthetic:false}),id:source.id}]),/practice mode is immutable/);
  await assert.rejects(rpc('automation_save_source',[a,'auto_admin',0,makeSource({synthetic:false,rightsExpiresAt:'2099-01-01T00:00:00Z'})]),/current data permission/);
  const rule=await rpc('automation_save_rule',[a,'auto_admin',makeRule()]);
  await assert.rejects(rpc('automation_save_rule',[a,'auto_operator',makeRule(2)]),/workspace access denied/);
  await assert.rejects(rpc('automation_save_rule',[a,'auto_admin',makeRule()]),/rule revision conflict/);
  const job=await rpc('automation_enqueue',[a,'auto_operator',source.id,'import-1',{csv:'fictional CSV',sourceDate},'ingest']);
  assert.equal(job.status,'queued'); assert.equal('input' in job,false); assert.equal('leaseToken' in job,false);
  assert.equal((await rpc('automation_enqueue',[a,'auto_operator',source.id,'import-1',{csv:'fictional CSV',sourceDate},'ingest'])).id,job.id);
  await assert.rejects(rpc('automation_enqueue',[a,'auto_operator',source.id,'import-1',{csv:'different',sourceDate},'ingest']),/request key reused/);
  await assert.rejects(rpc('automation_enqueue',[b,'other_admin',source.id,'evil',{csv:'x',sourceDate},'ingest']),/workspace source not found/);
  const concurrent=await Promise.all([
   rpc('automation_claim',[job.id]),
   peer.query('select public.automation_claim($1) as result',[job.id]).then(r=>r.rows[0].result)
  ]);
  assert.equal(concurrent.filter(Boolean).length,1,'One worker wins the lease');
  const claim=concurrent.find(Boolean); assert.ok(claim.leaseToken); assert.equal(claim.input.csv,'fictional CSV'); assert.equal(claim.rules.length,1);
  const record={id:'20000000-0000-4000-8000-000000000011',recordKey:'riverside:TEST001',contentHash:'a'.repeat(64),lead:{id:'20000000-0000-4000-8000-000000000010',county:'Riverside',apn:'TEST001',ownerName:'Fictional Seller',address:'123 Fictional St',synthetic:true,permissionReference:source.permissionReference,sourceDate}};
  const decision={sourceId:source.id,sourceRevision:source.revision,evaluation:{ruleId:'seller-default',revision:1,decision:'eligible'},recordId:record.lead.id};
  await assert.rejects(rpc('automation_finish',[job.id,'20000000-0000-4000-8000-000000000099',[record],[decision],0]),/job lease unavailable/);
  await assert.rejects(rpc('automation_finish',[job.id,claim.leaseToken,[{...record,lead:{...record.lead,synthetic:false}}],[decision],0]),/provenance mismatch/);
  assert.equal((await rpc('automation_finish',[job.id,claim.leaseToken,[record],[decision],0])).status,'completed');
  await assert.rejects(rpc('automation_finish',[job.id,claim.leaseToken,[record],[decision],0]),/job lease unavailable/);
  assert.equal((await rpc('automation_enqueue',[a,'auto_operator',source.id,'import-1',{csv:'fictional CSV',sourceDate},'ingest'])).id,job.id,'Completed retries cannot create duplicate work');
  await assert.rejects(rpc('automation_enqueue',[a,'auto_operator',source.id,'import-1',{csv:'different',sourceDate},'ingest']),/request key reused/);
  let snapshot=await rpc('automation_load',[a,'auto_operator']);
  assert.equal(snapshot.recordCount,1); assert.equal(snapshot.records.length,1); assert.equal(snapshot.decisions.length,1);
  const recordId=snapshot.records[0].id;
  assert.equal((await rpc('automation_load_record',[a,'auto_operator',recordId])).id,recordId);
  assert.equal(await rpc('automation_load_record',[b,'other_admin',recordId]),null,'Independent record load stays workspace scoped');
  assert.equal(await rpc('automation_enqueue_due'),1); assert.equal(await rpc('automation_enqueue_due'),0);
  const refresh=await rpc('automation_claim',[null]); assert.equal(refresh.kind,'refresh'); assert.equal(refresh.records[0].lead.sourceDate,sourceDate);
  await assert.rejects(rpc('automation_finish',[refresh.id,refresh.leaseToken,[{...record,lead:{...record.lead,sourceDate:'2026-02-01T00:00:00Z'}}],[decision],0]),/refresh cannot rewrite/);
  assert.equal((await rpc('automation_finish',[refresh.id,refresh.leaseToken,[record],[decision],0])).status,'completed');
  snapshot=await rpc('automation_load',[a,'auto_admin']); assert.equal(snapshot.recordCount,1); assert.equal(snapshot.records[0].id,recordId);
  assert.equal(snapshot.records[0].lead.sourceDate,sourceDate,'Refresh does not invent source freshness');
  assert.equal(snapshot.decisions.length,2);
  const replacement=await rpc('automation_save_rule',[a,'auto_admin',makeRule(2)]);
  assert.equal((await rpc('automation_load',[a,'auto_admin'])).rules.find((r:{id:string})=>r.id===rule.id).status,'retired');
  const second=await rpc('automation_enqueue',[a,'auto_admin',source.id,'import-2',{csv:'fictional new CSV',sourceDate},'ingest']);
  const secondClaim=await rpc('automation_claim',[second.id]);
  await assert.rejects(rpc('automation_finish',[second.id,secondClaim.leaseToken,[record],[decision],0]),/published rule changed/);
  const currentDecision={...decision,evaluation:{ruleId:'seller-default',revision:2,decision:'eligible'}};
  const changedSource=await rpc('automation_save_source',[a,'auto_admin',1,{...makeSource(),id:source.id,status:'paused',enabled:false}]);
  assert.equal(changedSource.revision,2);
  await assert.rejects(rpc('automation_commit_acquisition',[a,'auto_admin',0,{schemaVersion:1,leads:[record.lead]},{action:'export_batch'},[{id:source.id,revision:changedSource.revision,permissionReference:source.permissionReference}]]),/source approval unavailable/);
  await assert.rejects(rpc('automation_commit_acquisition',[b,'other_admin',0,{schemaVersion:1,leads:[]},{action:'export_batch'},[{id:source.id,revision:changedSource.revision,permissionReference:source.permissionReference}]]),/workspace source not found/);
  await assert.rejects(rpc('automation_finish',[second.id,secondClaim.leaseToken,[record],[currentDecision],0]),/job lease unavailable/);
  await assert.rejects(rpc('automation_save_decisions',[a,'auto_admin',replacement.id,[currentDecision],0]),/source approval unavailable/);
  const revokedDecision={...currentDecision,sourceRevision:changedSource.revision,evaluation:{...currentDecision.evaluation,decision:'review'}};
  assert.ok((await rpc('automation_save_decisions',[a,'auto_admin',replacement.id,[revokedDecision],0])).id,'Current revoked-source review decisions stay visible');
  await assert.rejects(rpc('automation_promote_record',[a,'auto_admin',recordId,0,{schemaVersion:1,leads:[record.lead]},{action:'import_leads'},record.contentHash,1,replacement.id]),/source record changed/);
  const resumed=await rpc('automation_save_source',[a,'auto_admin',2,{...makeSource(),id:source.id}]);
  await assert.rejects(rpc('automation_save_decisions',[a,'auto_admin',replacement.id,[currentDecision],0]),/source revision conflict/);
  assert.ok((await rpc('automation_save_decisions',[a,'auto_admin',replacement.id,[{...currentDecision,sourceRevision:resumed.revision}],0])).id);
  await assert.rejects(rpc('automation_promote_record',[a,'auto_admin',recordId,0,{schemaVersion:1,leads:[record.lead]},{action:'import_leads'},'b'.repeat(64),resumed.revision,replacement.id]),/source record changed/);
  await assert.rejects(rpc('automation_promote_record',[a,'auto_admin',recordId,0,{schemaVersion:1,leads:[record.lead]},{action:'import_leads'},record.contentHash,resumed.revision,rule.id]),/published rule changed/);
  assert.equal(Number(await rpc('automation_promote_record',[a,'auto_admin',recordId,0,{schemaVersion:1,leads:[record.lead]},{action:'import_leads'},record.contentHash,resumed.revision,replacement.id])),1);
  await assert.rejects(rpc('automation_save_decisions',[a,'auto_admin',replacement.id,[{...currentDecision,sourceRevision:resumed.revision}],0]),/acquisition version conflict/);
  const manualDecision={...currentDecision,sourceId:'manual-'+record.lead.id,sourceRevision:0,leadId:record.lead.id};
  assert.ok((await rpc('automation_save_decisions',[a,'auto_admin',replacement.id,[manualDecision],1])).id);
  await assert.rejects(rpc('automation_save_decisions',[a,'auto_admin',replacement.id,[{...manualDecision,leadId:'another-lead'}],1]),/manual decision lead unavailable/);
  await assert.rejects(rpc('automation_save_decisions',[a,'auto_admin',rule.id,[manualDecision],1]),/workspace rule not found/);
  const leaseJob=await rpc('automation_enqueue',[a,'auto_admin',source.id,'lease-expiry',{csv:'fictional',sourceDate},'ingest']);
  const lease1=await rpc('automation_claim',[leaseJob.id]);
  await db.query('reset role'); await db.query("update public.automation_jobs set lease_expires_at=now()-interval '1 second' where id=$1",[leaseJob.id]); await db.query('set role service_role');
  const lease2=await rpc('automation_claim',[leaseJob.id]); assert.notEqual(lease1.leaseToken,lease2.leaseToken); assert.equal(lease2.attempts,2);
  await assert.rejects(rpc('automation_finish',[leaseJob.id,lease1.leaseToken,[record],[],1]),/job lease unavailable/);
  const retry=await rpc('automation_fail',[leaseJob.id,lease2.leaseToken,'temporary_storage',true]); assert.equal(retry.status,'retry_wait');
  assert.equal(await rpc('automation_claim',[leaseJob.id]),null,'Backoff must be respected');
  await db.query('reset role'); await db.query("update public.automation_jobs set next_attempt_at=now()-interval '1 second' where id=$1",[leaseJob.id]); await db.query('set role service_role');
  const lease3=await rpc('automation_claim',[leaseJob.id]); assert.equal(lease3.attempts,3);
  assert.equal((await rpc('automation_fail',[leaseJob.id,lease3.leaseToken,'temporary_storage',true])).status,'dead_letter');
  const capped=await rpc('automation_save_source',[a,'auto_admin',0,makeSource({name:'Cap test',maxRows:1,monthlyRowCap:1,enabled:false})]);
  const cap1=await rpc('automation_enqueue',[a,'auto_admin',capped.id,'cap-1',{csv:'fictional',sourceDate},'ingest']);
  const cap2=await rpc('automation_enqueue',[a,'auto_admin',capped.id,'cap-2',{csv:'fictional',sourceDate},'ingest']);
  const capLease=await rpc('automation_claim',[cap1.id]); assert.ok(capLease);
  assert.equal(await rpc('automation_claim',[cap2.id]),null,'A concurrent reserved budget cannot be spent twice');
  assert.equal((await rpc('automation_load',[a,'auto_admin'])).jobs.find((j:{id:string})=>j.id===cap2.id).errorCode,'monthly_row_cap');
  await rpc('automation_fail',[cap1.id,capLease.leaseToken,'test_hold',false]);
  const gate={name:'data_provenance',status:'approved',reviewedAt:sourceDate,expiresAt:null};
  const realState={schemaVersion:1,leads:[],gates:[gate]};
  await rpc('acquisition_save',[b,'other_admin',0,realState,{action:'set_gate'}]);
  const realSource=await rpc('automation_save_source',[b,'other_admin',0,makeSource({synthetic:false,rightsExpiresAt:'2099-01-01T00:00:00Z',enabled:false})]);
  const realJob=await rpc('automation_enqueue',[b,'other_admin',realSource.id,'real-gate-test',{csv:'fictional test fixture',sourceDate},'ingest']);
  const realClaim=await rpc('automation_claim',[realJob.id]); assert.ok(realClaim);
  const blockedState={...realState,gates:[{...gate,status:'blocked'}]};
  await rpc('acquisition_save',[b,'other_admin',1,blockedState,{action:'set_gate'}]);
  await assert.rejects(rpc('automation_finish',[realJob.id,realClaim.leaseToken,[],[],1]),/source approval unavailable/);
  await rpc('automation_fail',[realJob.id,realClaim.leaseToken,'SOURCE_NOT_CURRENT',false]);
  await assert.rejects(rpc('automation_enqueue',[b,'other_admin',realSource.id,'blocked-gate',{csv:'fixture',sourceDate},'ingest']),/source approval unavailable/);
  await rpc('acquisition_save',[b,'other_admin',2,realState,{action:'set_gate'}]);
  const queuedBeforeBlock=await rpc('automation_enqueue',[b,'other_admin',realSource.id,'queued-before-block',{csv:'fixture',sourceDate},'ingest']);
  await rpc('acquisition_save',[b,'other_admin',3,blockedState,{action:'set_gate'}]);
  assert.equal(await rpc('automation_claim',[queuedBeforeBlock.id]),null,'Gate revoked while queued prevents worker access');
  await db.query('reset role');
  assert.equal((await db.query("select count(*)::int n from public.automation_jobs where status in ('completed','held','dead_letter') and input<>'{}'::jsonb")).rows[0].n,0,'Terminal jobs discard raw CSV input');
  assert.equal((await db.query("select count(*)::int n from pg_class where relnamespace='public'::regnamespace and relname like 'automation_%' and relkind='r' and not relrowsecurity")).rows[0].n,0);
  assert.equal((await db.query("select count(*)::int n from information_schema.role_table_grants where table_schema='public' and table_name like 'automation_%' and grantee in ('anon','authenticated','service_role')")).rows[0].n,0);
  await db.query('set role service_role');
  const scope=[{id:source.id,revision:resumed.revision,permissionReference:source.permissionReference}];
  assert.equal(Number(await rpc('automation_commit_acquisition',[a,'auto_admin',1,{schemaVersion:1,leads:[record.lead]},{action:'export_batch'},scope])),2);
  await assert.rejects(rpc('automation_commit_acquisition',[a,'auto_admin',1,{schemaVersion:1,leads:[record.lead]},{action:'export_batch'},scope]),/state version conflict/);
  await assert.rejects(rpc('automation_commit_acquisition',[a,'auto_admin',2,{schemaVersion:1,leads:[record.lead]},{action:'export_batch'},[{...scope[0],permissionReference:'wrong'}]]),/source revision conflict/);
  await db.query('reset role');
  await db.query("update public.workspace_members set active=false where workspace_id=$1 and user_id='auto_admin'",[a]); await db.query('set role service_role');
  await assert.rejects(rpc('automation_load',[a,'auto_admin']),/workspace access denied/);
 } finally{await db.end();await peer.end();}
});

test('500 source rows and actual decision-tree explanations fit the durable transaction', {skip:!url},async()=>{
 const [{initialState,parseImport},{createSellerRule},{evaluateRecords,dataHash}]=await Promise.all([
  import('../src/acquisition/domain'),import('../src/automation/rules'),import('../src/automation/research')
 ]);
 const db=new Client({connectionString:url}); await db.connect();
 const workspace='20000000-0000-4000-8000-000000000003',now=new Date().toISOString(),day=now.slice(0,10);
 const rpc=async(name:string,args:unknown[]=[])=> (await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as result`,args.map(value=>Array.isArray(value)?JSON.stringify(value):value))).rows[0].result;
 try {
  assert.match((await db.query('select current_database() name')).rows[0].name,/^sangam_test/);
  await db.query("insert into public.workspaces(id,name) values($1,'Volume fictional workspace')",[workspace]);
  await db.query("insert into public.workspace_members(workspace_id,user_id,role) values($1,'volume_admin','admin')",[workspace]);
  await db.query('set role service_role');
  const source=await rpc('automation_save_source',[workspace,'volume_admin',0,makeSource({maxRows:500,monthlyRowCap:10000})]);
  const rule=createSellerRule(workspace,'volume-seller',1);
  const version=await rpc('automation_save_rule',[workspace,'volume_admin',{ruleId:rule.id,revision:1,purpose:rule.purpose,status:'published',rule}]);
  const csv='county,apn,address,city,zip,owner_name,mailing_address,property_type,equity_pct,tax_delinquent_years,years_owned,nod,vacant,absentee,inherited,code_violations\n'+Array.from({length:500},(_,i)=>`Riverside,TEST-${i},${i} Fictional Road,Riverside,92501,Fictional Seller ${i},${i} Fictional Mail Road,SFR,75,2,12,false,true,true,false,false`).join('\n');
  const leads=parseImport(initialState(),{csv,source:source.name,sourceDate:day,permissionReference:source.permissionReference,synthetic:true},now).leads;
  const job=await rpc('automation_enqueue',[workspace,'volume_admin',source.id,'volume-import',{csv,sourceDate:day},'ingest']);
  const claim=await rpc('automation_claim',[job.id]);
  const records=leads.map(lead=>({id:lead.id,workspaceId:workspace,sourceId:source.id,recordKey:`riverside:${lead.apn}`,contentHash:dataHash(lead),lead,lastRunId:job.id,updatedAt:now}));
  const decisions=evaluateRecords(version,records,[source],initialState(),now).map(item=>{
   const {snapshot,...evaluation}=item.evaluation; void snapshot;
   return {...item,evaluation};
  });
  assert.equal(decisions.length,500); assert.ok(decisions.every(item=>item.evaluation.decision==='eligible'));
  const bytes=Buffer.byteLength(JSON.stringify(decisions)); assert.ok(bytes>1_500_000,'Exercise real explanation volume beyond the old payload bound'); assert.ok(bytes<12_000_000);
  const result=await rpc('automation_finish',[job.id,claim.leaseToken,records,decisions,0]);
  assert.equal(result.status,'completed'); assert.equal(result.recordCount,500);
  const loaded=await rpc('automation_load',[workspace,'volume_admin']);
  assert.equal(loaded.recordCount,500); assert.equal(loaded.records.length,250); assert.equal(loaded.recordLimit,250);
  assert.equal(loaded.decisions[0].results.length,500);
  const page2=await rpc('automation_load',[workspace,'volume_admin',250]);
  assert.equal(page2.recordOffset,250); assert.equal(page2.records.length,250);
  assert.equal(new Set([...loaded.records,...page2.records].map(item=>item.id)).size,500,'Pages cover all records without overlap');
  assert.equal((await rpc('automation_load_record',[workspace,'volume_admin',page2.records[249].id])).id,page2.records[249].id);
  await assert.rejects(rpc('automation_load',[workspace,'volume_admin',-1]),/invalid record page/);
  console.log(`Actual 500-row decision payload: ${bytes} bytes; durable commit and bounded list passed.`);
 }finally{await db.end();}
});

test('concurrent source commits cannot exceed the shared workspace record capacity', {skip:!url},async()=>{
 const db=new Client({connectionString:url}),peer=new Client({connectionString:url}); await db.connect(); await peer.connect();
 const workspace='20000000-0000-4000-8000-000000000004';
 const rpc=async(client:Client,name:string,args:unknown[]=[])=> (await client.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as result`,args.map(value=>Array.isArray(value)?JSON.stringify(value):value))).rows[0].result;
 try {
  assert.match((await db.query('select current_database() name')).rows[0].name,/^sangam_test/);
  await db.query("insert into public.workspaces(id,name) values($1,'Concurrent capacity fixture')",[workspace]);
  await db.query("insert into public.workspace_members(workspace_id,user_id,role) values($1,'cap_admin','admin')",[workspace]);
  const sources=(await db.query("insert into public.automation_sources(workspace_id,name,kind,status,permission_reference,synthetic,enabled,schedule_hours,max_rows,monthly_row_cap,updated_by) select $1,'Seed '||n,'upload','approved','FICTIONAL capacity fixture',true,false,24,500,10000,'cap_admin' from generate_series(1,10) n returning id",[workspace])).rows;
  for(let i=0;i<sources.length;i++) {
   const job=(await db.query("insert into public.automation_jobs(workspace_id,source_id,source_revision,kind,status,request_key,input_hash,created_by) values($1,$2,1,'ingest','completed','seed','fixture','cap_admin') returning id",[workspace,sources[i].id])).rows[0].id;
   await db.query("insert into public.automation_records(workspace_id,source_id,record_key,content_hash,lead,last_run_id) select $1,$2,'TEST-'||n,repeat('a',64),jsonb_build_object('id',gen_random_uuid(),'synthetic',true,'permissionReference','FICTIONAL capacity fixture','sourceDate','2026-01-01'),$3 from generate_series(1,$4::int) n",[workspace,sources[i].id,job,i===9?499:500]);
  }
  await db.query('set role service_role'); await peer.query('set role service_role');
  const source1=await rpc(db,'automation_save_source',[workspace,'cap_admin',0,makeSource({name:'Final slot A',maxRows:1,enabled:false})]);
  const source2=await rpc(db,'automation_save_source',[workspace,'cap_admin',0,makeSource({name:'Final slot B',maxRows:1,enabled:false})]);
  const job1=await rpc(db,'automation_enqueue',[workspace,'cap_admin',source1.id,'one',{csv:'fixture',sourceDate},'ingest']);
  const job2=await rpc(db,'automation_enqueue',[workspace,'cap_admin',source2.id,'two',{csv:'fixture',sourceDate},'ingest']);
  const claim1=await rpc(db,'automation_claim',[job1.id]),claim2=await rpc(db,'automation_claim',[job2.id]);
  const record=(id:string,source:{permissionReference:string})=>({id,recordKey:id,contentHash:'a'.repeat(64),lead:{id,synthetic:true,permissionReference:source.permissionReference,sourceDate}});
  const outcomes=await Promise.allSettled([
   rpc(db,'automation_finish',[job1.id,claim1.leaseToken,[record('20000000-0000-4000-8000-000000000070',source1)],[],0]),
   rpc(peer,'automation_finish',[job2.id,claim2.leaseToken,[record('20000000-0000-4000-8000-000000000071',source2)],[],0])
  ]);
  assert.equal(outcomes.filter(item=>item.status==='fulfilled').length,1);
  assert.match(String((outcomes.find(item=>item.status==='rejected') as PromiseRejectedResult).reason),/workspace retained record capacity exceeded/);
  assert.equal((await rpc(db,'automation_load',[workspace,'cap_admin'])).recordCount,5000);
 }finally {await db.end();await peer.end();}
});
