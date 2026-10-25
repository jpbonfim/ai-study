# Inventário de features (paridade)

Checklist de tudo que a versão atual faz do ponto de vista do usuário. Cada item precisa existir
na versão nova com o mesmo comportamento (ou com a diferença registrada em
`rewrite-plan.md` → "Diferenças intencionais"). `[x]` = implementado e verificado na versão nova.

Verificação: specs Playwright em `tests/e2e/` (rodam contra a versão atual e a nova, incluindo
`details.spec.ts` para os itens menores), testes do servidor em `apps/server/test/`, comparação do
HTML de todos os documentos (`npm run test:parity`) e comparação visual de 28 cenários
(`tests/parity/tools/visual-diff.mjs`). Ver `tests/parity/README.md`.

## Global

- [x] G1. Todas as páginas exigem login, exceto `/login`. Sem sessão: páginas redirecionam para
      `/login?redirect=<caminho+query>` (ou `/login` quando o caminho é `/`); APIs respondem 401 JSON
      com `WWW-Authenticate: Basic`.
- [x] G2. `/login` com sessão válida redireciona para `/`.
- [x] G3. Rotas `/admin*` exigem perfil admin: páginas redirecionam para `/?error=forbidden`, APIs
      `/admin/api/*` respondem 403 JSON.
- [x] G4. Tema (Papel/Sépia, Escuro, Preto OLED) aplicado antes da pintura (sem flash), persistido
      em `localStorage.study_theme`; classes `theme-paper|theme-dark|theme-oled` + `dark` no `<html>`.
- [x] G5. Preferências de leitura aplicadas antes da pintura em todas as páginas de leitura:
      `--reader-font-family`, `--reader-font-size`, `--reader-max-width`, `--reader-text-align` +
      `data-text-align`, `data-code-theme`, `--code-font-family`, `--code-font-size`,
      `--katex-script-scale`, `--katex-min-font-size`.
- [x] G6. Menu lateral recolhível no desktop (botão X → recolhe; botão flutuante ☰ no canto superior
      esquerdo reabre), estado persistido em `study_sidebar_collapsed`.
- [x] G7. Mobile: barra superior fixa com botão que abre o menu como gaveta + backdrop; clicar no
      backdrop ou num link fecha; gesto de swipe a partir da borda esquerda abre e swipe para a
      esquerda fecha, ignorando gestos iniciados em tabelas/fórmulas/código/áreas roláveis.
- [x] G8. `HeaderActions`: botão redondo de tema (ícone muda conforme o tema; dropdown com 3 opções e
      ✓ na ativa; fecha ao clicar fora), engrenagem → `/configuracoes`, X → fecha/recolhe o menu.
- [x] G9. Atalho global Alt+C limpa o cache local de estudo e recarrega a página.
- [x] G10. Parâmetros `?nocache`, `?clear_cache`, `?bust` limpam o cache local e são removidos da URL.
- [x] G11. Títulos de aba: `"<título> | Caderno de Estudos"` nas páginas de leitura; títulos próprios
      em home, login, conta, configurações e admin.
- [x] G12. Favicon e fontes Google por página: interface (login, home, conta, admin) carrega EB
      Garamond, Newsreader e JetBrains Mono 400/500; páginas de leitura acrescentam Lora;
      configurações carregam JetBrains Mono com todos os pesos e itálicos + Lora.

## Login (`/login`)

- [x] L1. Card de autenticação com usuário/senha; envio via JSON para `/api/login`.
- [x] L2. Estado "Autenticando..." com spinner; "Sucesso! Redirecionando..." e redireciona para o
      `redirect` da query (padrão `/`).
- [x] L3. Erro exibido no banner (mensagem do servidor ou "Erro de rede ou servidor indisponível...").
- [x] L4. Rate limit: após N falhas na janela, 429 com mensagem "Tente novamente em X segundos".
- [x] L5. Login registra `login` / `login_failed` nos logs; cookie `session_id` httpOnly, SameSite=Lax,
      Secure quando HTTPS, validade `SESSION_MAX_AGE_DAYS`.

## Home (`/`)

- [x] H1. Menu lateral "Biblioteca Digital" com lista de disciplinas (próprias + compartilhadas),
      contador "N cadastradas", cada item com código, período/instituição ou "De: dono" (compartilhada)
      ou "Em breve" (sem conteúdo), nome e contagens de capítulos/testes.
- [x] H2. Ordenação da lista pelas disciplinas acessadas recentemente (`study_recent_materias` e
      `last_visited_subject`), depois a ordem padrão; clicar registra o acesso.
- [x] H3. Busca de disciplinas sem acento/caixa (nome, código, instituição, descrição, tópicos), botão
      limpar, Esc limpa, estado vazio "Nenhuma disciplina encontrada.", contador "N encontrada(s)".
- [x] H4. Card da conta no rodapé do menu (inicial, nome, @usuário • PERFIL) → `/conta`.
- [x] H5. Seção "Continuar estudo" com dados da última visita: código • instituição, nome,
      descrição conforme o tipo (questão / leitura com âncora / caderno), botão "Continuar
      Questão|Leitura|Caderno" apontando para a última URL, "Último acesso: dd/mm/aaaa às hh:mm".
      Sem histórico, mostra o texto padrão atual.
- [x] H6. Catálogo "Disciplinas Disponíveis": cards de altura fixa com código, instituição, badge
      "De: dono" (compartilhada), período, nome (link), descrição, tópicos, contagens e "Abrir Caderno";
      disciplinas sem conteúdo mostram o texto "aguardando inserção...".
- [x] H7. Links de disciplinas compartilhadas levam `?owner=<id>`.

## Disciplina (`/:materia`)

- [x] M1. Resolução da disciplina: própria; com `?owner=` (compartilhada, admin ou permissão);
      senão procura entre as compartilhadas; inexistente → `/?error=materia_nao_encontrada`.
- [x] M2. Menu lateral: link "Todas as Matérias", código • instituição, nome (link) com badge
      "De: dono" se compartilhada, botão de download do HTML offline.
- [x] M3. Seletor de tag customizado: rótulo "Tag" (clicável), dica "(nenhuma selecionada)" /
      "(ativo: tag)", dropdown com busca, opção "-- Todas as Avaliações / Início --", opções com
      "(N questões)", ✓ na ativa, navegação por teclado (↓/↑/Esc/Enter/Espaço), fecha ao clicar fora,
      fecha o dropdown de tema ao abrir.
- [x] M4. Tags de outros usuários (mesmo código de disciplina, só na disciplina própria): toggle
      "Tags de outros: Ativado/Desativado" persistido em `study_show_other_tags`; opções com badge do
      dono; abrir com tag `user_<id>::<tag>` liga o toggle.
- [x] M5. Tag inicial: `?tag=` > tag do servidor > `study_selected_tag_<materia>`; trocar a tag
      atualiza `?tag=` (replaceState) e persiste.
- [x] M6. Sem tag: prompt central com nome, instituição • código, badge compartilhada e grade de
      cards de tags (capítulos/questões) que selecionam a tag; sumário e questões do menu mostram
      estados vazios.
- [x] M7. Com tag: barra "Tag selecionada: X" + "Outras tags" (limpa a tag), cabeçalho do caderno
      (instituição • código, nome, "período — Caderno Integral...", contagens), aviso quando a tag não
      tem capítulos, rodapé com link para o banco de questões da tag.
- [x] M8. Sumário "Conteúdo": quando há os dois tipos, grupos colapsáveis "Resumo da matéria" e
      "Estudo por questões" com estado ativo, chevron e expansão persistidos
      (`study_selected_section_<m>`, `study_toc_expanded_<m>_<grupo>`); clique no chevron só
      expande/recolhe; clique no grupo inativo troca a seção (`?type=`); senão lista direta.
- [x] M9. Sumário filtrado pela tag ativa (capítulos e subseções), grupo escondido se não tem itens,
      troca automática de seção quando a seção atual não tem capítulos da tag.
- [x] M10. Fluxo contínuo de capítulos da tag e seção: primeiro capítulo renderizado, demais
      carregados sob demanda ao se aproximar (600px) com placeholder "Avançando no material...",
      erro com "Tentar Novamente"; títulos "Capítulo N • Resumo da Matéria|Estudo por Questões",
      badge "De: dono" para capítulos de outros, descrição, divisor `* * *`.
- [x] M11. Ids de âncora: `cap-<n>`, `cap-materia-<n>`, `other-<owner>-...`; subseções pelos ids do
      frontmatter `sections`.
- [x] M12. Navegação do sumário: clique rola até a seção (suave se perto e já carregada, instantâneo
      senão, com correção após reflow), carrega capítulo lazy se preciso, troca de seção se o item é
      do outro grupo, atualiza o hash; no mobile fecha o menu.
- [x] M13. Scrollspy: item ativo destacado (`is-active`), capítulo pai (`is-parent-active`),
      auto-expansão do grupo, rolagem do item para a área visível, título da seção no cabeçalho
      mobile, último item ativo no fim da página.
- [x] M14. Restauração do hash ao recarregar (tenta até 15 vezes), sem animação.
- [x] M15. Questões no menu lateral: "Questões Resolvidas" + "Ver banco (N)" (link com tag/owner),
      até 5 itens da tag ativa, ordenados pelas acessadas recentemente
      (`study_recent_questions_<m>`), com animação FLIP ao reordenar, item atual destacado, badge
      "De: dono" para questões de outros; sem tag mostra estado vazio.
- [x] M16. Registro da última posição de estudo (`last_visited_subject`, `study_recent_materias`) ao
      carregar, ao mudar de seção ativa e ao esconder a aba.
- [x] M17. Download do HTML offline da disciplina (ver E1).

## Banco de questões (`/:materia/questoes`)

- [x] B1. Cabeçalho, barra de filtros: busca textual (título, enunciado, dono), select de tag
      (opções de outros usuários aparecem conforme o toggle), select de tópico.
- [x] B2. Contagem "N questões disponíveis" / "Exibindo X de Y questões.", "Limpar filtros".
- [x] B3. Select de tag sincronizado com o seletor do menu (nos dois sentidos).
- [x] B4. Lista de cards de questão (exercício • prova (ano), tópico, tipo, dificuldade, título,
      prévia do enunciado em uma linha, id, "Resolução"), selo "Compartilhada por" para questões de
      outros.

## Questão (`/:materia/questoes/:id`)

- [x] Q1. Resolução da questão: `q_owner` explícito, depois o dono principal, depois outras fontes;
      inexistente → `/<materia>/questoes?error=questao_nao_encontrada`.
- [x] Q2. Navegação superior: "← Banco de Questões" e "Ir para a Teoria do Capítulo →" (com tag e
      âncora `topicSlug`), selo "Compartilhada por", prova • ano.
- [x] Q3. Coluna esquerda fixa (sticky ≥1280px): cabeçalho (prova (ano) • tópico, tipo, título,
      dificuldade), enunciado renderizado, figuras clicáveis (zoom) com legenda, alternativas de
      múltipla escolha ou card "Questão Dissertativa Aberta".
- [x] Q4. Coluna direita: cards colapsáveis "§ Fundamentação Teórica Necessária" e "¶ Resolução Passo
      a Passo" ("Exibir/Ocultar"), gabarito oficial / resposta esperada dentro da resolução; ao abrir
      a resolução, destaca a alternativa correta; questões sem `<Resolution>` usam o corpo como painel.
- [x] Q5. Navegação inferior "Anterior/Próxima" dentro do escopo do dono, preservando owner/tag.
- [x] Q6. Tag ativa da questão: `?tag=` ou a primeira tag da questão (prefixada se de outro usuário).
- [x] Q7. Visita registra a questão em `study_recent_questions_<m>`.

## Conteúdo renderizado

- [x] C1. Markdown GFM (tabelas, listas, ênfase, links, imagens), HTML embutido (âncoras `<div id>`).
- [x] C2. Matemática `$...$` e `$$...$$` (KaTeX), sem interpretar `$` dentro de código; equações
      display consecutivas agrupadas em um card.
- [x] C3. Alertas `[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]` com título opcional.
- [x] C4. Blocos de código com Shiki em 5 temas (troca instantânea), cabeçalho com linguagem e botão
      "Copiar" → "Copiado!".
- [x] C5. Mermaid (bloco ```mermaid ou conteúdo com sintaxe Mermaid): carregado sob demanda, card com
      título (`%% title:`), tema conforme o tema do site (re-renderiza ao trocar), botão "Visualizar".
- [x] C6. `<BlockDiagram>` com presets, renderizado em SVG/KaTeX, botão "Visualizar" e duplo clique.
- [x] C7. `<QuestionCard id>`: card de prévia da questão (ou aviso "não encontrada"); sequências de
      mais de 2 cards mostram 2 e um botão "Ver mais N questões deste bloco" / "Recolher".
- [x] C8. Modal de zoom (diagramas e imagens): arrastar, roda do mouse no cursor, pinça, botões
      +/−/ajustar, teclas + − 0 Esc, fechar no X ou backdrop, trava a rolagem da página.
- [x] C9. Otimizador de tabelas: wrapper com rolagem horizontal, larguras por categoria de coluna,
      classes de linha; ao redimensionar, otimiza tabelas ainda não processadas (as já otimizadas
      mantêm as larguras).
- [x] C10. Imagens relativas (`./x.png`) servidas via `/api/media` com permissão.
- [x] C11. Comentários `{/* */}` e `<!-- -->` não aparecem.

## Configurações (`/configuracoes`)

- [x] S1. Menu lateral "Painel do Estudante" com "Voltar à Leitura" e atalhos para disciplinas.
- [x] S2. Botões "Fechar"/"Voltar à Leitura": voltam para a página anterior do mesmo site (se não for
      configurações), senão para a última posição de estudo, senão `/`.
- [x] S3. Rascunho vs. salvo: cada opção mostra a seleção do rascunho (borda) e o selo "Salvo";
      banner de status (verde sincronizado / âmbar pulsante com alterações pendentes).
- [x] S4. Opções: família tipográfica (4), tamanho (4 presets + campo 10–40px), largura (4 presets +
      campo 400–2500px), alinhamento (4), tema do código (5), fonte do código (4), tamanho do código
      (4 presets + campo 8–36px), escala de índices (4 presets + campo 30–100%), mínimo de fórmulas
      (4 presets + campo 0–30px). Badges com o valor salvo.
- [x] S5. Pré-visualização em tempo real (fonte, tamanho, largura, alinhamento, fórmulas, tabela,
      bloco de código com o tema escolhido) com meta "Fonte • tamanho • largura • alinhamento".
- [x] S6. "Salvar Alterações" (topo e rodapé) persiste em `localStorage` e aplica no documento;
      "Restaurar Padrões de Fábrica"; "Cancelar" → `/`.
- [x] S7. Cache do navegador: estatística "N itens em cache (~X KB)", "Limpar Cache do Navegador"
      (e botão do rodapé) limpa cache de estudo, questões recentes, estado do sumário,
      sessionStorage e Cache Storage, mostra feedback e recarrega.

## Conta (`/conta`)

- [x] A1. Perfil: inicial, nome, selo Administrador/Estudante, @usuário • ID, botão "Painel Admin"
      (admin), "Sair da Sessão" (`/api/logout`), número de disciplinas, limite de upload.
- [x] A2. Download do archive completo (`/api/download?type=archive`) e de uma matéria escolhida.
- [x] A3. Upload do archive completo: aviso destrutivo, digitar CONFIRMAR habilita, confirmação,
      estados do botão, feedback de sucesso/erro, limite de tamanho por perfil.
- [x] A4. Upload de matéria específica (slug + ZIP), substitui só aquela pasta.
- [x] A5. Validação do ZIP: extensões permitidas, path traversal, limite descompactado, pasta raiz
      única normalizada.

## Admin (`/admin`)

- [x] D1. Abas Usuários (N), Permissões (N), Logs.
- [x] D2. Usuários: tabela (ID, usuário, nome, perfil, criado em, ações Editar/Senha/Excluir — sem
      excluir a si mesmo), modal "Criar Novo Usuário" (validações do servidor), modal "Redefinir
      Senha" (invalida sessões do usuário), excluir com confirmação (remove archive; não remove o
      último admin).
- [x] D3. Permissões: formulário dono → matéria (lista do dono) → beneficiado; não permite dono =
      beneficiado; tabela com revogar.
- [x] D4. Logs: filtros (usuário, ação, busca em detalhes/usuário), paginação de 30, total; retenção
      `LOG_RETENTION_DAYS`; page views registradas no máximo a cada 5 min por sessão e rota.
- [x] D5. Alertas de sucesso que somem em 5s; recarga após criar/excluir/conceder/revogar.

## Export offline

- [x] E1. Arquivo HTML único da disciplina com cabeçalho, seletor de tema segmentado, seletor de
      tag e de capítulo, banco de questões com busca, cards de questão com teoria/resolução em
      `<details>`, gabarito, alertas, equações agrupadas, sequências de questões recolhidas e imagens
      embutidas em base64.

## Sync e APIs para ferramentas

- [x] Y1. `POST /api/login` (JSON ou form) devolve `Set-Cookie: session_id=...`.
- [x] Y2. Autenticação por cookie, `Authorization: Bearer <session>` ou `Basic`.
- [x] Y3. `GET /api/sync/status` → manifesto `{userId, username, generatedAt, files{path:{size,mtime,hash}}}`.
- [x] Y4. `POST /api/sync/push` (multipart `bundle` ZIP + `deletions` JSON) com validação de caminhos
      e extensões; remove diretórios vazios após deleções.
- [x] Y5. `POST /api/sync/pull` (`{"files": [...]}`) → ZIP com os arquivos pedidos.
- [x] Y6. `GET|POST /api/logout` (JSON ou redirect para `/login`).
- [x] Y7. `scripts/sync_archive.py` funciona sem alterações (dry-run, push, pull).
