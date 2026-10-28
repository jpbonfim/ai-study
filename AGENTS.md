# Plataforma de Estudo Acadêmico

Plataforma de estudo (cadernos teóricos e questões de prova resolvidas) organizada como monorepo npm workspaces: SPA React + Vite (`apps/web`), servidor de API Hono em Node.js com SQLite (`apps/server`) e pipeline de conteúdo compartilhado com marked, KaTeX e Shiki (`packages/content`).

Este arquivo é a fonte única de instruções para todos os agentes e subagentes que operam neste repositório. `CLAUDE.md` é um symlink para ele e `.claude/skills` é um symlink para `.agents/skills`: edite apenas `AGENTS.md` e `.agents/`.

## Comandos Principais

```bash
npm install               # instala as dependências (a partir da raiz)
npm run dev               # API em :3000, app web em http://localhost:5173
npm run validate:archive  # valida o frontmatter de todos os documentos em archive/ (após gerar conteúdo)
npm run check             # typecheck, lint e testes unitários/de integração
npm run build             # build de produção (apps/web/dist + apps/server/dist/server.mjs)
```

O deploy gera uma release localmente e a ativa na VPS (`scripts/deploy.sh`); veja `docs/deploy.md`.

## Skills

Os fluxos de geração de conteúdo ficam em `.agents/skills/<skill>/SKILL.md` (`question-study-generator`, `summary-study-generator`, `explain-question`, `block-diagram-generator`). Ao executar uma tarefa desses domínios, leia e siga o `SKILL.md` correspondente. As regras comuns a todas as skills estão em `.agents/skills/_shared/references/common-rules.md`.

## 1. Proibição de Arquivos Temporários na Raiz
- **Proibido criar arquivos soltos na raiz (`.`):** É terminantemente proibido criar scripts descartáveis (`.py`, `.sh`, `.js`), arquivos intermediários (`.json`, `.txt`), imagens intermediárias (`.png`, `.jpg`) ou qualquer rascunho na raiz do projeto.
- **Uso de scripts oficiais:** Para extração de questões e recorte de imagens de PDFs, utilize exclusivamente o utilitário oficial `.agents/skills/explain-question/scripts/extract_question.py`. Não crie scripts pontuais ad-hoc soltos na raiz.

## 2. Limpeza Obrigatória (Mandatory Cleanup)
- Se durante a resolução de uma tarefa for indispensável criar scripts temporários de depuração ou recorte, eles **DEVEM ser obrigatoriamente deletados (`rm`) antes de concluir o turno ou enviar a mensagem de conclusão ao agente pai**.
- Antes de finalizar, cada subagente deve inspecionar o diretório de trabalho e garantir que apenas os arquivos finais esperados foram criados (em `archive/<materia>/questoes/` ou `archive/<materia>/resumos/`).
- Encerre todos os comandos e servidores de desenvolvimento antes de finalizar. Não deixe processos rodando em segundo plano.

## 3. Destino Oficial dos Arquivos (Todos sob `archive/`, não versionado)
- Enunciados e resoluções MDX: `archive/<materia>/questoes/`
- Imagens e diagramas das questões: `archive/<materia>/questoes/`
- Cadernos teóricos MDX: `archive/<materia>/resumos/` (ou `archive/<materia>/resumos/materia/`)
- Imagens e diagramas dos resumos: `archive/<materia>/resumos/` (ou `archive/<materia>/resumos/materia/`), referenciadas por caminho relativo (`./<imagem>.png`) no MDX
- **Proibição de imagens no código do app:** Nenhuma imagem extraída de PDFs ou materiais deve ser salva em `apps/` ou `packages/`. Todo o acervo acadêmico (documentos e imagens) deve residir exclusivamente dentro de `archive/` para não poluir o repositório Git com arquivos binários. O servidor entrega as imagens de `archive/` pela rota `/api/media`.
