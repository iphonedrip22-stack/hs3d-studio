-- Estúdio HS3D — migração v8: aba ROTEIRO completa (texto inteiro, aprovar roteiro, comentar linha a linha, ideia).
-- Projeto Supabase "hs3d" > SQL Editor > New query > colar > Run. Pode rodar de novo sem problema.
-- Rode DEPOIS da v7 (segurança: hs3d_is_admin). Se a v7 não estiver aplicada, esta migração para com erro e não muda nada.
-- O que faz:
--   1) hs3d_videos ganha roteiro_md / roteiro_fonte / roteiro_at (só o worker do Mac escreve; o painel só lê);
--   2) hs3d_decisions aceita 'roteiro_aprovado' (aprova SÓ o roteiro, não o vídeo) e 'ideia_roteiro'
--      (ideia pro Roteirista; NÃO manda o item de volta pra edição);
--   3) o gatilho hs3d_apply_decision ignora essas duas: não mexem em status nem em stage do vídeo;
--   4) tabela nova hs3d_script_comments (comentário preso a uma linha do roteiro), mesmas regras da v7:
--      RLS ligado, só admin lê/cria, ninguém edita/apaga pelo painel, anon sem nada, autor preenchido pelo servidor.
-- O worker do Mac usa a chave de serviço (service_role), que ignora RLS: marca synced_at e escreve roteiro_md.

begin;

-- 0) pré-requisito: v7 aplicada --------------------------------------------------
do $$
begin
  if to_regprocedure('public.hs3d_is_admin()') is null then
    raise exception 'Falta a migration_v7_security.sql (hs3d_is_admin). Rode a v7 antes da v8.';
  end if;
end $$;

-- 1) texto completo do roteiro (o worker lê o roteiro.txt do episódio no Mac) -------
alter table public.hs3d_videos add column if not exists roteiro_md    text;
alter table public.hs3d_videos add column if not exists roteiro_fonte text;        -- nome do arquivo (ex.: roteiro.txt), sem caminho
alter table public.hs3d_videos add column if not exists roteiro_at    timestamptz; -- mtime do arquivo no Mac
alter table public.hs3d_videos drop constraint if exists hs3d_videos_roteiro_len;
alter table public.hs3d_videos add constraint hs3d_videos_roteiro_len
  check (roteiro_md is null or length(roteiro_md) <= 20000);
alter table public.hs3d_videos drop constraint if exists hs3d_videos_roteiro_fonte_check;
alter table public.hs3d_videos add constraint hs3d_videos_roteiro_fonte_check
  check (roteiro_fonte is null or roteiro_fonte ~ '^[A-Za-z0-9._-]{1,80}$');
-- hs3d_videos continua: authenticated só SELECT (v7). Nada de grant novo.

-- 2) novos tipos de decisão -------------------------------------------------------
alter table public.hs3d_decisions drop constraint if exists hs3d_decisions_decision_check;
alter table public.hs3d_decisions drop constraint if exists hs3d_dec_decision_check;
alter table public.hs3d_decisions add constraint hs3d_dec_decision_check
  check (decision in ('aprovado','reprovado','ajuste','roteiro_aprovado','ideia_roteiro'));
-- comentário obrigatório em tudo, menos nas duas aprovações
alter table public.hs3d_decisions drop constraint if exists hs3d_reprovar_com_comentario;
alter table public.hs3d_decisions add constraint hs3d_reprovar_com_comentario
  check (decision in ('aprovado','roteiro_aprovado') or length(coalesce(trim(comment),'')) > 0);
-- teto de tamanho só pros tipos novos (não revalida linhas antigas)
alter table public.hs3d_decisions drop constraint if exists hs3d_dec_roteiro_len;
alter table public.hs3d_decisions add constraint hs3d_dec_roteiro_len
  check (decision not in ('roteiro_aprovado','ideia_roteiro') or length(coalesce(comment,'')) <= 2000) not valid;

-- 3) gatilho: decisões de roteiro não mexem no vídeo (resto = igual à v3) ---------------
create or replace function public.hs3d_apply_decision() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.decision in ('roteiro_aprovado', 'ideia_roteiro') then
    return new;                                   -- só registro; o worker leva pro Roteirista
  elsif new.decision = 'ajuste' then
    update public.hs3d_videos set status = 'aguardando', stage = 'edicao',
      stage_note = 'Ajuste pedido: ' || left(new.comment, 200)
      where id = new.video_id and status <> 'postado';
  else
    update public.hs3d_videos set status = new.decision,
      stage = case when new.decision = 'reprovado' then 'edicao' else stage end
      where id = new.video_id and status <> 'postado';
  end if;
  return new;
end $$;

-- 4) comentários linha a linha -------------------------------------------------------
create table if not exists public.hs3d_script_comments (
  id          uuid primary key default gen_random_uuid(),
  video_id    text not null references public.hs3d_videos(id) on delete cascade,
  channel     text not null check (channel in ('curioso','zeca')),
  linha       integer not null check (linha between 1 and 2000),
  trecho      text check (trecho is null or length(trecho) <= 500),   -- cópia da linha comentada (o roteiro pode mudar)
  comentario  text not null check (length(trim(comentario)) between 1 and 2000),
  autor       text,                                                  -- preenchido pelo servidor (e-mail do token)
  synced_at   timestamptz,                                           -- quando o worker levou pro Mac
  created_at  timestamptz not null default now()
);
create index if not exists hs3d_script_comments_video_idx on public.hs3d_script_comments(video_id, created_at desc);
create index if not exists hs3d_script_comments_pend_idx  on public.hs3d_script_comments(created_at) where synced_at is null;

-- autor/synced_at/created_at sempre do servidor quando vem do painel (worker = service_role passa direto)
create or replace function public.hs3d_script_comment_author() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare e text := lower(auth.jwt() ->> 'email');
begin
  if e is null then return new; end if;
  new.autor := e; new.synced_at := null; new.created_at := now();
  return new;
end $$;
drop trigger if exists hs3d_script_comments_author on public.hs3d_script_comments;
create trigger hs3d_script_comments_author before insert on public.hs3d_script_comments
  for each row execute function public.hs3d_script_comment_author();

alter table public.hs3d_script_comments enable row level security;
revoke all on public.hs3d_script_comments from anon, authenticated;
grant select, insert on public.hs3d_script_comments to authenticated;   -- sem update/delete pelo painel

drop policy if exists hs3d_sc_read   on public.hs3d_script_comments;
drop policy if exists hs3d_sc_insert on public.hs3d_script_comments;
create policy hs3d_sc_read   on public.hs3d_script_comments for select to authenticated using (public.hs3d_is_admin());
-- só comenta em vídeo que existe e com o canal certo
create policy hs3d_sc_insert on public.hs3d_script_comments for insert to authenticated
  with check (public.hs3d_is_admin()
              and exists (select 1 from public.hs3d_videos v where v.id = video_id and v.channel = hs3d_script_comments.channel));

commit;

notify pgrst, 'reload schema';
