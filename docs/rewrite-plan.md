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
| Tags de outros usuários | Capítulos de outro usuário não carregavam quando a matéria dele tinha outro slug (erro "Ocorreu uma falha") | Carregam do slug do dono |
| Admin → logs (horário) | Horário UTC exibido como se fosse local | Convertido para o fuso local |
| Diagramas Mermaid | `securityLevel: 'loose'` (scripts e cliques em diagramas de conteúdo) | `strict` |
| Admin → logs | Detalhes dos logs inseridos com `innerHTML` (XSS via nome de usuário no login) | Renderizados como texto |
| Página 404 | Página padrão do Astro (logo do framework, fundo escuro), `Path: ...` | Página no visual do site com link "Voltar à Biblioteca" (mesmo título e mesma exigência de login) |
| Validação do conteúdo | `npm run build` em `site/` validava o frontmatter de `archive/` (content collections) | `npm run validate:archive`, com as mesmas regras (incluindo imagens referenciadas que precisam existir) |
| `DATA_DIR` relativo | Relativo a `site/` (`../data`) | Relativo à raiz do repositório / `APP_ROOT` (`./data`); o deploy recusa um `.env` antigo que apontaria para outro lugar |

## Fases

### Fase 0 — congelar o comportamento atual
- [x] Branch `rewrite` + worktree `../rewrite/`; `../data-dev/` com cópia dos dados.
- [x] Fixture reprodutível (`tests/parity/prepare-fixture.mjs`): conteúdo do `archive/` + segundo
      usuário com matéria compartilhada, para exercitar tags cruzadas e matérias de outros usuários.
- [x] Inventário de features (`docs/FEATURES.md`).
- [x] Snapshots do conteúdo renderizado pela versão atual (todo capítulo e questão) em `.parity/`.
- [x] Contrato da API (testes do servidor + `sync_archive.py` sem alterações contra o servidor novo).
- [x] Screenshots de referência (3 temas × desktop/mobile) na comparação visual.

### Fase 1 — monorepo e tooling
- [x] npm workspaces (pnpm não está disponível no ambiente), TypeScript strict, Biome, Vitest,
      Playwright. Workflow de CI (`.github/workflows/ci.yml`: check + build) — só roda quando houver
      push; paridade e e2e dependem do archive privado e rodam localmente.

### Fase 2 — `packages/content`
- [x] Pipeline único, isomórfico (Node para testes/CLI, Web Worker no app), testado contra os
      snapshots (283/283 documentos idênticos). Shiki só com as 15 linguagens e 5 temas usados.
- [x] `npm run validate:archive` substitui a validação que o build do Astro fazia.

### Fase 3 — `apps/server`
- [x] Hono + Drizzle + better-sqlite3, migration `0000` que adota o schema atual, módulos de auth,
      autorização, subjects, documents, media, sync, archive, admin, logs. Bundle único com esbuild.

### Fase 4 — `apps/web`
- [x] React + Vite SPA com as mesmas URLs, o mesmo CSS e o mesmo comportamento; páginas carregadas
      sob demanda (rota `lazy`) com pré-carregamento dos dados da página de entrada.

### Fase 5 — paridade e limpeza
- [x] Comparação lado a lado, item a item do inventário (tabela "Evidência" em `docs/FEATURES.md`):
      e2e (175 nas duas versões + limite de login opcional), visual (28 cenários idênticos, também
      no build de produção), conteúdo (283 documentos), `sync_archive.py` (dry-run, push, pull).
- [x] Desempenho (`tests/parity/tools/perf.mjs`, CPU 4× mais lenta, primeiro capítulo visível):
      visita quente 169 ms (antigo: 36 ms, HTML vindo do servidor); fria 321 ms (antigo: 143 ms).
      O servidor deixa de renderizar markdown/KaTeX/Shiki (RSS 227 MB × 295 MB do antigo em uso).
      Bundle inicial 255 kB (79 kB gzip).
- [x] Documentação (README, CLAUDE.md, AGENTS.md, skills, `tests/parity/README.md`).
- [x] Remoção do `site/` antigo e de `clear-server-cache.sh` (só no branch `rewrite`).

### Fase 6 — preparar a subida (nada executado)
- [x] `scripts/build-release.mjs` + `scripts/deploy.sh` (build local, envio por rsync) e
      `scripts/activate-release.sh` (backup do banco, unit systemd, troca atômica, health check e
      rollback automático), testados num servidor simulado localmente.
- [x] `scripts/study-site.service`, `scripts/Caddyfile.example` (SPA estático + proxy da API,
      validado com o Caddy 2.11 e com os e2e passando através dele) e runbook `docs/deploy.md`.

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
- **Rotas carregadas com `lazy` do react-router, não `React.lazy`.** Com `Suspense`, o React 19
  segura a revelação de conteúdo suspenso por 300 ms; o primeiro capítulo aparecia ~300 ms depois.
- **Caddy serve o SPA.** O Node só atende `/api/*` e `/admin/api/*`, poupando o VPS. O servidor
  ainda serve o SPA com `WEB_DIST_DIR` (testes locais de produção).
- **Releases montados localmente.** O VPS recebe `server.mjs`, `web/` e um `package-lock.json` com
  as 6 dependências de runtime; não há build nem checkout git no servidor.
- **Fontes por página como antes.** O conjunto de fontes do Google muda por página (itálicos da
  JetBrains Mono só nas configurações), então o script inline do `<head>` escolhe o conjunto pela
  URL antes da pintura e o layout troca nas navegações internas.
- **Efeitos repetidos não podem reaplicar estado.** O `StrictMode` roda efeitos duas vezes; uma
  guarda "primeira execução" fez `?type=materia` com uma tag sem capítulos de matéria mostrar um
  fluxo vazio. A regra "seção sem capítulos da tag → outra seção" é uma função pura do modelo
  (`sectionForTag`), aplicada antes do primeiro fluxo, e o efeito de troca de tag compara com a
  última tag vista.
