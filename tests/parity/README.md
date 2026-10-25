# Testes de paridade

Comparam o rewrite com a versão Astro (`main`) servindo os mesmos dados. Tudo roda localmente;
nada é escrito no worktree `main` nem nos dados originais.

## Pré-requisitos

Layout de worktrees (veja `docs/rewrite-plan.md`):

```
ai-study/
├── main/       # versão atual (só leitura), com site/dist compilado (npm run build em main/site)
├── rewrite/    # este worktree
└── data-dev/   # fixture gerada abaixo (fora de qualquer worktree)
```

Navegador do Playwright: `npx playwright install chromium` (ou aponte `PLAYWRIGHT_BROWSERS_PATH`
para uma instalação existente). Atrás de proxy, exporte `NO_PROXY='*'`.

## 1. Fixture

```bash
node tests/parity/prepare-fixture.mjs            # cria ../data-dev a partir de ../main/data e ../main/archive
```

Copia o banco (`VACUUM INTO`) e os archives, e acrescenta o usuário `colega` (senha
`colega-parity`) com a matéria compartilhada `redes-colega`. Senha do admin: `admin-parity`.

## 2. Subir as duas versões

```bash
# versão atual (Astro) em :4100
(cd ../data-dev && DATA_DIR=$PWD ENABLE_LOCAL_ARCHIVE=false NODE_ENV=production PORT=4100 HOST=127.0.0.1 \
  node ../main/site/dist/server/entry.mjs) &

# rewrite: API em :4200 e Vite em :5174
DATA_DIR=../data-dev ENABLE_LOCAL_ARCHIVE=false PORT=4200 HOST=127.0.0.1 node --import tsx apps/server/src/main.ts &
(cd apps/web && API_URL=http://127.0.0.1:4200 WEB_PORT=5174 npx vite --host 127.0.0.1) &
```

Para testar o build de produção no lugar do Vite: `npm run build` e
`DATA_DIR=../data-dev ENABLE_LOCAL_ARCHIVE=false WEB_DIST_DIR=apps/web/dist PORT=4300 HOST=127.0.0.1 npm start`,
usando `NEW_URL=http://127.0.0.1:4300` nos comandos abaixo.

## 3. Comparações

| Comando | O que compara |
| :--- | :--- |
| `OLD_SITE_URL=http://127.0.0.1:4100 node tests/parity/capture-baseline.mjs` | Grava o HTML de todo capítulo/questão da versão atual em `.parity/baseline` (gitignored: o conteúdo é privado) |
| `npm run test:parity` | HTML renderizado pelo `packages/content` × baseline, documento a documento |
| `npm run test:e2e` | Specs do Playwright nos projetos `old` e `new` (`--project=new` para só um). O teste do limite de login só roda com `RUN_RATE_LIMIT=1`, por último: ele bloqueia logins desta máquina, então reinicie os servidores depois |
| `node tests/parity/tools/visual-diff.mjs [filtro]` | Screenshots dos mesmos cenários nas duas versões, diferença pixel a pixel (`.parity/visual`) |
| `node tests/parity/tools/perf.mjs <url> [caminho] [lentidão-cpu]` | Tempo até o primeiro capítulo aparecer, visita fria e quente |

Encerre os servidores ao terminar.
