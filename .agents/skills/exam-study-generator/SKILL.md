---
name: exam-study-generator
description: >-
  Lê e analisa materiais teóricos e notas de aula de disciplinas universitárias (como PDS e Sistemas Lineares),
  gerando cadernos teóricos em fluxo contínuo formatados em MDX/KaTeX no estilo clássico e acadêmico para o website Astro de estudos.
---

# Skill: Gerador de Cadernos Acadêmicos e Síntese de Conteúdo (`exam-study-generator`)

Esta skill capacita o assistente **Antigravity CLI** a processar notas de aula, ementas e materiais teóricos universitários, sintetizando cadernos de estudo completos em fluxo contínuo no padrão estético clássico de livro didático.

---

## 1. Princípios de Design e Estética Acadêmica

O site adota um design sóbrio, minimalista e clássico, com:
* **Tipografia de Livro**: Fontes serifadas clássicas (`Newsreader`, `EB Garamond`, `Lora`, `Charter`), proporções áureas de entrelinha (`leading-[1.78]`) e caixas de teoremas acadêmicas.
* **3 Modos de Leitura**:
  - **Papel / Sépia (`theme-paper`)**: Fundo marfim quente levemente amarelado (`#fbf8f2`) com tinta carvão suave.
  - **Escuro Clássico (`theme-dark`)**: Fundo carvão biblioteca (`#151619`) suave para leitura noturna.
  - **Preto OLED Puro (`theme-oled`)**: Fundo `#000000` para economia máxima de bateria e contraste em telas OLED.
* **Leitura Contínua em Página Única**: O caderno completo da disciplina é lido em um fluxo contínuo em `/[materia]` (ex: `/pds`), permitindo ao aluno rolar por todos os capítulos ou saltar diretamente através do sumário na barra lateral esquerda fixa.
* **Suporte Multi-Disciplinas**: O portal `/` permite selecionar entre diferentes matérias (ex: `pds`, `sistemas-e-sinais`, etc.).

---

## 2. Delegação para a Skill `explain-question` (Questões e Provas)

> [!IMPORTANT]
> Toda a lógica de **extração de questões** de provas/testes em PDF, **explicação teórica prévia detalhada**, **resolução matemática passo a passo** e suporte a **questões de múltipla escolha e dissertativas abertas** foi centralizada na skill especializada **`explain-question`**.

Ao processar avaliações, testes ou bancos de exercícios para integrar ao caderno da matéria:
1. Utilize a skill **`explain-question`** para inspecionar, renderizar e gerar os arquivos em `archive/<materia>/questoes/<slug>.mdx`.
2. A skill `explain-question` garante a separação metodológica essencial:
   * Explicação teórica prévia profunda em bloco `<Theory>`.
   * Resolução analítica passo a passo em bloco `<Resolution>`.
   * Toggles independentes no site para permitir estudo ativo.
   * Suporte a múltipla escolha e questões dissertativas abertas.
3. No caderno teórico (`archive/<materia>/resumos/<slug>.mdx`), vincule a questão no frontmatter `relatedQuestions` e insira o cartão chamador no corpo do texto:
   ```mdx
   <QuestionCard id="slug-da-questao" />
   ```

---

## 3. Padrão dos Arquivos de Resumos Teóricos (`archive/<materia>/resumos/<slug>.mdx`)

Todo o conteúdo dos capítulos é armazenado na pasta `archive/<materia>/resumos/`:

```mdx
---
materia: "pds" # Slug da disciplina
title: "Capítulo 3: Sinais e SLITs de Tempo Discreto"
topic: "Sistemas Lineares e Convolução"
chapter: 3
order: 3
description: "Síntese dos conceitos de SLITs, convolução e equações de diferenças..."
relatedQuestions:
  - "teste-2-2024-q1"
  - "teste-2-2024-q2"
sections:
  - id: "cap-3-sinais"
    title: "3.1 Sinais Elementares"
  - id: "cap-3-convolucao"
    title: "3.2 Soma de Convolução Discreta"
---

<div id="cap-3-sinais"></div>

## 3.1 Sinais Elementares
Texto explicativo com fórmulas KaTeX inline `$x[n]$` e display `$$...$$`...

<QuestionCard id="teste-2-2024-q1" />
```

---

## 4. Como Adicionar, Modificar ou Remover Disciplinas e Capítulos

1. **Adicionar ou alterar um resumo/capítulo**:
   - Basta criar ou editar o arquivo `.mdx` em `archive/<materia>/resumos/<slug>.mdx`.
2. **Adicionar ou alterar uma questão resolvida**:
   - Utilize a skill `explain-question` para criar ou editar em `archive/<materia>/questoes/<slug>.mdx`.
3. **Adicionar uma nova matéria completa**:
   - Crie a pasta `archive/<nova-materia>/` com um arquivo `materia.json`:
     ```json
     {
       "slug": "controle-1",
       "name": "Sistemas de Controle I",
       "code": "PTC3420",
       "institution": "Escola Politécnica da USP",
       "period": "P1",
       "description": "Lugar das raízes, resposta em frequência...",
       "status": "active",
       "topics": ["Lugar das Raízes", "Nyquist", "Margens de Ganho/Fase"]
     }
     ```
   - Crie as pastas `archive/<nova-materia>/resumos/` e `archive/<nova-materia>/questoes/`.
   - O site descobre dinamicamente a matéria, contabiliza automaticamente os capítulos e questões e gera todas as rotas e sumários!

---

## 5. Uso da Skill de Diagramas de Blocos (`block-diagram-generator`)

Ao produzir ou atualizar cadernos de estudo (resumos) que envolvam **Sistemas de Controle**, **Sinais e Sistemas** e **Processamento Digital de Sinais (PDS)**, o assistente pode e deve utilizar a skill **`block-diagram-generator`** para ilustrar diagramas em blocos vetoriais nítidos em KaTeX (`<BlockDiagram />`).
