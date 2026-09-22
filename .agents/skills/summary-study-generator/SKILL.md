---
name: summary-study-generator
description: >-
  Gera cadernos teóricos completos e aprofundados a partir de materiais didáticos da disciplina (slides de aula,
  apostilas, notas e PDFs), extraindo diagramas e imagens relevantes com utilitário oficial e estruturando resumos
  contínuos em MDX/KaTeX sob a aba 'Resumo da matéria' no website acadêmico.
---

# Skill: Gerador de Resumos Teóricos a partir de Materiais (`summary-study-generator`)

Esta skill orienta o assistente no processamento de materiais didáticos de disciplinas universitárias (slides de aula, notas de aula, apostilas, ementas e capítulos de livros em PDF/texto). Ela gera cadernos teóricos completos em fluxo contínuo, fazendo **apenas os resumos conceituais** (sem a necessidade de vincular questões ou cartões de exercícios), com suporte a extração criteriosa de imagens e diagramas úteis.

---

## 1. Diretriz de Ouro para a Geração do Resumo Teórico

Ao redigir os cadernos e capítulos de resumo (`archive/<materia>/resumos/<slug>.mdx` ou `archive/<materia>/resumos/materia/<slug>.mdx`), o assistente **deve seguir rigorosamente a seguinte filosofia metodológica**:

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

### Desdobramento Operacional dos 6 Pilares da Diretriz

| Pilar | Como Implementar na Prática | O Que Evitar a Todo Custo |
| :--- | :--- | :--- |
| **1. Teoria Suficiente e Auto-Contida** | O texto deve ensinar o tópico do zero, definindo cada variável, unidade e termo operacional. O estudante deve ser capaz de resolver qualquer problema prático da matéria sem precisar consultar materiais externos. | Presumir conhecimento tácito prévio de fórmulas específicas ou omitir relações intermediárias necessárias. |
| **2. Simples, Direta e Rigorosa** | Usar frases claras, vocabulário acessível e rigor técnico exato (nomes formais de transformadas, teoremas, modelos e propriedades). | Linguagem rebuscada ou pedante; por outro lado, simplismos informais que percam o rigor físico ou matemático. |
| **3. Foco em Resultados Práticos (Sem Demonstrações)** | Apresentar a equação pronta, tabelas operacionais de propriedades, condições de contorno e interpretação física prática. | Gastar espaço deduzindo identidades analíticas, limites assintóticos ou desenvolvendo provas formais de teoremas. |
| **4. Estrutura Lógica e Sequencial** | Apresentar primeiro os conceitos fundamentais antes dos tópicos que dependem deles (ex: definição de sinais antes de sistemas; transformada no tempo contínuo antes da discretização). | Explicar fenômenos complexos ou derivados antes de definir seus blocos fundamentais. |
| **5. Sem Introduções Clichês** | Iniciar o capítulo imediatamente na definição formal do primeiro conceito e nas relações matemáticas. | Parágrafos vazios do tipo "Nesta aula veremos a fascinante importância desta disciplina para o mundo da engenharia..." |
| **6. Detalhamento sem Medo de Textos Longos** | Aprofundar em cada detalhe, casos particulares, armadilhas clássicas e condições operacionais. Textos longos, ricos e densos são incentivados desde que agreguem real compreensão. | Resumos telegráficos superficiais ou tópicos rasos que economizam palavras em detrimento do aprendizado real. |

---

## 2. Separação Obrigatória por Tags / Avaliações

Todos os cadernos teóricos no website acadêmico são organizados e filtrados por **tags de avaliação** (ex: `teste-1`, `teste-2`, `p1`, `prova-2`, `sub`).

> ### ⚠️ REGRA CRÍTICA DE INTERAÇÃO COM O USUÁRIO (OBRIGATÓRIA):
> Ao invocar a skill `summary-study-generator` ou ao receber do usuário um pedido para gerar resumos a partir de materiais:
> 
> 1. O assistente **DEVE VERIFICAR** se o usuário forneceu explicitamente o nome da tag (ex: `teste-1`, `teste-2`, `p1`, `prova-2`).
> 2. Se o usuário **NÃO forneceu o nome da tag**, o assistente **DEVE OBRIGATORIAMENTE PARAR e perguntar diretamente ao usuário antes de tomar qualquer outra ação**:
>    > *"Por favor, informe o nome da tag ou avaliação para este resumo (por exemplo: `teste-1`, `teste-2`, `p1` ou `prova-2`)."*
> 3. Nenhuma geração de arquivos `.mdx` pode ocorrer sem que a tag de destino esteja definida.
> 4. Todos os arquivos gerados devem receber a tag definida no campo `tags: ["<tag>"]` do seu frontmatter.

---

## 3. Extração Criteriosa de Imagens e Diagramas

A skill conta com o utilitário oficial `.agents/skills/summary-study-generator/scripts/extract_material_images.py`.

### Critério Rigoroso de Relevância
> **FAÇA A EXTRAÇÃO DA IMAGEM APENAS SE FOR REALMENTE RELEVANTE E ÚTIL PARA A COMPREENSÃO E EXPLICAÇÃO DO CONTEÚDO.**
> 
> * **O QUE EXTRAIR:** Diagramas esquemáticos de sistemas, circuitos elétricos/lógicos, gráficos de resposta em frequência, curvas características, espectros de sinais, desenhos de transdutores/sensores e tabelas gráficas que seriam inviáveis de expressar em texto simples.
> * **O QUE NÃO EXTRAIR:** Slides puramente textuais, capas de apresentação, logotipos institucionais, fotos decorativas, ilustrações abstratas ou qualquer elemento que não contribua diretamente para o entendimento técnico do conteúdo.

### Utilitário Oficial de Extração

O script fornece comandos dedicados para lidar com materiais em PDF:

```bash
# 1. Inspecionar o material (ver total de páginas, imagens embutidas e tópicos)
python3 .agents/skills/summary-study-generator/scripts/extract_material_images.py inspect <caminho_do_material.pdf>

# 2. Recortar diagrama ou figura de uma página específica com alta resolução (200 DPI)
python3 .agents/skills/summary-study-generator/scripts/extract_material_images.py crop <caminho_do_material.pdf> \
  --page <NUM> \
  --output site/public/images/resumos/<materia>/<nome_descritivo>.png \
  --padding 20

# 3. Renderizar slide inteiro quando o slide for um esquema gráfico completo
python3 .agents/skills/summary-study-generator/scripts/extract_material_images.py render-page <caminho_do_material.pdf> \
  --page <NUM> \
  --output site/public/images/resumos/<materia>/<nome_descritivo>.png
```

### Inserção da Imagem no MDX
As imagens salvas em `site/public/images/resumos/<materia>/` ficam automaticamente acessíveis no website pela raiz `/images/resumos/<materia>/...`. No texto MDX, insira a figura com legenda descritiva:

```markdown
![Diagrama de Blocos do Filtro FIR em Forma Direta](/images/resumos/pds/filtro-fir-forma-direta.png)
```

---

## 4. Estrutura dos Arquivos de Resumo da Matéria

Os arquivos de resumo gerados por esta skill devem ser salvos em `archive/<materia>/resumos/<slug>.mdx` ou `archive/<materia>/resumos/materia/<slug>.mdx`.

### Frontmatter Obrigatório com `type: "materia"`
O campo `type: "materia"` identifica este resumo como pertencente à aba **"Resumo da matéria"** no menu lateral:

```mdx
---
materia: "pds"          # Slug da disciplina cadastrada em archive/<materia>/materia.json
type: "materia"         # OBRIGATÓRIO: Identifica como 'Resumo da matéria'
tags:
  - "teste-1"           # Tag associada à avaliação (ex: teste-1, p1)
title: "Capítulo 1: Fundamentos de Processamento de Sinais"
topic: "Introdução e Sinais Básicos"
chapter: 1
order: 1
description: "Definição operacional de sinais de tempo contínuo e discreto, amostragem, energia e potência."
sections:
  - id: "sec-1-definicao-sinais"
    title: "1.1 Definição e Classificação de Sinais"
  - id: "sec-1-energia-potencia"
    title: "1.2 Energia e Potência de Sinais"
---

<div id="sec-1-definicao-sinais"></div>

## 1.1 Definição e Classificação de Sinais

Um sinal contínuo $x(t)$ é definido para todo $t \in \mathbb{R}$. A versão discreta $x[n]$ é uma sequência indexada por inteiros $n \in \mathbb{Z}$.

![Esquema do Processo de Amostragem Periódica](/images/resumos/pds/esquema-amostragem.png)

... (explicação detalhada, fórmulas com KaTeX $, $$, diagramas se necessários) ...
```

### Principais Diferenças em Relação a `question-study-generator`
* **Não precisa vincular questões:** Não utiliza `relatedQuestions` no frontmatter nem insere `<QuestionCard id="..." />` no corpo do texto.
* **Foco no Material Didático:** A fonte primária são os slides, aulas e apostilas do professor.
* **Agrupamento Automático no Menu Lateral:** No menu lateral do site, este resumo é automaticamente categorizado dentro da aba colapsável **"Resumo da matéria"**, separada da aba **"Estudo guiado por questões"**.

---

## 5. Higiene de Arquivos e Diretrizes de Workspace

1. **Proibição Absoluta de Arquivos Soltos na Raiz (`.`):**
   * Não crie scripts `.py`, `.sh` ou dumps de imagens na raiz do repositório.
   * Utilize exclusivamente o utilitário `.agents/skills/summary-study-generator/scripts/extract_material_images.py`.
2. **Destino de Imagens:**
   * Todas as imagens extraídas devem ser gravadas diretamente em `site/public/images/resumos/<materia>/`.
3. **Limpeza de Arquivos Temporários:**
   * O script oficial gerencia limpeza interna automaticamente via diretórios temporários. Se qualquer teste manual for realizado, exclua os rascunhos antes de finalizar o turno.
4. **Validação do Build:**
   * Sempre execute `npm run build` na pasta `site/` após criar novos cadernos para certificar a compilação de todas as páginas e rotas estáticas.
