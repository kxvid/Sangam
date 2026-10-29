-- Authorized export processing and decision history. No network or outreach capability.
-- New objects are accessible only through narrowly scoped server RPCs.
begin;
create table public.automation_sources (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
 revision integer not null default 1 check(revision>0), name text not null check(length(name) between 1 and 160),
 kind text not null check(kind='upload'), status text not null check(status in ('draft','approved','paused','revoked')),
 permission_reference text not null check(length(permission_reference)<=2000), rights_expires_at timestamptz,
 synthetic boolean not null, enabled boolean not null default false,
 schedule_hours integer not null check(schedule_hours between 24 and 720),
 max_rows integer not null check(max_rows between 1 and 500), monthly_row_cap integer not null check(monthly_row_cap between 1 and 10000 and monthly_row_cap>=max_rows),
 config jsonb not null default '{}' check(jsonb_typeof(config)='object' and octet_length(config::text)<=8192),
 updated_at timestamptz not null default now(), updated_by text not null,
 unique(workspace_id,id), check(status<>'approved' or (length(trim(permission_reference))>0 and (synthetic or rights_expires_at is not null)))
);
create table public.automation_rule_versions (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
 rule_id text not null check(length(rule_id) between 1 and 100), revision integer not null check(revision>0),
 purpose text not null check(purpose in ('seller_research','buyer_fit')), status text not null check(status in ('draft','published','retired')),
 rule jsonb not null check(jsonb_typeof(rule)='object' and octet_length(rule::text)<=262144),
 created_at timestamptz not null default now(), created_by text not null,
 unique(workspace_id,rule_id,revision), unique(workspace_id,id)
);
create unique index automation_active_rule on public.automation_rule_versions(workspace_id,purpose) where status='published';
create table public.automation_jobs (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
 source_id uuid not null, source_revision integer not null, kind text not null check(kind in ('ingest','refresh')),
 status text not null default 'queued' check(status in ('queued','leased','retry_wait','completed','held','dead_letter')),
 request_key text not null check(length(request_key) between 1 and 200), input jsonb not null default '{}', input_hash text not null,
 attempts integer not null default 0 check(attempts between 0 and 3), lease_token uuid, lease_expires_at timestamptz,
 next_attempt_at timestamptz not null default now(), reserved_rows integer not null default 0 check(reserved_rows>=0),
 budget_month date, record_count integer not null default 0 check(record_count>=0), error_code text,
 created_at timestamptz not null default now(), completed_at timestamptz, created_by text not null,
 unique(workspace_id,source_id,source_revision,request_key), unique(workspace_id,id),
 foreign key(workspace_id,source_id) references public.automation_sources(workspace_id,id),
 check(jsonb_typeof(input)='object' and octet_length(input::text)<=1500000)
);
create index automation_claimable on public.automation_jobs(status,next_attempt_at,created_at);
create index automation_source_budget on public.automation_jobs(source_id,budget_month,status);
create table public.automation_records (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id), source_id uuid not null,
 record_key text not null check(length(record_key) between 1 and 200), content_hash text not null check(content_hash ~ '^[0-9a-f]{64}$'),
 lead jsonb not null check(jsonb_typeof(lead)='object' and octet_length(lead::text)<=16384),
 last_run_id uuid not null, updated_at timestamptz not null default now(),
 unique(workspace_id,source_id,record_key), unique(workspace_id,id),
 foreign key(workspace_id,source_id) references public.automation_sources(workspace_id,id),
 foreign key(workspace_id,last_run_id) references public.automation_jobs(workspace_id,id)
);
create index automation_record_workspace on public.automation_records(workspace_id,updated_at desc);
create table public.automation_decisions (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id), rule_version_id uuid, job_id uuid,
 results jsonb not null check(jsonb_typeof(results)='array' and jsonb_array_length(results)<=1000 and octet_length(results::text)<=12000000),
 created_at timestamptz not null default now(), created_by text not null,
 foreign key(workspace_id,rule_version_id) references public.automation_rule_versions(workspace_id,id),
 foreign key(workspace_id,job_id) references public.automation_jobs(workspace_id,id), unique(job_id)
);
create index automation_decision_workspace on public.automation_decisions(workspace_id,created_at desc);
create table public.automation_audit (
 id bigint generated always as identity primary key, workspace_id uuid not null references public.workspaces(id), actor_id text not null,
 action text not null, entity_id uuid, details jsonb not null default '{}', created_at timestamptz not null default now()
);
create index automation_audit_workspace on public.automation_audit(workspace_id,created_at);
do $$ declare tab text; begin
 foreach tab in array array['automation_sources','automation_rule_versions','automation_jobs','automation_records','automation_decisions','automation_audit'] loop
  execute format('alter table public.%I enable row level security',tab);
  execute format('revoke all on public.%I from public,anon,authenticated,service_role',tab);
  execute format('create policy workspace_read on public.%I for select to authenticated using(sangam_private.member_of(workspace_id))',tab);
 end loop;
end $$;

create function sangam_private.automation_member(p_workspace uuid,p_actor text,p_review boolean default false) returns text
language plpgsql security definer set search_path=pg_catalog as $$
declare member_role text; begin
 select role into member_role from public.workspace_members where workspace_id=p_workspace and user_id=p_actor and active for share;
 if member_role is null or (p_review and member_role not in ('admin','reviewer')) then raise exception 'workspace access denied' using errcode='42501'; end if;
 return member_role;
end $$;
create function sangam_private.automation_source_json(s public.automation_sources) returns jsonb language sql immutable set search_path=pg_catalog as $$
 select jsonb_build_object('id',s.id,'workspaceId',s.workspace_id,'revision',s.revision,'name',s.name,'kind',s.kind,'status',s.status,'permissionReference',s.permission_reference,'rightsExpiresAt',s.rights_expires_at,'synthetic',s.synthetic,'enabled',s.enabled,'scheduleHours',s.schedule_hours,'maxRows',s.max_rows,'monthlyRowCap',s.monthly_row_cap,'config',s.config,'updatedAt',s.updated_at,'updatedBy',s.updated_by);
$$;
create function sangam_private.automation_rule_json(r public.automation_rule_versions) returns jsonb language sql immutable set search_path=pg_catalog as $$
 select jsonb_build_object('id',r.id,'workspaceId',r.workspace_id,'ruleId',r.rule_id,'revision',r.revision,'purpose',r.purpose,'status',r.status,'rule',r.rule,'createdAt',r.created_at,'createdBy',r.created_by);
$$;
create function sangam_private.automation_job_json(j public.automation_jobs) returns jsonb language sql immutable set search_path=pg_catalog as $$
 select jsonb_build_object('id',j.id,'workspaceId',j.workspace_id,'sourceId',j.source_id,'sourceRevision',j.source_revision,'kind',j.kind,'status',j.status,'requestKey',j.request_key,'attempts',j.attempts,'recordCount',j.record_count,'errorCode',j.error_code,'createdAt',j.created_at,'completedAt',j.completed_at,'nextAttemptAt',j.next_attempt_at,'leaseExpiresAt',j.lease_expires_at);
$$;
create function sangam_private.automation_record_json(r public.automation_records) returns jsonb language sql immutable set search_path=pg_catalog as $$
 select jsonb_build_object('id',r.id,'workspaceId',r.workspace_id,'sourceId',r.source_id,'recordKey',r.record_key,'contentHash',r.content_hash,'lead',r.lead,'lastRunId',r.last_run_id,'updatedAt',r.updated_at);
$$;
create function sangam_private.automation_decision_json(d public.automation_decisions) returns jsonb language sql immutable set search_path=pg_catalog as $$
 select jsonb_build_object('id',d.id,'workspaceId',d.workspace_id,'ruleVersionId',d.rule_version_id,'jobId',d.job_id,'results',d.results,'createdAt',d.created_at);
$$;
create function sangam_private.automation_source_time(value text) returns timestamptz language sql immutable set search_path=pg_catalog as $$
 select case when value ~ '^\d{4}-\d{2}-\d{2}$' then value::timestamp at time zone 'UTC' else value::timestamptz end;
$$;
create function sangam_private.automation_source_ready(s public.automation_sources) returns boolean
language plpgsql security definer set search_path=pg_catalog as $$
declare st jsonb; begin
 if s.status<>'approved' or (s.rights_expires_at is not null and s.rights_expires_at<=now()) or (not s.synthetic and s.rights_expires_at is null) then return false; end if;
 if s.synthetic then return true; end if;
 select state into st from public.acquisition_states where workspace_id=s.workspace_id for share;
 return exists(select 1 from jsonb_array_elements(coalesce(st->'gates','[]')) g where g->>'name'='data_provenance' and g->>'status'='approved' and (g->>'reviewedAt')::timestamptz<=now() and ((g->>'expiresAt') is null or (g->>'expiresAt')::timestamptz>now()));
end $$;
create function sangam_private.automation_load(p_workspace uuid,p_actor text,p_offset integer default 0) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$ begin
 perform sangam_private.automation_member(p_workspace,p_actor);
 if p_offset<0 or p_offset>5000 then raise exception 'invalid record page' using errcode='22023'; end if;
 return jsonb_build_object(
 'sources',(select coalesce(jsonb_agg(sangam_private.automation_source_json(s) order by s.updated_at desc),'[]') from public.automation_sources s where workspace_id=p_workspace),
 'rules',(select coalesce(jsonb_agg(sangam_private.automation_rule_json(r) order by r.created_at desc),'[]') from public.automation_rule_versions r where workspace_id=p_workspace),
 'jobs',(select coalesce(jsonb_agg(sangam_private.automation_job_json(j) order by j.created_at desc),'[]') from (select * from public.automation_jobs where workspace_id=p_workspace order by created_at desc limit 50) j),
 'records',(select coalesce(jsonb_agg(sangam_private.automation_record_json(r) order by r.updated_at desc,r.id),'[]') from (select * from public.automation_records where workspace_id=p_workspace order by updated_at desc,id limit 250 offset p_offset) r),
 'recordCount',(select count(*) from public.automation_records where workspace_id=p_workspace),'recordLimit',250,'recordOffset',p_offset,
 'decisions',(select coalesce(jsonb_agg(sangam_private.automation_decision_json(d) order by d.created_at desc),'[]') from (select * from public.automation_decisions where workspace_id=p_workspace order by created_at desc limit 2) d));
end $$;
create function sangam_private.automation_save_source(p_workspace uuid,p_actor text,p_expected integer,p_source jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare s public.automation_sources; old public.automation_sources; v_source_id uuid; begin
 perform sangam_private.automation_member(p_workspace,p_actor,true);
 perform 1 from public.workspaces where id=p_workspace for update;
 v_source_id:=coalesce(nullif(p_source->>'id','')::uuid,gen_random_uuid());
 if exists(select 1 from public.automation_sources where id=v_source_id and workspace_id<>p_workspace) then raise exception 'workspace source not found' using errcode='42501'; end if;
 select * into old from public.automation_sources where id=v_source_id and workspace_id=p_workspace for update;
 if p_expected is null or p_expected<0 or coalesce(old.revision,0)<>p_expected then raise exception 'source revision conflict' using errcode='40001'; end if;
 if p_expected=0 and (select count(*) from public.automation_sources where workspace_id=p_workspace)>=20 then raise exception 'source capacity exceeded' using errcode='22023'; end if;
 if old.id is not null and old.synthetic is distinct from (p_source->>'synthetic')::boolean then raise exception 'source practice mode is immutable' using errcode='22023'; end if;
 s.id:=v_source_id; s.workspace_id:=p_workspace; s.revision:=p_expected+1; s.name:=p_source->>'name'; s.kind:=p_source->>'kind'; s.status:=p_source->>'status';
 s.permission_reference:=coalesce(p_source->>'permissionReference',''); s.rights_expires_at:=nullif(p_source->>'rightsExpiresAt','')::timestamptz;
 s.synthetic:=(p_source->>'synthetic')::boolean; s.enabled:=(p_source->>'enabled')::boolean; s.schedule_hours:=(p_source->>'scheduleHours')::integer;
 s.max_rows:=(p_source->>'maxRows')::integer; s.monthly_row_cap:=(p_source->>'monthlyRowCap')::integer; s.config:=coalesce(p_source->'config','{}'); s.updated_at:=now(); s.updated_by:=p_actor;
 if s.status='approved' and not sangam_private.automation_source_ready(s) then raise exception 'current data permission evidence required'; end if;
 if s.enabled and s.status<>'approved' then raise exception 'only an approved source may be scheduled' using errcode='22023'; end if;
 insert into public.automation_sources select (s).* on conflict(id) do update set revision=excluded.revision,name=excluded.name,kind=excluded.kind,status=excluded.status,permission_reference=excluded.permission_reference,rights_expires_at=excluded.rights_expires_at,synthetic=excluded.synthetic,enabled=excluded.enabled,schedule_hours=excluded.schedule_hours,max_rows=excluded.max_rows,monthly_row_cap=excluded.monthly_row_cap,config=excluded.config,updated_at=excluded.updated_at,updated_by=excluded.updated_by where public.automation_sources.workspace_id=excluded.workspace_id returning * into s;
 if not found then raise exception 'workspace source not found' using errcode='42501'; end if;
 update public.automation_jobs set status='held',error_code='source_changed',lease_token=null,lease_expires_at=null,reserved_rows=0,input='{}' where source_id=s.id and status in ('queued','leased','retry_wait');
 insert into public.automation_audit(workspace_id,actor_id,action,entity_id,details) values(p_workspace,p_actor,'source.saved',s.id,jsonb_build_object('revision',s.revision,'status',s.status));
 return sangam_private.automation_source_json(s);
end $$;
create function sangam_private.automation_save_rule(p_workspace uuid,p_actor text,p_rule jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare r public.automation_rule_versions; begin
 perform sangam_private.automation_member(p_workspace,p_actor,true); perform 1 from public.workspaces where id=p_workspace for update;
 if (select count(*) from public.automation_rule_versions where workspace_id=p_workspace)>=100 then raise exception 'rule version capacity exceeded' using errcode='22023'; end if;
 if p_rule->'rule'->>'workspaceId' is distinct from p_workspace::text or p_rule->'rule'->>'id' is distinct from p_rule->>'ruleId' or p_rule->'rule'->>'revision' is distinct from p_rule->>'revision' or p_rule->'rule'->>'purpose' is distinct from p_rule->>'purpose' or p_rule->>'status' not in ('draft','published') then raise exception 'invalid workspace rule' using errcode='22023'; end if;
 if (p_rule->>'revision')::integer<>coalesce((select max(revision) from public.automation_rule_versions where workspace_id=p_workspace and rule_id=p_rule->>'ruleId'),0)+1 then raise exception 'rule revision conflict' using errcode='40001'; end if;
 if p_rule->>'status'='published' then update public.automation_rule_versions set status='retired' where workspace_id=p_workspace and purpose=p_rule->>'purpose' and status='published'; end if;
 insert into public.automation_rule_versions(workspace_id,rule_id,revision,purpose,status,rule,created_by) values(p_workspace,p_rule->>'ruleId',(p_rule->>'revision')::integer,p_rule->>'purpose',p_rule->>'status',p_rule->'rule',p_actor) returning * into r;
 insert into public.automation_audit(workspace_id,actor_id,action,entity_id) values(p_workspace,p_actor,'rule.created',r.id);
 return sangam_private.automation_rule_json(r);
end $$;
create function sangam_private.automation_publish_rule(p_workspace uuid,p_actor text,p_rule_version uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare r public.automation_rule_versions; begin
 perform sangam_private.automation_member(p_workspace,p_actor,true); perform 1 from public.workspaces where id=p_workspace for update;
 select * into r from public.automation_rule_versions where id=p_rule_version and workspace_id=p_workspace for update;
 if r.id is null then raise exception 'workspace rule not found' using errcode='42501'; end if;
 update public.automation_rule_versions set status='retired' where workspace_id=p_workspace and purpose=r.purpose and status='published' and id<>r.id;
 update public.automation_rule_versions set status='published' where id=r.id returning * into r;
 insert into public.automation_audit(workspace_id,actor_id,action,entity_id) values(p_workspace,p_actor,'rule.published',r.id);
 return sangam_private.automation_rule_json(r);
end $$;
create function sangam_private.automation_enqueue_internal(p_workspace uuid,p_actor text,p_source uuid,p_key text,p_input jsonb,p_kind text) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare s public.automation_sources; j public.automation_jobs; begin
 select * into s from public.automation_sources where id=p_source and workspace_id=p_workspace for update;
 if s.id is null then raise exception 'workspace source not found' using errcode='42501'; end if;
 if not sangam_private.automation_source_ready(s) then raise exception 'source approval unavailable'; end if;
 if p_kind='ingest' and (length(coalesce(p_input->>'csv',''))=0 or (p_input->>'sourceDate') is null or sangam_private.automation_source_time(p_input->>'sourceDate')>now()) then raise exception 'CSV and actual source date required' using errcode='22023'; end if;
 if p_kind='refresh' and (p_input<>'{}'::jsonb or not exists(select 1 from public.automation_records where source_id=s.id)) then raise exception 'refresh needs stored records and no new input' using errcode='22023'; end if;
 select * into j from public.automation_jobs where workspace_id=p_workspace and source_id=s.id and source_revision=s.revision and request_key=p_key;
 if j.id is not null then
  if j.kind<>p_kind or j.input_hash<>encode(sha256(convert_to(p_input::text,'UTF8')),'hex') then raise exception 'request key reused with different input' using errcode='22023'; end if;
  return sangam_private.automation_job_json(j);
 end if;
 if (select count(*) from public.automation_jobs where source_id=s.id and status in ('queued','leased','retry_wait'))>=3 then raise exception 'source already has pending work'; end if;
 insert into public.automation_jobs(workspace_id,source_id,source_revision,kind,request_key,input,input_hash,created_by) values(p_workspace,s.id,s.revision,p_kind,p_key,p_input,encode(sha256(convert_to(p_input::text,'UTF8')),'hex'),p_actor) returning * into j;
 insert into public.automation_audit(workspace_id,actor_id,action,entity_id) values(p_workspace,p_actor,'job.queued',j.id);
 return sangam_private.automation_job_json(j);
end $$;
create function sangam_private.automation_enqueue(p_workspace uuid,p_actor text,p_source uuid,p_key text,p_input jsonb,p_kind text) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$ begin
 perform sangam_private.automation_member(p_workspace,p_actor); return sangam_private.automation_enqueue_internal(p_workspace,p_actor,p_source,p_key,p_input,p_kind);
end $$;
create function sangam_private.automation_enqueue_due() returns integer
language plpgsql security definer set search_path=pg_catalog as $$
declare s public.automation_sources; n integer:=0; window_key text; begin
 for s in select src.* from public.automation_sources src where src.status='approved' and src.enabled and sangam_private.automation_source_ready(src) and exists(select 1 from public.automation_records where source_id=src.id) and not exists(select 1 from public.automation_jobs where source_id=src.id and (status in ('queued','leased','retry_wait') or (source_revision=src.revision and request_key='scheduled:'||floor(extract(epoch from now())/(src.schedule_hours*3600))::text))) order by src.updated_at limit 50 for update skip locked loop
  if sangam_private.automation_source_ready(s) and exists(select 1 from public.automation_records where source_id=s.id) and not exists(select 1 from public.automation_jobs where source_id=s.id and status in ('queued','leased','retry_wait')) then
   window_key:='scheduled:'||floor(extract(epoch from now())/(s.schedule_hours*3600))::text;
   if not exists(select 1 from public.automation_jobs where source_id=s.id and source_revision=s.revision and request_key=window_key) then
    perform sangam_private.automation_enqueue_internal(s.workspace_id,'system:scheduler',s.id,window_key,'{}','refresh'); n:=n+1;
   end if;
  end if;
 end loop;
 return n;
end $$;
create function sangam_private.automation_claim(p_run uuid default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare s public.automation_sources; j public.automation_jobs; candidate record; reserved integer; used_rows integer; st jsonb; st_version bigint; begin
 -- Lock source before job consistently; SKIP LOCKED permits independent workers.
 for candidate in select id,source_id from public.automation_jobs where (p_run is null or id=p_run) and ((status in ('queued','retry_wait') and next_attempt_at<=now()) or (status='leased' and lease_expires_at<now())) order by created_at limit 20 loop
  select * into s from public.automation_sources where id=candidate.source_id for update skip locked;
  if s.id is null then continue; end if;
  select * into j from public.automation_jobs where id=candidate.id and ((status in ('queued','retry_wait') and next_attempt_at<=now()) or (status='leased' and lease_expires_at<now())) for update skip locked;
  if j.id is null then continue; end if;
  if j.attempts>=3 then update public.automation_jobs set status='dead_letter',error_code='lease_attempts_exhausted',reserved_rows=0,lease_token=null,input='{}' where id=j.id; continue; end if;
  if s.revision<>j.source_revision or not sangam_private.automation_source_ready(s) or (j.created_by='system:scheduler' and not s.enabled) then
   update public.automation_jobs set status='held',error_code='source_unavailable',reserved_rows=0,lease_token=null,input='{}' where id=j.id; continue;
  end if;
  reserved:=case when j.kind='refresh' then (select count(*) from public.automation_records where source_id=s.id) else s.max_rows end;
  select coalesce(sum(case when status='completed' then record_count else reserved_rows end),0) into used_rows from public.automation_jobs where source_id=s.id and id<>j.id and budget_month=date_trunc('month',now() at time zone 'UTC')::date and status in ('completed','leased');
  if used_rows+reserved>s.monthly_row_cap then update public.automation_jobs set status='held',error_code='monthly_row_cap',reserved_rows=0,lease_token=null,input='{}' where id=j.id; continue; end if;
  update public.automation_jobs set status='leased',attempts=attempts+1,lease_token=gen_random_uuid(),lease_expires_at=now()+interval '120 seconds',reserved_rows=reserved,budget_month=date_trunc('month',now() at time zone 'UTC')::date,error_code=null where id=j.id returning * into j;
  select state,version into st,st_version from public.acquisition_states where workspace_id=j.workspace_id for share;
  return sangam_private.automation_job_json(j)||jsonb_build_object('leaseToken',j.lease_token,'source',sangam_private.automation_source_json(s),'input',j.input,'acquisitionState',st,'acquisitionVersion',coalesce(st_version,0),'records',(select coalesce(jsonb_agg(sangam_private.automation_record_json(r)),'[]') from public.automation_records r where source_id=s.id),'rules',(select coalesce(jsonb_agg(sangam_private.automation_rule_json(r)),'[]') from public.automation_rule_versions r where workspace_id=s.workspace_id and status='published'));
 end loop;
 return null;
end $$;
create function sangam_private.automation_finish(p_run uuid,p_token uuid,p_records jsonb,p_decisions jsonb,p_acquisition_version bigint) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare s public.automation_sources; j public.automation_jobs; row_value jsonb; st_version bigint; total integer; begin
 perform 1 from public.workspaces where id=(select workspace_id from public.automation_jobs where id=p_run) for update;
 select s0.* into s from public.automation_sources s0 join public.automation_jobs j0 on j0.source_id=s0.id where j0.id=p_run for update of s0;
 select * into j from public.automation_jobs where id=p_run for update;
 if j.id is null or j.status<>'leased' or j.lease_token is distinct from p_token or j.lease_expires_at<=now() then raise exception 'job lease unavailable' using errcode='40001'; end if;
 if s.revision<>j.source_revision or not sangam_private.automation_source_ready(s) then raise exception 'source approval unavailable'; end if;
 select version into st_version from public.acquisition_states where workspace_id=j.workspace_id for share;
 if coalesce(st_version,0)<>p_acquisition_version then raise exception 'acquisition version conflict' using errcode='40001'; end if;
 if jsonb_typeof(p_records) is distinct from 'array' or jsonb_typeof(p_decisions) is distinct from 'array' or jsonb_array_length(p_records)>500 or (j.kind='ingest' and jsonb_array_length(p_records)>s.max_rows) then raise exception 'invalid records' using errcode='22023'; end if;
 if j.kind='refresh' and jsonb_array_length(p_records)<>(select count(*) from public.automation_records where source_id=s.id) then raise exception 'refresh must cover retained records' using errcode='22023'; end if;
 if (select count(distinct r->>'recordKey') from jsonb_array_elements(p_records) r)<>jsonb_array_length(p_records) then raise exception 'duplicate source record' using errcode='22023'; end if;
 select count(*) into total from public.automation_records where source_id=s.id and record_key not in (select r->>'recordKey' from jsonb_array_elements(p_records) r);
 if total+jsonb_array_length(p_records)>500 then raise exception 'source retained record capacity exceeded' using errcode='22023'; end if;
 select count(*) into total from public.automation_records where workspace_id=s.workspace_id and not(source_id=s.id and record_key in (select r->>'recordKey' from jsonb_array_elements(p_records) r));
 if total+jsonb_array_length(p_records)>5000 then raise exception 'workspace retained record capacity exceeded' using errcode='22023'; end if;
 for row_value in select * from jsonb_array_elements(p_records) loop
  if (row_value->'lead'->>'synthetic')::boolean is distinct from s.synthetic or row_value->'lead'->>'permissionReference' is distinct from s.permission_reference then raise exception 'source record provenance mismatch' using errcode='22023'; end if;
  if j.kind='refresh' and not exists(select 1 from public.automation_records where source_id=s.id and record_key=row_value->>'recordKey' and lead=row_value->'lead' and content_hash=row_value->>'contentHash') then raise exception 'refresh cannot rewrite observed facts' using errcode='22023'; end if;
  if exists(select 1 from public.automation_records where source_id=s.id and record_key=row_value->>'recordKey' and (id is distinct from (row_value->>'id')::uuid or lead->>'id' is distinct from row_value->'lead'->>'id' or sangam_private.automation_source_time(lead->>'sourceDate')>sangam_private.automation_source_time(row_value->'lead'->>'sourceDate'))) then raise exception 'source record identity or observation regressed' using errcode='22023'; end if;
  insert into public.automation_records(id,workspace_id,source_id,record_key,content_hash,lead,last_run_id) values((row_value->>'id')::uuid,j.workspace_id,s.id,row_value->>'recordKey',row_value->>'contentHash',row_value->'lead',j.id)
  on conflict(workspace_id,source_id,record_key) do update set content_hash=excluded.content_hash,lead=excluded.lead,last_run_id=excluded.last_run_id,updated_at=now();
 end loop;
 for row_value in select * from jsonb_array_elements(p_decisions) loop
  if row_value->>'sourceId' is distinct from s.id::text or (row_value->>'sourceRevision')::integer is distinct from s.revision then raise exception 'decision source mismatch' using errcode='22023'; end if;
  perform 1 from public.automation_rule_versions where workspace_id=s.workspace_id and status='published' and rule_id=row_value->'evaluation'->>'ruleId' and revision=(row_value->'evaluation'->>'revision')::integer for share;
  if not found then raise exception 'published rule changed' using errcode='40001'; end if;
 end loop;
 insert into public.automation_decisions(workspace_id,job_id,results,created_by) values(j.workspace_id,j.id,p_decisions,'system:worker');
 update public.automation_jobs set status='completed',record_count=jsonb_array_length(p_records),reserved_rows=0,completed_at=now(),lease_token=null,lease_expires_at=null,input='{}' where id=j.id returning * into j;
 insert into public.automation_audit(workspace_id,actor_id,action,entity_id,details) values(j.workspace_id,'system:worker','job.completed',j.id,jsonb_build_object('records',j.record_count,'kind',j.kind));
 return sangam_private.automation_job_json(j);
end $$;
create function sangam_private.automation_fail(p_run uuid,p_token uuid,p_code text,p_retryable boolean) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare j public.automation_jobs; begin
 select * into j from public.automation_jobs where id=p_run for update;
 if j.id is null or j.status<>'leased' or j.lease_token is distinct from p_token or j.lease_expires_at<=now() then raise exception 'job lease unavailable' using errcode='40001'; end if;
 if p_code !~ '^[A-Za-z0-9_]{1,80}$' then raise exception 'safe error code required' using errcode='22023'; end if;
 update public.automation_jobs set status=case when p_retryable and attempts<3 then 'retry_wait' when p_retryable then 'dead_letter' else 'held' end,error_code=p_code,reserved_rows=0,lease_token=null,lease_expires_at=null,next_attempt_at=now()+make_interval(secs=>30*attempts*attempts),input=case when p_retryable and attempts<3 then input else '{}'::jsonb end where id=j.id returning * into j;
 insert into public.automation_audit(workspace_id,actor_id,action,entity_id,details) values(j.workspace_id,'system:worker','job.failed',j.id,jsonb_build_object('code',p_code,'status',j.status));
 return sangam_private.automation_job_json(j);
end $$;
create function sangam_private.automation_save_decisions(p_workspace uuid,p_actor text,p_rule_version uuid,p_results jsonb,p_acquisition_version bigint) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare r public.automation_rule_versions; s public.automation_sources; d public.automation_decisions; row_value jsonb; st_version bigint; st jsonb; legacy_lead jsonb; begin
 perform sangam_private.automation_member(p_workspace,p_actor);
 select * into r from public.automation_rule_versions where id=p_rule_version and workspace_id=p_workspace and status='published' for share;
 if r.id is null then raise exception 'workspace rule not found' using errcode='42501'; end if;
 if jsonb_typeof(p_results) is distinct from 'array' then raise exception 'decision array required' using errcode='22023'; end if;
 for s in select s0.* from public.automation_sources s0 where s0.workspace_id=p_workspace and s0.id in (select distinct (v->>'sourceId')::uuid from jsonb_array_elements(p_results) v where v->>'sourceId' ~ '^[0-9a-f-]{36}$') order by s0.id for share loop
  if exists(select 1 from jsonb_array_elements(p_results) v where v->>'sourceId'=s.id::text and v->'evaluation'->>'decision'='eligible') and not sangam_private.automation_source_ready(s) then raise exception 'source approval unavailable'; end if;
 end loop;
 select state,version into st,st_version from public.acquisition_states where workspace_id=p_workspace for share;
 if coalesce(st_version,0)<>p_acquisition_version then raise exception 'acquisition version conflict' using errcode='40001'; end if;
 for row_value in select * from jsonb_array_elements(p_results) loop
  if row_value->>'sourceId' ~ '^manual-[0-9a-f-]{36}$' then
   select v into legacy_lead from jsonb_array_elements(coalesce(st->'leads','[]')) v where 'manual-'||(v->>'id')=row_value->>'sourceId' and v->>'id'=row_value->>'leadId' and v->>'automationSourceId' is null;
   if legacy_lead is null then raise exception 'manual decision lead unavailable' using errcode='42501'; end if;
   if row_value->'evaluation'->>'decision'='eligible' and (length(coalesce(legacy_lead->>'permissionReference',''))=0 or legacy_lead->>'sourceDate' is null or (not coalesce((legacy_lead->>'synthetic')::boolean,false) and not exists(select 1 from jsonb_array_elements(coalesce(st->'gates','[]')) g where g->>'name'='data_provenance' and g->>'status'='approved' and (g->>'reviewedAt')::timestamptz<=now() and (g->>'expiresAt' is null or (g->>'expiresAt')::timestamptz>now())))) then raise exception 'manual source permission unavailable'; end if;
  elsif row_value->>'sourceId' ~ '^[0-9a-f-]{36}$' then
   if not exists(select 1 from public.automation_sources where workspace_id=p_workspace and id=(row_value->>'sourceId')::uuid and revision=(row_value->>'sourceRevision')::integer) then raise exception 'source revision conflict' using errcode='40001'; end if;
  else raise exception 'decision source identity required' using errcode='22023';
  end if;
  if row_value->'evaluation'->>'ruleId' is distinct from r.rule_id or (row_value->'evaluation'->>'revision')::integer is distinct from r.revision then raise exception 'decision rule mismatch' using errcode='22023'; end if;
 end loop;
 insert into public.automation_decisions(workspace_id,rule_version_id,results,created_by) values(p_workspace,r.id,p_results,p_actor) returning * into d;
 insert into public.automation_audit(workspace_id,actor_id,action,entity_id) values(p_workspace,p_actor,'decisions.saved',d.id);
 return sangam_private.automation_decision_json(d);
end $$;
create function sangam_private.automation_promote_record(p_workspace uuid,p_actor text,p_record uuid,p_expected bigint,p_state jsonb,p_audit jsonb,p_record_hash text,p_source_revision integer,p_rule_version uuid) returns bigint
language plpgsql security definer set search_path=pg_catalog as $$
declare s public.automation_sources; r public.automation_records; begin
 perform sangam_private.automation_member(p_workspace,p_actor);
 select * into r from public.automation_records where id=p_record and workspace_id=p_workspace;
 if r.id is null then raise exception 'workspace record not found' using errcode='42501'; end if;
 select * into s from public.automation_sources where id=r.source_id and workspace_id=p_workspace for share;
 select * into r from public.automation_records where id=p_record and workspace_id=p_workspace for share;
 if r.content_hash is distinct from p_record_hash or s.revision is distinct from p_source_revision then raise exception 'source record changed' using errcode='40001'; end if;
 if not sangam_private.automation_source_ready(s) or r.lead->>'permissionReference' is distinct from s.permission_reference then raise exception 'source approval unavailable'; end if;
 perform 1 from public.automation_rule_versions where id=p_rule_version and workspace_id=p_workspace and purpose='seller_research' and status='published' for share;
 if not found then raise exception 'published rule changed' using errcode='40001'; end if;
 if p_audit->>'action'<>'import_leads' then raise exception 'source promotion only' using errcode='22023'; end if;
 return sangam_private.acquisition_save(p_workspace,p_actor,p_expected,p_state,p_audit);
end $$;

create function sangam_private.automation_load_record(p_workspace uuid,p_actor text,p_record uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare r public.automation_records; begin
 perform sangam_private.automation_member(p_workspace,p_actor);
 select * into r from public.automation_records where workspace_id=p_workspace and id=p_record;
 if r.id is null then return null; end if;
 return sangam_private.automation_record_json(r);
end $$;
create function sangam_private.automation_commit_acquisition(p_workspace uuid,p_actor text,p_expected bigint,p_state jsonb,p_audit jsonb,p_source_revisions jsonb) returns bigint
language plpgsql security definer set search_path=pg_catalog as $$
declare s public.automation_sources; scope jsonb; begin
 perform sangam_private.automation_member(p_workspace,p_actor);
 if jsonb_typeof(p_source_revisions) is distinct from 'array' or jsonb_array_length(p_source_revisions)>20 then raise exception 'source scope required' using errcode='22023'; end if;
 for scope in select value from jsonb_array_elements(p_source_revisions) order by value->>'id' loop
  select * into s from public.automation_sources where id=(scope->>'id')::uuid and workspace_id=p_workspace for share;
  if s.id is null then raise exception 'workspace source not found' using errcode='42501'; end if;
  if s.revision is distinct from (scope->>'revision')::integer or s.permission_reference is distinct from scope->>'permissionReference' then raise exception 'source revision conflict' using errcode='40001'; end if;
  if not sangam_private.automation_source_ready(s) then raise exception 'source approval unavailable'; end if;
 end loop;
 return sangam_private.acquisition_save(p_workspace,p_actor,p_expected,p_state,p_audit);
end $$;
-- Explicit server-only invoker wrappers. Internal helpers have no API grants.
create function public.automation_load(p_workspace uuid,p_actor text,p_offset integer default 0) returns jsonb language sql security invoker set search_path=pg_catalog as $$select sangam_private.automation_load(p_workspace,p_actor,p_offset)$$;
create function public.automation_save_source(p_workspace uuid,p_actor text,p_expected integer,p_source jsonb) returns jsonb language sql security invoker set search_path=pg_catalog as $$select sangam_private.automation_save_source(p_workspace,p_actor,p_expected,p_source)$$;
create function public.automation_save_rule(p_workspace uuid,p_actor text,p_rule jsonb) returns jsonb language sql security invoker set search_path=pg_catalog as $$select sangam_private.automation_save_rule(p_workspace,p_actor,p_rule)$$;
create function public.automation_publish_rule(p_workspace uuid,p_actor text,p_rule_version uuid) returns jsonb language sql security invoker set search_path=pg_catalog as $$select sangam_private.automation_publish_rule(p_workspace,p_actor,p_rule_version)$$;
create function public.automation_enqueue(p_workspace uuid,p_actor text,p_source uuid,p_key text,p_input jsonb,p_kind text) returns jsonb language sql security invoker set search_path=pg_catalog as $$select sangam_private.automation_enqueue(p_workspace,p_actor,p_source,p_key,p_input,p_kind)$$;
create function public.automation_enqueue_due() returns integer language sql security invoker set search_path=pg_catalog as $$select sangam_private.automation_enqueue_due()$$;
create function public.automation_claim(p_run uuid default null) returns jsonb language sql security invoker set search_path=pg_catalog as $$select sangam_private.automation_claim(p_run)$$;
create function public.automation_finish(p_run uuid,p_token uuid,p_records jsonb,p_decisions jsonb,p_acquisition_version bigint) returns jsonb language sql security invoker set search_path=pg_catalog as $$select sangam_private.automation_finish(p_run,p_token,p_records,p_decisions,p_acquisition_version)$$;
create function public.automation_fail(p_run uuid,p_token uuid,p_code text,p_retryable boolean) returns jsonb language sql security invoker set search_path=pg_catalog as $$select sangam_private.automation_fail(p_run,p_token,p_code,p_retryable)$$;
create function public.automation_save_decisions(p_workspace uuid,p_actor text,p_rule_version uuid,p_results jsonb,p_acquisition_version bigint) returns jsonb language sql security invoker set search_path=pg_catalog as $$select sangam_private.automation_save_decisions(p_workspace,p_actor,p_rule_version,p_results,p_acquisition_version)$$;
create function public.automation_promote_record(p_workspace uuid,p_actor text,p_record uuid,p_expected bigint,p_state jsonb,p_audit jsonb,p_record_hash text,p_source_revision integer,p_rule_version uuid) returns bigint language sql security invoker set search_path=pg_catalog as $$select sangam_private.automation_promote_record(p_workspace,p_actor,p_record,p_expected,p_state,p_audit,p_record_hash,p_source_revision,p_rule_version)$$;
create function public.automation_load_record(p_workspace uuid,p_actor text,p_record uuid) returns jsonb language sql security invoker set search_path=pg_catalog as $$select sangam_private.automation_load_record(p_workspace,p_actor,p_record)$$;
create function public.automation_commit_acquisition(p_workspace uuid,p_actor text,p_expected bigint,p_state jsonb,p_audit jsonb,p_source_revisions jsonb) returns bigint language sql security invoker set search_path=pg_catalog as $$select sangam_private.automation_commit_acquisition(p_workspace,p_actor,p_expected,p_state,p_audit,p_source_revisions)$$;
do $$ declare f record; begin
 for f in select p.oid::regprocedure as signature,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','sangam_private') and p.proname like 'automation_%' loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
  if f.nspname='public' or split_part(f.signature::text,'(',1) in ('sangam_private.automation_load','sangam_private.automation_save_source','sangam_private.automation_save_rule','sangam_private.automation_publish_rule','sangam_private.automation_enqueue','sangam_private.automation_enqueue_due','sangam_private.automation_claim','sangam_private.automation_finish','sangam_private.automation_fail','sangam_private.automation_save_decisions','sangam_private.automation_promote_record','sangam_private.automation_load_record','sangam_private.automation_commit_acquisition') then execute format('grant execute on function %s to service_role',f.signature); end if;
 end loop;
end $$;
commit;
