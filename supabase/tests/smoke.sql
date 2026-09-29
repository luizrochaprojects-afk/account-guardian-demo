-- Smoke test for supabase/schema.sql, run by CI against a throwaway Postgres.
insert into organizations (id, name, created_by)
  values ('00000000-0000-4000-8000-000000000001', 'Test Org', '00000000-0000-4000-8000-0000000000aa');
insert into profiles (user_id, organization_id, display_name, role)
  values ('00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000001', 'Tester', 'founder');
set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000aa';

insert into accounts (id, organization_id, name)
  values ('00000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-000000000001', 'Test Account');
select pipeline_stage, pipeline_phase, code_prefix from accounts;

select (transition_stage('00000000-0000-4000-8000-00000000000b', 'working', '{}'::jsonb))->>'pipeline_stage' as legal_move;

do $$ begin
  perform transition_stage('00000000-0000-4000-8000-00000000000b', 'business_case', '{}'::jsonb);
  raise exception 'SKIP WAS ALLOWED';
exception when others then
  if sqlerrm like '%cannot skip%' then raise notice 'illegal skip refused: ok'; else raise; end if;
end $$;

do $$ begin
  update accounts set pipeline_stage = 'sign_off' where id = '00000000-0000-4000-8000-00000000000b';
  raise exception 'DIRECT STAGE WRITE WAS ALLOWED';
exception when others then
  if sqlerrm like '%only be changed via%' then raise notice 'direct stage write refused: ok'; else raise; end if;
end $$;

select count(*) as history_rows from account_stage_history;
select count(*) as lifecycle_events from events where group_label = 'lifecycle';
select * from dashboard_north_star_counts('00000000-0000-4000-8000-000000000001', now() - interval '28 days');
select * from dashboard_sales_funnel('00000000-0000-4000-8000-000000000001', now() - interval '28 days', false);
select flag, detail from account_hygiene_flags('00000000-0000-4000-8000-000000000001');
select count(*) as signals from account_customer_signals;
select count(*) as coverage from account_deal_coverage;
