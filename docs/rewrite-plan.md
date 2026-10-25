# Plano de rewrite — base para as próximas features

Este documento é o plano vivo do rewrite. Ele registra o escopo, as fases, os critérios de pronto
e as decisões tomadas durante a execução (seção "Registro de decisões").

## Regras

1. **Paridade total.** Toda feature, URL, interação e detalhe visual atual continua igual.
   Edição, chat com LLM, livros, revisões, tokens de API, PWA e busca **ficam fora**.
2. **Só local.** Nada é executado no VPS; o deploy atual não é alterado. Scripts/configs novos de
   produção são preparados no fim, mas não executados.
3. **Dados reais intocados.** O desenvolvimento usa uma cópia (`../data-dev/`). `data/` e
   `archive/` originais são apenas lidos.
4. **Conteúdo e skills intocados.** Nenhum `.mdx`/`materia.json` é alterado; o parser se adapta.
5. **Compatibilidade do `sync_archive.py`.** O protocolo de sync continua o mesmo (meta: zero
   mudanças no script).
6. **Isolamento por branch e worktree.** Todo o trabalho acontece no branch `rewrite`, no worktree
   `../rewrite/`. O worktree `../main/` é só leitura durante o rewrite: nenhum commit, nenhum
   arquivo versionado alterado, nenhuma mudança no `.env` dele. O merge de `rewrite` no `main` só
   acontece quando o dono do projeto decidir.

```
/home/joao/study/ai-study/
├── .bare/       # repositório
├── main/        # versão atual (só leitura)
├── rewrite/     # este worktree (branch rewrite)
└── data-dev/    # cópia de dados usada pelas duas versões nas comparações
```

## Diferenças intencionais (correções de bugs e segurança)

| Área | Antes | Depois |
|---|---|---|
| Conteúdo | HTML cru do markdown injetado sem sanitização (XSS armazenado entre usuários que compartilham matérias) | HTML sanitizado no cliente antes de entrar na página |
| Export offline (`/downloads/<materia>.html`) | Sem checagem de permissão; lê `archive/` da raiz do repo (vazio em produção); usuário 1 fixo | Gerado no navegador a partir do conteúdo do usuário (ou compartilhado), respeitando permissões |
| `/api/media` | Liberava qualquer arquivo quando `NODE_ENV != production` | Sempre checa permissão |
| Login via header `Basic` | `bcrypt.compareSync` a cada requisição, sem rate limit | bcrypt assíncrono, com o mesmo rate limit do login |
| Cache | Três camadas (memória, SQLite `compiled_mdx_cache`, HTML em `localStorage`) + arquivo de epoch | Cache do HTML renderizado em IndexedDB por hash do conteúdo; `clear-server-cache.sh` fica obsoleto |
| Configurações → "Ir para Disciplina" | Listava sempre as matérias do usuário 1 | Lista as matérias do usuário logado |
| Admin → "Editar" usuário | Botão chamava função inexistente (não fazia nada) | Abre modal de edição (nome de exibição e perfil), usando a API que já existia |
| Admin → logs | Detalhes dos logs inseridos com `innerHTML` (XSS via nome de usuário no login) | Renderizados como texto |

## Fases

### Fase 0 — congelar o comportamento atual
- [x] Branch `rewrite` + worktree `../rewrite/`; `../data-dev/` com cópia dos dados.
- [ ] Fixture reprodutível (`tests/parity/fixture`): conteúdo do `archive/` + segundo usuário com
      matéria compartilhada, para exercitar tags cruzadas e matérias de outros usuários.
- [ ] Inventário de features (`baseline/FEATURES.md`).
- [ ] Snapshots do conteúdo renderizado pela versão atual (todo capítulo e questão).
- [ ] Contrato da API gravado (incluindo sync).
- [ ] Screenshots de referência (3 temas × desktop/mobile).

### Fase 1 — monorepo e tooling
npm workspaces (pnpm não está disponível no ambiente), TypeScript strict, Biome, Vitest,
Playwright, workflow de CI (só roda quando houver push).

### Fase 2 — `packages/content`
Pipeline único, isomórfico (Node para testes/CLI, Web Worker no app), testado contra os snapshots.

### Fase 3 — `apps/server`
Hono + Drizzle + better-sqlite3, migration `0000` que adota o schema atual, módulos de auth,
autorização, subjects, documents, media, sync, archive, admin, logs.

### Fase 4 — `apps/web`
React + Vite SPA com as mesmas URLs, o mesmo CSS e o mesmo comportamento.

### Fase 5 — paridade e limpeza
Comparação lado a lado, medição de desempenho, documentação, remoção do `site/` antigo (só no
branch `rewrite`).

### Fase 6 — preparar a subida (nada executado)
Script de deploy, unit systemd, Caddyfile e runbook com backup e rollback.

## Registro de decisões

- **O conteúdo não é MDX válido.** Os arquivos têm chaves de LaTeX soltas no texto e tags
  "estrangeiras" (`<EOS>`, `<cr>`, `<lf>`) em prosa. Um parser MDX real (`remark-mdx`) rejeitaria
  vários arquivos. O pipeline novo trata o formato como "markdown com um conjunto fechado de tags
  customizadas" e usa o mesmo motor markdown de hoje (`marked`), organizado em etapas puras e
  testáveis, com sanitização no final. Isso preserva a semântica exata do conteúdo existente.
- **Upload de ZIP continua no servidor**, mas com extração em streaming para disco (memória
  constante) e substituição atômica. Descompactar no cliente exigiria uma substituição
  transacional espalhada em várias requisições, sem ganho real para o usuário.
- **npm workspaces** no lugar de pnpm, porque pnpm não está instalado no ambiente.
