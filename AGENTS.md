# Diretrizes do Workspace e Higiene de Arquivos

Este arquivo define regras obrigatórias para todos os agentes e subagentes que operam neste repositório.

## 1. Proibição de Arquivos Temporários na Raiz
- **Proibido criar arquivos soltos na raiz (`.`):** É terminantemente proibido criar scripts descartáveis (`.py`, `.sh`, `.js`), arquivos intermediários (`.json`, `.txt`), imagens intermediárias (`.png`, `.jpg`) ou qualquer rascunho na raiz do projeto.
- **Uso de scripts oficiais:** Para extração de questões e recorte de imagens de PDFs, utilize exclusivamente o utilitário oficial `.agents/skills/explain-question/scripts/extract_question.py`. Não crie scripts pontuais ad-hoc soltos na raiz.

## 2. Limpeza Obrigatória (Mandatory Cleanup)
- Se durante a resolução de uma tarefa for indispensável criar scripts temporários de depuração ou recorte, eles **DEVEM ser obrigatoriamente deletados (`rm`) antes de concluir o turno ou enviar a mensagem de conclusão ao agente pai**.
- Antes de finalizar, cada subagente deve inspecionar o diretório de trabalho e garantir que apenas os arquivos finais esperados foram criados (em `archive/<materia>/questoes/` ou `archive/<materia>/resumos/`).

## 3. Destino Oficial dos Arquivos (Todos sob `archive/`, não versionado)
- Enunciados e resoluções MDX: `archive/<materia>/questoes/`
- Imagens e diagramas das questões: `archive/<materia>/questoes/`
- Cadernos teóricos MDX: `archive/<materia>/resumos/` (ou `archive/<materia>/resumos/materia/`)
- Imagens e diagramas dos resumos: `archive/<materia>/resumos/` (ou `archive/<materia>/resumos/materia/`), referenciadas por caminho relativo (`./<imagem>.png`) no MDX
- **Proibição de imagens em `site/public/`:** Nenhuma imagem extraída de PDFs ou materiais deve ser salva dentro de `site/public/`. Todo o acervo acadêmico (documentos e imagens) deve residir exclusivamente dentro de `archive/` para não poluir o repositório Git com arquivos binários. O Astro processa e otimiza imagens de `archive/` automaticamente em tempo de build.
