---
name: exam-study-generator
description: >-
  Lê e analisa provas anteriores em PDF e notas de aula de disciplinas universitárias (como PDS e Sistemas Lineares),
  gerando cadernos teóricos em fluxo contínuo e questões resolvidas passo a passo formatadas em MDX/KaTeX
  no estilo clássico e acadêmico para o website Astro de estudos.
---

# Skill: Gerador de Cadernos Acadêmicos e Testes Resolvidos (`exam-study-generator`)

Esta skill capacita o assistente **Antigravity CLI** a processar provas e materiais teóricos em PDF, sintetizando cadernos de estudo completos e resolvendo testes no padrão estético clássico de livro didático universitário.

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

## 2. Script Auxiliar (`scripts/extract_exam.py`)

Localização: `./.agents/skills/exam-study-generator/scripts/extract_exam.py`

### Comandos:
```bash
# Inspecionar enunciados e alternativas de um teste em PDF
python3 .agents/skills/exam-study-generator/scripts/extract_exam.py inspect material/testes/teste-2-2024.pdf

# Renderizar páginas em PNG para recorte de figuras
python3 .agents/skills/exam-study-generator/scripts/extract_exam.py render-pages material/testes/teste-2-2024.pdf --outdir site/public/images/questoes

# Gerar esqueletos .mdx vinculados à matéria correta
# Gerar esqueletos .mdx vinculados à matéria correta
python3 .agents/skills/exam-study-generator/scripts/extract_exam.py scaffold material/testes/teste-2-2024.pdf --materia pds
```

---

## 3. Padrão dos Arquivos de Conteúdo no `archive/`

Todo o conteúdo acadêmico é armazenado na pasta **`archive/`** (irmã da pasta `site/`), estruturado por matéria:

### 3.1 Resumos Teóricos (`archive/<materia>/resumos/<slug>.mdx`)
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

### 3.2 Questões Resolvidas (`archive/<materia>/questoes/<slug>.mdx`)
```mdx
---
materia: "pds"
id: "teste-2-2024-q1"
title: "Associação em Cascata de Sistemas e Convolução"
exam: "Teste 2"
year: 2024
topic: "Sistemas Lineares e Convolução"
topicSlug: "cap-3-slits-convolucao"
difficulty: "Médio"
statement: "Enunciado fiel da questão..."
image: "/images/questoes/diagrama.png" # opcional se houver imagem
options:
  - label: "A"
    text: "..."
  - label: "B"
    text: "..."
correctOption: "A"
---

### Resolução Passo a Passo

#### 1. Conceito Fundamental
...
#### 2. Desenvolvimento Algébrico e Fórmulas
...
#### 3. Conclusão e Gabarito
Portanto, a alternativa correta é a **(A)**.
```

---

## 4. Como Adicionar, Modificar ou Remover Páginas e Disciplinas

O sistema foi arquitetado para máxima simplicidade operacional diretamente no sistema de arquivos:

1. **Adicionar ou alterar um resumo/capítulo**:
   - Basta criar ou editar o arquivo `.mdx` em `archive/<materia>/resumos/<slug>.mdx`.
2. **Adicionar ou alterar uma questão resolvida**:
   - Basta criar ou editar o arquivo `.mdx` em `archive/<materia>/questoes/<slug>.mdx`.
3. **Remover uma página**:
   - Exclua o respectivo arquivo `.mdx` de dentro da pasta `archive/<materia>/resumos/` ou `archive/<materia>/questoes/`.
4. **Adicionar uma nova matéria completa**:
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
5. **Remover uma matéria**:
   - Basta apagar a pasta `archive/<materia>/`.
