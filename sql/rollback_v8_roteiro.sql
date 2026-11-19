-- Estúdio HS3D — DESFAZ a migração v8 (aba Roteiro). Rode só se precisar voltar atrás.
-- ATENÇÃO: apaga os comentários linha a linha e o texto de roteiro sincronizado (o roteiro.txt no Mac não é tocado).
-- Decisões 'roteiro_aprovado' / 'ideia_roteiro' já gravadas são APAGADAS (senão a constraint antiga não volta).
-- Antes de rodar, desligue o worker v8 no Mac (volte o backup), senão ele tenta gravar roteiro_md e dá erro.
begin;

drop table if exists public.hs3d_script_comments;
drop function if exists public.hs3d_script_comment_author();

delete from public.hs3d_decisions where decision in ('roteiro_aprovado','ideia_roteiro');
alter table public.hs3d_decisions drop constraint if exists hs3d_dec_roteiro_len;
alter table public.hs3d_decisions drop constraint if exists hs3d_dec_decision_check;
alter table public.hs3d_decisions add constraint hs3d_dec_decision_check
  check (decision in ('aprovado','reprovado','ajuste'));
alter table public.hs3d_decisions drop constraint if exists hs3d_reprovar_com_comentario;
alter table public.hs3d_decisions add constraint hs3d_reprovar_com_comentario
  check (decision = 'aprovado' or length(coalesce(trim(comment),'')) > 0);

create or replace function public.hs3d_apply_decision() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.decision = 'ajuste' then
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

alter table public.hs3d_videos drop constraint if exists hs3d_videos_roteiro_len;
alter table public.hs3d_videos drop constraint if exists hs3d_videos_roteiro_fonte_check;
alter table public.hs3d_videos drop column if exists roteiro_md;
alter table public.hs3d_videos drop column if exists roteiro_fonte;
alter table public.hs3d_videos drop column if exists roteiro_at;

commit;
notify pgrst, 'reload schema';
