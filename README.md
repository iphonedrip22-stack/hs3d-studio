# Estúdio HS3D — painel de aprovação

Só a interface (HTML/CSS/JS estático no GitHub Pages). **Não tem senha, vídeo, token nem dado da fila aqui.**

- Login: Supabase do projeto dedicado **hs3d** (usuário criado nesse projeto).
- Vídeos, metas e diário vêm do worker que roda no Mac do Matheus (`~/Maestri/HS3D/painel/worker`).
- Aprovar / reprovar e "Novo formato" só **registram** a decisão/pedido. **Este painel nunca posta nada nas redes.**
- A chave em `js/config.js` é a anônima (pública por desenho). As tabelas `hs3d_*` têm RLS só para usuário logado.
