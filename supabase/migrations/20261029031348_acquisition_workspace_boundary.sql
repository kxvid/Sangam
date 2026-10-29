-- Private manual Acquisition release. No existing record is assigned to a tenant.
-- Provision workspace + verified Clerk user memberships explicitly as a database
-- administrator after backing up. Clients cannot create memberships or gates.
begin;
create schema if not exists sangam_private;
revoke all on schema sangam_private from public, anon;
grant usage on schema sangam_private to authenticated, service_role;

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check(length(name) between 1 and 160),
  created_at timestamptz not null default now()
);
create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id),
  user_id text not null check(length(user_id) between 1 and 200),
  role text not null check(role in ('operator','reviewer','admin')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key(workspace_id,user_id)
);
create index workspace_members_user on public.workspace_members(user_id) where active;
create table public.acquisition_states (
  workspace_id uuid primary key references public.workspaces(id),
  version bigint not null check(version > 0),
  state jsonb not null check(jsonb_typeof(state)='object' and state->>'schemaVersion'='1'),
  updated_at timestamptz not null default now(),
  updated_by text not null,
  check(octet_length(state::text) <= 33554432)
);
create table public.acquisition_audit (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id),
  version bigint not null,
  actor_id text not null,
  actor_role text not null,
  action text not null,
  details jsonb not null default '{}'::jsonb check(jsonb_typeof(details)='object'),
  state_hash text not null,
  created_at timestamptz not null default now(),
  unique(workspace_id,version)
);
create index acquisition_audit_workspace on public.acquisition_audit(workspace_id,created_at);

-- Clerk 'sub' is an externally verified identity; roles are never trusted from JWT metadata.
create function sangam_private.member_of(target uuid) returns boolean
language sql stable security definer set search_path=pg_catalog
as $$
 select exists(select 1 from public.workspace_members
  where workspace_id=target and active
  and user_id=(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'));
$$;
revoke all on function sangam_private.member_of(uuid) from public,anon;
grant execute on function sangam_private.member_of(uuid) to authenticated;

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.acquisition_states enable row level security;
alter table public.acquisition_audit enable row level security;
revoke all on public.workspaces,public.workspace_members,public.acquisition_states,public.acquisition_audit from public,anon,authenticated,service_role;
grant select on public.workspaces,public.workspace_members,public.acquisition_states,public.acquisition_audit to authenticated;
create policy workspace_read on public.workspaces for select to authenticated using(sangam_private.member_of(id));
create policy own_membership_read on public.workspace_members for select to authenticated using(active and user_id=(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'));
create policy state_read on public.acquisition_states for select to authenticated using(sangam_private.member_of(workspace_id));
create policy audit_read on public.acquisition_audit for select to authenticated using(sangam_private.member_of(workspace_id));

-- Retain legacy rows but quarantine NULL workspace_id. No application can assign them.
alter table public.buyers add column workspace_id uuid references public.workspaces(id);
alter table public.wholesalers add column workspace_id uuid references public.workspaces(id);
alter table public.deals add column workspace_id uuid references public.workspaces(id);
alter table public.outreach add column workspace_id uuid references public.workspaces(id);
alter table public.discovery_runs add column workspace_id uuid references public.workspaces(id);
alter table public.buyers add constraint buyers_workspace_identity unique(workspace_id,id);
alter table public.wholesalers add constraint wholesalers_workspace_identity unique(workspace_id,id);
alter table public.deals add constraint deals_workspace_identity unique(workspace_id,id);
alter table public.deals add constraint deals_workspace_wholesaler foreign key(workspace_id,wholesaler_id) references public.wholesalers(workspace_id,id);
alter table public.outreach add constraint outreach_workspace_buyer foreign key(workspace_id,buyer_id) references public.buyers(workspace_id,id);
alter table public.outreach add constraint outreach_workspace_deal foreign key(workspace_id,deal_id) references public.deals(workspace_id,id);
drop index public.idx_buyers_phone;
drop index public.idx_buyers_email;
create unique index idx_buyers_workspace_phone on public.buyers(workspace_id,phone) where phone is not null;
create unique index idx_buyers_workspace_email on public.buyers(workspace_id,email) where email is not null;
do $$
declare tab text;
begin
 foreach tab in array array['buyers','wholesalers','deals','outreach','discovery_runs'] loop
  execute format('alter table public.%I enable row level security',tab);
  execute format('revoke all on public.%I from public,anon,authenticated,service_role',tab);
  execute format('grant select on public.%I to authenticated',tab);
  execute format('create index %I on public.%I(workspace_id)',tab||'_workspace',tab);
  execute format('create policy workspace_read on public.%I for select to authenticated using(sangam_private.member_of(workspace_id))',tab);
 end loop;
end $$;

create function sangam_private.workspace_context(p_workspace uuid,p_actor text) returns jsonb
language plpgsql security definer set search_path=pg_catalog
as $$
declare result jsonb;
begin
 select jsonb_build_object('id',w.id,'name',w.name,'role',m.role) into result
 from public.workspace_members m join public.workspaces w on w.id=m.workspace_id
 where m.workspace_id=p_workspace and m.user_id=p_actor and m.active;
 if result is null then raise exception 'workspace access denied' using errcode='42501'; end if;
 return result;
end $$;
create function sangam_private.actor_workspaces(p_actor text) returns jsonb
language sql stable security definer set search_path=pg_catalog
as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',w.id,'name',w.name,'role',m.role) order by w.name),'[]'::jsonb)
 from public.workspace_members m join public.workspaces w on w.id=m.workspace_id
 where m.user_id=p_actor and m.active;
$$;
create function sangam_private.acquisition_load(p_workspace uuid,p_actor text) returns jsonb
language plpgsql security definer set search_path=pg_catalog
as $$
declare result jsonb;
begin
 perform 1 from public.workspace_members where workspace_id=p_workspace and user_id=p_actor and active for share;
 if not found then raise exception 'workspace access denied' using errcode='42501'; end if;
 select jsonb_build_object('state',state,'version',version) into result
 from public.acquisition_states where workspace_id=p_workspace;
 return coalesce(result,jsonb_build_object('state',null,'version',0));
end $$;
create function sangam_private.acquisition_save(p_workspace uuid,p_actor text,p_expected bigint,p_state jsonb,p_audit jsonb) returns bigint
language plpgsql security definer set search_path=pg_catalog
as $$
declare actor_role text; new_version bigint; action_name text;
begin
 select role into actor_role from public.workspace_members where workspace_id=p_workspace and user_id=p_actor and active for share;
 if actor_role is null then raise exception 'workspace access denied' using errcode='42501'; end if;
 action_name := p_audit->>'action';
 if action_name is null or length(action_name) not between 1 and 100 then raise exception 'valid audit action required' using errcode='22023'; end if;
 if p_expected < 0 or p_expected is null or jsonb_typeof(p_state) is distinct from 'object' or p_state->>'schemaVersion' is distinct from '1' then
  raise exception 'invalid state/version' using errcode='22023';
 end if;
 if octet_length(p_state::text)>33554432 or octet_length(p_audit::text)>16384 then raise exception 'workspace document capacity exceeded' using errcode='22023'; end if;
 if action_name in ('set_gate','review_template','approve_batch','approve_packet') and actor_role not in ('reviewer','admin') then
  raise exception 'reviewer role required' using errcode='42501';
 end if;
 if p_expected=0 then
  insert into public.acquisition_states(workspace_id,version,state,updated_by)
  values(p_workspace,1,p_state,p_actor) on conflict(workspace_id) do nothing returning version into new_version;
 else
  update public.acquisition_states set version=version+1,state=p_state,updated_by=p_actor,updated_at=now()
  where workspace_id=p_workspace and version=p_expected returning version into new_version;
 end if;
 if new_version is null then raise exception 'state version conflict' using errcode='40001'; end if;
 insert into public.acquisition_audit(workspace_id,version,actor_id,actor_role,action,details,state_hash)
 values(p_workspace,new_version,p_actor,actor_role,action_name,coalesce(p_audit->'details','{}'::jsonb),encode(sha256(convert_to(p_state::text,'UTF8')),'hex'));
 return new_version;
end $$;

-- Exposed wrappers are invoker functions, callable only with the server secret.
create function public.workspace_context(p_workspace uuid,p_actor text) returns jsonb language sql security invoker set search_path=pg_catalog as $$ select sangam_private.workspace_context(p_workspace,p_actor); $$;
create function public.actor_workspaces(p_actor text) returns jsonb language sql security invoker set search_path=pg_catalog as $$ select sangam_private.actor_workspaces(p_actor); $$;
create function public.acquisition_load(p_workspace uuid,p_actor text) returns jsonb language sql security invoker set search_path=pg_catalog as $$ select sangam_private.acquisition_load(p_workspace,p_actor); $$;
create function public.acquisition_save(p_workspace uuid,p_actor text,p_expected bigint,p_state jsonb,p_audit jsonb) returns bigint language sql security invoker set search_path=pg_catalog as $$ select sangam_private.acquisition_save(p_workspace,p_actor,p_expected,p_state,p_audit); $$;
revoke all on function sangam_private.workspace_context(uuid,text),sangam_private.actor_workspaces(text),sangam_private.acquisition_load(uuid,text),sangam_private.acquisition_save(uuid,text,bigint,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.workspace_context(uuid,text),public.actor_workspaces(text),public.acquisition_load(uuid,text),public.acquisition_save(uuid,text,bigint,jsonb,jsonb) from public,anon,authenticated;
grant execute on function sangam_private.workspace_context(uuid,text),sangam_private.actor_workspaces(text),sangam_private.acquisition_load(uuid,text),sangam_private.acquisition_save(uuid,text,bigint,jsonb,jsonb) to service_role;
grant execute on function public.workspace_context(uuid,text),public.actor_workspaces(text),public.acquisition_load(uuid,text),public.acquisition_save(uuid,text,bigint,jsonb,jsonb) to service_role;
commit;
