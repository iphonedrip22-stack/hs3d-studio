-- Estúdio HS3D — migração v7: SEGURANÇA (auditoria de 16/11/2026).
-- Projeto Supabase "hs3d" > SQL Editor > New query > colar > Run. Pode rodar de novo sem problema.
-- Rode DEPOIS das v2..v6 (já aplicadas).
-- O que faz:
--   1) lista de admins (hs3d_admins) + hs3d_is_admin(): só o e-mail do Matheus enxerga e mexe no painel;
--   2) TODAS as policies das tabelas hs3d_* e do bucket hs3d-previews passam a exigir hs3d_is_admin();
--   3) tira os GRANTs amplos (anon: nada; authenticated: só o que o painel usa);
--   4) decided_by / created_by / updated_by preenchidos pelo servidor (auth.email()), não pelo navegador;
--   5) "Liberar formato" só pela função hs3d_set_format_status() (confere >= 10 revisões e >= 80% no banco);
--   6) URLs de contas só https://; slug de pedido só [a-z0-9-] (o worker gera).
-- O worker do Mac usa a chave de serviço (service_role), que ignora RLS: continua funcionando igual.

-- 1) admins ---------------------------------------------------------------
create table if not exists public.hs3d_admins (
  email      text primary key check (email = lower(email)),
  created_at timestamptz not null default now()
);
alter table public.hs3d_admins enable row level security;
revoke all on public.hs3d_admins from anon, authenticated;
insert into public.hs3d_admins (email) values ('brasilcheaper@gmail.com') on conflict do nothing;

create or replace function public.hs3d_is_admin() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.hs3d_admins a
                  where a.email = lower(coalesce(auth.jwt() ->> 'email', '')))
$$;
revoke all on function public.hs3d_is_admin() from public, anon;
grant execute on function public.hs3d_is_admin() to authenticated;

-- 2) apaga TODAS as policies antigas das tabelas hs3d_* ----------------------
do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies
            where schemaname = 'public' and tablename like 'hs3d\_%'
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

alter table public.hs3d_videos          enable row level security;
alter table public.hs3d_decisions       enable row level security;
alter table public.hs3d_format_requests enable row level security;
alter table public.hs3d_kv              enable row level security;
alter table public.hs3d_metas           enable row level security;
alter table public.hs3d_schedule        enable row level security;
alter table public.hs3d_accounts        enable row level security;
alter table public.hs3d_stats           enable row level security;
alter table public.hs3d_formats         enable row level security;

-- 3) GRANTs: zera e devolve só o mínimo ---------------------------------------
revoke all on public.hs3d_videos, public.hs3d_decisions, public.hs3d_format_requests, public.hs3d_kv,
              public.hs3d_metas, public.hs3d_schedule, public.hs3d_accounts, public.hs3d_stats,
              public.hs3d_formats
  from anon, authenticated;

grant select                         on public.hs3d_videos          to authenticated;
grant select                         on public.hs3d_kv              to authenticated;
grant select, insert                 on public.hs3d_decisions       to authenticated;
grant select, insert                 on public.hs3d_format_requests to authenticated;
grant update (status, status_updated_at) on public.hs3d_format_requests to authenticated;
grant select, insert, update         on public.hs3d_metas           to authenticated;
grant select, insert, update, delete on public.hs3d_schedule        to authenticated;
grant select, insert, update         on public.hs3d_accounts        to authenticated;
grant select, insert, delete         on public.hs3d_stats           to authenticated;
grant select                         on public.hs3d_formats         to authenticated;   -- escrita só pela função

-- policies novas: tudo exige hs3d_is_admin()
create policy hs3d_videos_read  on public.hs3d_videos  for select to authenticated using (public.hs3d_is_admin());
create policy hs3d_kv_read      on public.hs3d_kv      for select to authenticated using (public.hs3d_is_admin());

create policy hs3d_dec_read     on public.hs3d_decisions for select to authenticated using (public.hs3d_is_admin());
create policy hs3d_dec_insert   on public.hs3d_decisions for insert to authenticated with check (public.hs3d_is_admin());

create policy hs3d_fmt_read     on public.hs3d_format_requests for select to authenticated using (public.hs3d_is_admin());
create policy hs3d_fmt_insert   on public.hs3d_format_requests for insert to authenticated
  with check (public.hs3d_is_admin() and status = 'novo');
create policy hs3d_fmt_update   on public.hs3d_format_requests for update to authenticated
  using (public.hs3d_is_admin()) with check (public.hs3d_is_admin());

create policy hs3d_metas_read   on public.hs3d_metas for select to authenticated using (public.hs3d_is_admin());
create policy hs3d_metas_insert on public.hs3d_metas for insert to authenticated with check (public.hs3d_is_admin());
create policy hs3d_metas_update on public.hs3d_metas for update to authenticated
  using (public.hs3d_is_admin()) with check (public.hs3d_is_admin());

create policy hs3d_sched_read   on public.hs3d_schedule for select to authenticated using (public.hs3d_is_admin());
create policy hs3d_sched_insert on public.hs3d_schedule for insert to authenticated with check (public.hs3d_is_admin());
create policy hs3d_sched_update on public.hs3d_schedule for update to authenticated
  using (public.hs3d_is_admin()) with check (public.hs3d_is_admin());
create policy hs3d_sched_delete on public.hs3d_schedule for delete to authenticated using (public.hs3d_is_admin());

create policy hs3d_acc_read     on public.hs3d_accounts for select to authenticated using (public.hs3d_is_admin());
create policy hs3d_acc_insert   on public.hs3d_accounts for insert to authenticated with check (public.hs3d_is_admin());
create policy hs3d_acc_update   on public.hs3d_accounts for update to authenticated
  using (public.hs3d_is_admin()) with check (public.hs3d_is_admin());

create policy hs3d_stats_read   on public.hs3d_stats for select to authenticated using (public.hs3d_is_admin());
create policy hs3d_stats_insert on public.hs3d_stats for insert to authenticated
  with check (public.hs3d_is_admin() and source = 'manual');
create policy hs3d_stats_delete on public.hs3d_stats for delete to authenticated
  using (public.hs3d_is_admin() and source = 'manual');

create policy hs3d_formats_read on public.hs3d_formats for select to authenticated using (public.hs3d_is_admin());

-- bucket privado: prévia só pra admin
drop policy if exists hs3d_preview_read on storage.objects;
create policy hs3d_preview_read on storage.objects
  for select to authenticated using (bucket_id = 'hs3d-previews' and public.hs3d_is_admin());

-- 4) autoria preenchida pelo servidor ---------------------------------------
create or replace function public.hs3d_force_author() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare e text := lower(auth.jwt() ->> 'email');
begin
  if e is null then return new; end if;            -- worker (service_role): deixa como está
  if tg_table_name = 'hs3d_decisions' then
    new.decided_by := e; new.synced_at := null;
  elsif tg_table_name = 'hs3d_format_requests' then
    if tg_op = 'INSERT' then
      new.created_by := e; new.slug := null; new.synced_at := null;   -- slug é do worker
    end if;
  elsif tg_table_name = 'hs3d_stats' then
    new.created_by := e;
  end if;
  return new;
end $$;
drop trigger if exists hs3d_dec_author on public.hs3d_decisions;
create trigger hs3d_dec_author before insert on public.hs3d_decisions
  for each row execute function public.hs3d_force_author();
drop trigger if exists hs3d_fmt_author on public.hs3d_format_requests;
create trigger hs3d_fmt_author before insert on public.hs3d_format_requests
  for each row execute function public.hs3d_force_author();
drop trigger if exists hs3d_stats_author on public.hs3d_stats;
create trigger hs3d_stats_author before insert on public.hs3d_stats
  for each row execute function public.hs3d_force_author();
-- metas e agenda já têm hs3d_stamp_user (updated_by = e-mail do token)

-- 5) Liberar formato só pela função (regra conferida no banco) ----------------
create or replace function public.hs3d_set_format_status(p_id text, p_status text, p_reason text default null)
returns public.hs3d_formats
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  f public.hs3d_formats;
  m public.hs3d_metas;
  n integer; ok integer; minr integer; mint numeric;
begin
  if not public.hs3d_is_admin() then
    raise exception 'sem permissão' using errcode = '42501';
  end if;
  if p_status not in ('liberado', 'pausado', 'em_teste') then
    raise exception 'status inválido: %', p_status using errcode = '22023';
  end if;
  select * into f from public.hs3d_formats where id = p_id for update;
  if not found then
    select * into m from public.hs3d_metas where id = p_id;
    if not found then raise exception 'formato % não existe', p_id using errcode = 'P0002'; end if;
    insert into public.hs3d_formats (id, nome, canal, canal_nome, status)
      values (m.id, coalesce(m.formato, m.id), m.canal, m.canal_nome, 'em_teste')
      returning * into f;
  end if;
  if p_status = 'liberado' then
    minr := greatest(coalesce(f.min_reviews, 10), 10);
    mint := greatest(coalesce(f.min_rate, 0.8), 0.8);
    select count(*), count(*) filter (where d.decision = 'aprovado') into n, ok
      from public.hs3d_videos v
      join lateral (select x.decision from public.hs3d_decisions x
                     where x.video_id = v.id and x.decision in ('aprovado', 'reprovado', 'ajuste')
                     order by x.created_at desc limit 1) d on true
     where v.formato = p_id;
    if n < minr or ok::numeric / nullif(n, 0) < mint or n = 0 then
      raise exception 'Ainda não dá pra liberar: % revisado(s) (mínimo %), % aprovado(s) (mínimo % por cento)',
        n, minr, ok, round(mint * 100) using errcode = 'P0001';
    end if;
    update public.hs3d_formats
       set status = 'liberado', status_reason = null, liberado_at = now(),
           liberado_by = lower(auth.jwt() ->> 'email'), updated_by = lower(auth.jwt() ->> 'email')
     where id = f.id returning * into f;
  else
    update public.hs3d_formats
       set status = p_status, status_reason = left(nullif(trim(coalesce(p_reason, '')), ''), 300),
           updated_by = lower(auth.jwt() ->> 'email')
     where id = f.id returning * into f;
  end if;
  return f;
end $$;
revoke all on function public.hs3d_set_format_status(text, text, text) from public, anon;
grant execute on function public.hs3d_set_format_status(text, text, text) to authenticated;

-- 6) validações de dado --------------------------------------------------------
alter table public.hs3d_accounts drop constraint if exists hs3d_accounts_url_https;
alter table public.hs3d_accounts add constraint hs3d_accounts_url_https
  check (url is null or url ~* '^https://[^\s<>"'']+$') not valid;
alter table public.hs3d_format_requests drop constraint if exists hs3d_fmt_slug_check;
alter table public.hs3d_format_requests add constraint hs3d_fmt_slug_check
  check (slug is null or slug ~ '^[a-z0-9-]{1,64}$') not valid;


notify pgrst, 'reload schema';
