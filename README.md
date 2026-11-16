# Estúdio HS3D — painel de aprovação

Só a interface (HTML/CSS/JS estático no GitHub Pages). **Não tem senha, vídeo, token nem dado da fila aqui.**

- Login: Supabase do projeto dedicado **hs3d** (usuário criado nesse projeto).
- Abas: Fila (vídeo, etapa da esteira, onde está no Mac, horário de postagem por plataforma), Hoje (horários do dia x meta), Metas (editáveis), Novo (copiar formato de link ou criar história do zero), Diário.
- Vídeos, diário e arquivos do Maestri vêm do worker que roda no Mac do Matheus (`~/Maestri/HS3D/painel/worker`), que também escreve METAS.md, AGENDA.md, DECISOES.md e PEDIDOS_FORMATO.md para o Hermes.
- Aprovar, agendar, metas e pedidos só **registram**. **Este painel nunca posta nada nas redes.**
- A chave em `js/config.js` é a anônima (pública por desenho). As tabelas `hs3d_*` têm RLS só para usuário logado.
- Schema: `schema.sql` + `migration_v2.sql` (no worker, no Mac).
