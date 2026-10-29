// Read-only fingerprint SQL for an operator-controlled Sangam database snapshot.
// No database connection or credentials are loaded by this module.
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const TABLES = [
  'acquisition_audit', 'acquisition_states', 'automation_audit',
  'automation_decisions', 'automation_jobs', 'automation_records',
  'automation_rule_versions', 'automation_sources', 'buyers', 'deals',
  'discovery_runs', 'outreach', 'wholesalers', 'workspace_members', 'workspaces',
];

const fingerprints = TABLES.map(name => `
  select '${name}'::text as name, count(*)::text as rows,
    encode(sha256(convert_to(coalesce(string_agg(row_hash, '' order by row_hash), ''), 'UTF8')), 'hex') as content_hash
  from (select encode(sha256(convert_to(to_jsonb(t)::text, 'UTF8')), 'hex') as row_hash from public.${name} t) h
`).join(' union all ');

// Timestamps inside JSON must have one stable rendering in both snapshots.
// Call within the same read-only repeatable-read transaction as pg_export_snapshot.
export const MANIFEST_SQL = `
set timezone = 'UTC';
set datestyle = 'ISO, YMD';
set extra_float_digits = 3;
with recursive fingerprints as (${fingerprints}),
relations as (
  select c.oid, c.relname, c.relowner, c.relrowsecurity, c.relforcerowsecurity
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname in (${TABLES.map(n => `'${n}'`).join(',')}) and c.relkind='r'
), app_functions as (
  select p.*, n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','sangam_private') and
    (p.proname like 'automation_%' or p.proname in ('member_of','workspace_context','actor_workspaces','acquisition_load','acquisition_save'))
), relevant_roles as (
  select oid from pg_roles where rolname in ('anon','authenticated','service_role')
  union select relowner from relations
  union select proowner from app_functions
  union select nspowner from pg_namespace where nspname in ('public','sangam_private')
  union select datdba from pg_database where datname=current_database()
), role_closure(oid) as (
  select oid from relevant_roles
  union select m.roleid from pg_auth_members m join role_closure r on r.oid=m.member
)
select jsonb_build_object(
  'format', 'sangam-recovery-manifest-v1',
  'databaseOwner', (select pg_get_userbyid(datdba) from pg_database where datname=current_database()),
  'schemaOwners', (select jsonb_object_agg(nspname,pg_get_userbyid(nspowner)) from pg_namespace where nspname in ('public','sangam_private')),
  'roleSecurity', (select jsonb_agg(jsonb_build_object('name',r.rolname,'superuser',r.rolsuper,'inherit',r.rolinherit,'createRole',r.rolcreaterole,'createDb',r.rolcreatedb,'canLogin',r.rolcanlogin,'replication',r.rolreplication,'bypassRls',r.rolbypassrls,'connectionLimit',r.rolconnlimit,'validUntil',r.rolvaliduntil,'settingsHash',encode(sha256(convert_to(coalesce(r.rolconfig::text,''),'UTF8')),'hex')) order by r.rolname) from pg_roles r join role_closure c on c.oid=r.oid),
  'roleMemberships', (select coalesce(jsonb_agg(jsonb_build_object('member',pg_get_userbyid(m.member),'role',pg_get_userbyid(m.roleid),'grantor',pg_get_userbyid(m.grantor),'admin',m.admin_option,'inherit',m.inherit_option,'set',m.set_option) order by pg_get_userbyid(m.member),pg_get_userbyid(m.roleid),pg_get_userbyid(m.grantor)),'[]') from pg_auth_members m join role_closure c on c.oid=m.member),
  'tableInventory', (select jsonb_agg(c.relname order by c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p')),
  'schemaPrivileges', (select jsonb_object_agg(schema_name,(select jsonb_object_agg(role_name,jsonb_build_object('usage',has_schema_privilege(role_name,schema_name,'USAGE'),'create',has_schema_privilege(role_name,schema_name,'CREATE'))) from unnest(array['anon','authenticated','service_role']) role_name)) from unnest(array['public','sangam_private']) schema_name),
  'tables', (select jsonb_agg(jsonb_build_object(
    'name', f.name, 'rows', f.rows, 'contentHash', f.content_hash, 'owner', pg_get_userbyid(r.relowner),
    'rls', r.relrowsecurity, 'forceRls', r.relforcerowsecurity,
    'columns', (select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,'default',pg_get_expr(d.adbin,d.adrelid)) order by a.attnum)
      from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=r.oid and a.attnum>0 and not a.attisdropped),
    'constraints', (select coalesce(jsonb_agg(pg_get_constraintdef(c.oid,true) order by c.conname),'[]') from pg_constraint c where c.conrelid=r.oid),
    'indexes', (select coalesce(jsonb_agg(pg_get_indexdef(i.indexrelid) order by ci.relname),'[]') from pg_index i join pg_class ci on ci.oid=i.indexrelid where i.indrelid=r.oid),
    'policies', (select coalesce(jsonb_agg(jsonb_build_object('name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,'roles',(select jsonb_agg(case when x=0 then 'PUBLIC' else pg_get_userbyid(x) end order by x=0,pg_get_userbyid(x)) from unnest(p.polroles) x),'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)) order by p.polname),'[]') from pg_policy p where p.polrelid=r.oid),
    'privileges', (select jsonb_object_agg(role_name, jsonb_build_object('select',has_table_privilege(role_name,r.oid,'SELECT'),'insert',has_table_privilege(role_name,r.oid,'INSERT'),'update',has_table_privilege(role_name,r.oid,'UPDATE'),'delete',has_table_privilege(role_name,r.oid,'DELETE'),'truncate',has_table_privilege(role_name,r.oid,'TRUNCATE'),'references',has_table_privilege(role_name,r.oid,'REFERENCES'),'trigger',has_table_privilege(role_name,r.oid,'TRIGGER'))) from unnest(array['anon','authenticated','service_role']) role_name)
  ) order by f.name) from fingerprints f join relations r on r.relname=f.name),
  'functions', (select jsonb_agg(jsonb_build_object('name',p.nspname||'.'||p.proname,'owner',pg_get_userbyid(p.proowner),'arguments',pg_get_function_identity_arguments(p.oid),'definitionHash',encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),'securityDefiner',p.prosecdef,'settings',p.proconfig,'anonExecute',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticatedExecute',has_function_privilege('authenticated',p.oid,'EXECUTE'),'serviceExecute',has_function_privilege('service_role',p.oid,'EXECUTE')) order by p.nspname,p.proname,pg_get_function_identity_arguments(p.oid)) from app_functions p),
  'sequences', jsonb_build_array(
    (select jsonb_build_object('name','acquisition_audit_id_seq','lastValue',last_value::text,'isCalled',is_called) from public.acquisition_audit_id_seq),
    (select jsonb_build_object('name','automation_audit_id_seq','lastValue',last_value::text,'isCalled',is_called) from public.automation_audit_id_seq)
  )
);
`;

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2) throw new Error('This command only prints read-only SQL; it accepts no arguments.');
  process.stdout.write(MANIFEST_SQL);
}
