-- Fix the e2e_purge_tagged guard: the reaper sweeps with the bare '[e2e-' prefix (5 chars), which
-- the original `length < 6` check wrongly rejected. The position('[e2e-' ...) = 1 check already
-- guarantees the prefix is an e2e tag, so the length floor is just the prefix length (5).
create or replace function public.e2e_purge_tagged(
  p_tag_prefix text,
  p_creator_ids uuid[],
  p_older_than_hours integer default 0
) returns integer
language plpgsql security definer set search_path to ''
as $$
declare
  r record;
  v_total integer := 0;
  v_n integer;
  v_cutoff timestamptz := now() - make_interval(hours => greatest(p_older_than_hours, 0));
begin
  if p_tag_prefix is null or position('[e2e-' in p_tag_prefix) <> 1 or length(p_tag_prefix) < 5 then
    raise exception 'e2e_purge_tagged: unsafe tag prefix %', p_tag_prefix;
  end if;
  if p_creator_ids is null or array_length(p_creator_ids, 1) is null then
    raise exception 'e2e_purge_tagged: no creator ids supplied';
  end if;

  for r in
    select id from public.tasks
    where parent_task_id is null
      and title like p_tag_prefix || '%'
      and creator = any(p_creator_ids)
      and (p_older_than_hours <= 0 or created_at < v_cutoff)
  loop
    perform set_config('planter.deleting_project_root', r.id::text, true);
    delete from public.tasks where root_id = r.id;
    get diagnostics v_n = row_count;
    v_total := v_total + v_n;
  end loop;

  perform set_config('planter.deleting_project_root', '', true);

  delete from public.tasks
  where title like p_tag_prefix || '%'
    and parent_task_id is not null
    and creator = any(p_creator_ids)
    and (p_older_than_hours <= 0 or created_at < v_cutoff);

  return v_total;
end$$;

revoke all on function public.e2e_purge_tagged(text, uuid[], integer) from public;
grant execute on function public.e2e_purge_tagged(text, uuid[], integer) to service_role;
