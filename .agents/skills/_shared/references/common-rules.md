# Regras Comuns a Todas as Skills

Referência obrigatória para todas as skills. Estas regras se aplicam a toda geração de conteúdo MDX.

---

## 1. Destino de Arquivos

| Tipo de arquivo | Destino | Referência no MDX |
|---|---|---|
| Questões resolvidas (.mdx) | `archive/<materia>/questoes/` | — |
| Imagens de questões (.png) | `archive/<materia>/questoes/` | `image: "./<nome>.png"` |
| Resumos teóricos (.mdx) | `archive/<materia>/resumos/` | — |
| Resumos de matéria (.mdx) | `archive/<materia>/resumos/materia/` | — |
| Imagens de resumos (.png) | mesmo diretório do .mdx | `![Legenda](./<nome>.png)` |

**Proibições absolutas:**
- Nunca salve imagens em `site/public/`.
- Nunca crie arquivos na raiz do projeto (`.`).

---

## 2. Higiene de Workspace

1. Use exclusivamente os scripts oficiais em `.agents/skills/*/scripts/`.
2. Se criar qualquer arquivo temporário, delete-o com `rm` antes de finalizar.
3. Ao concluir, inspecione o diretório de trabalho — apenas os arquivos finais devem existir.

---

## 3. KaTeX no MDX

### Sintaxe básica
- Inline: `$...$`
- Display: `$$...$$` — sempre com **linhas em branco** antes e depois

### Alinhamento multi-linha
```latex
$$
\begin{aligned}
  x &= a + b \\
  y &= c + d
\end{aligned}
$$
```

### Armadilhas comuns e como evitar

| Problema | Errado | Correto |
|---|---|---|
| Pipe em tabelas MDX | `$\|x\|$` | `$\lVert x \rVert$` |
| Texto em fórmulas | `$R_{total}$` | `$R_{\text{total}}$` |
| Chaves literais | `$\{a,b\}$` | `$\lbrace a,b \rbrace$` ou `$\\{a,b\\}$` |
| Ambiente align (não existe em KaTeX) | `\begin{align}` | `\begin{aligned}` |
| Quebra de linha no display math | Sem `\\` ao final | Sempre usar `\\` entre linhas no `aligned` |
| Display math colado no texto | `texto$$x=1$$texto` | Linha em branco antes e depois de `$$` |
| Subscrito com múltiplos caracteres | `$x_ab$` | `$x_{ab}$` |
| Fração sem grupo | `$1/2x$` (ambíguo) | `$\frac{1}{2}x$` |

### Boas práticas
- Use `\text{}` para unidades e rótulos dentro de math: `$f_s = 1000\;\text{Hz}$`
- Escape backslashes duplos em YAML frontmatter: `"$2\\cos(30\\pi t)$"`
- Em MDX, `\\` dentro de display math funciona normalmente (não precisa de escape extra)

---

## 4. Frontmatter Obrigatório

### Questões (`archive/<materia>/questoes/*.mdx`)
```yaml
---
materia: "<slug>"           # obrigatório
tags: ["<tag>"]             # obrigatório (ex: teste-1, p1)
id: "<slug-unico>"         # obrigatório (ex: teste-1-2024-q1)
title: "<titulo>"           # obrigatório
exam: "<nome-da-prova>"    # obrigatório
year: <ano>                 # obrigatório (inteiro)
topic: "<topico>"           # obrigatório
topicSlug: "<slug-topico>"  # obrigatório
difficulty: "Fácil|Médio|Difícil"  # obrigatório
type: "multipla_escolha|discursiva"  # obrigatório
statement: "<enunciado>"    # obrigatório (com KaTeX escapado)
# Para multipla_escolha:
options:
  - label: "A"
    text: "<texto-com-KaTeX>"
correctOption: "A"
# Para discursiva:
expectedAnswer: "<resposta>"  # opcional
# Imagens:
image: "./<figura>.png"       # opcional
---
```

### Resumos teóricos (estudo guiado por questões)
```yaml
---
materia: "<slug>"
tags: ["<tag>"]
title: "<titulo>"
topic: "<topico>"
chapter: <numero>            # inteiro
order: <numero>              # inteiro
description: "<descricao>"
relatedQuestions: ["<id-1>", "<id-2>"]  # opcional
sections:                    # opcional
  - id: "<anchor-id>"
    title: "<titulo-secao>"
---
```

### Resumos de matéria (tipo "materia")
```yaml
---
materia: "<slug>"
type: "materia"              # obrigatório para resumos de matéria
tags: ["<tag>"]
title: "<titulo>"
topic: "<topico>"
chapter: <numero>
order: <numero>
description: "<descricao>"
sections:
  - id: "<anchor-id>"
    title: "<titulo-secao>"
---
```

---

## 5. Validação

Após gerar arquivos MDX, execute o validador:
```bash
python3 .agents/skills/_shared/scripts/validate_mdx.py archive/<materia>/questoes/*.mdx
python3 .agents/skills/_shared/scripts/validate_mdx.py archive/<materia>/resumos/*.mdx
```

Este script verifica frontmatter, KaTeX balanceado, presença de `<Theory>`/`<Resolution>` em questões, e existência de imagens referenciadas.

---

## 6. Diretriz de Qualidade para Texto Teórico

Ao redigir qualquer texto teórico (resumos contínuos ou seções `<Theory>`), siga o princípio fundamental correspondente:

### Para Cadernos Teóricos de Provas (`question-study-generator`):
> **"Faça uma explicação teórica completa que aborde todo o conteúdo cobrado pelas provas. O conteúdo deve ser o suficiente para resolver todas as questões das provas sem conhecimento prévio dos tópicos abordados.**
>
> **A explicação deve ser direta ao ponto e de fácil entendimento, use linguagem simples e precisa (mantenha as explicações e termos corretos, não faça simplificações que prejudiquem a precisão do conteúdo).**
>
> **Pule demonstrações, foque em resultados práticos.**
>
> **Organize a estrutura do texto de forma lógica e sequencial, os assuntos que se estudam antes devem ser explicados antes.**
>
> **Não perca tempo com introduções, vá direto para a teoria.**
>
> **Faça um texto detalhado explicando todos os tópicos, não tenha medo de textos longos, o importante é passar todos os conteúdos de maneira compreensível!"**

### Para Resumos de Matéria a partir de Slides/Livros (`summary-study-generator`):
> **"Faça uma explicação teórica completa que abranja todo o conteúdo abordado pelo material. O conteúdo deve ser o suficiente para aprender toda a matéria, não presuma que o leitor já sabe partes do conteúdo.**
>
> **A explicação deve ser direta ao ponto e de fácil entendimento, use linguagem simples e precisa (mantenha as explicações e termos corretos, não faça simplificações que prejudiquem a precisão do conteúdo).**
>
> **Pule demonstrações, foque em resultados práticos.**
>
> **Organize a estrutura do texto de forma lógica e sequencial, os assuntos que se estudam antes devem ser explicados antes.**
>
> **Não perca tempo com introduções, vá direto para a teoria.**
>
> **Faça um texto detalhado explicando todos os tópicos, não tenha medo de textos longos, o importante é passar todos os conteúdos de maneira compreensível!"**

### Desdobramento Operacional dos 6 Pilares

| Pilar | Faça | Nunca faça |
|---|---|---|
| **Auto-contido** | Ensine do zero, defina cada variável e termo | Presumir conhecimento prévio |
| **Direto e rigoroso** | Frases claras + termos formais corretos | Linguagem empolada OU imprecisa |
| **Resultados práticos** | Equação pronta, tabelas, condições de contorno | Demonstrações e provas de teoremas |
| **Ordem lógica** | Pré-requisitos antes de tópicos que dependem deles | Tópicos avançados antes dos fundamentos |
| **Sem introduções clichê** | Comece direto na definição do primeiro conceito | "Neste capítulo veremos a importância..." |
| **Detalhado** | Aprofunde em cada detalhe, textos longos são bem-vindos | Resumos telegráficos superficiais |
