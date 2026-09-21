---
name: question-study-generator
description: >-
  Gera cadernos teóricos completos e aprofundados baseados no conteúdo cobrado por provas e exames universitários,
  orquestrando subagentes para resolução paralela de questões e estruturando resumos contínuos em MDX/KaTeX no website de estudos acadêmico.
---

# Skill: Gerador de Cadernos Teóricos e Estudo por Questões (`question-study-generator`)

Esta skill orienta o assistente **Antigravity CLI** no processamento de notas de aula, ementas, materiais didáticos e avaliações universitárias (provas, testes e listas), orquestrando a geração de cadernos teóricos completos em fluxo contínuo e a resolução de questões de exames para o website acadêmico em Astro.

---

## 1. Diretriz de Ouro para a Geração do Texto Teórico

Ao redigir os cadernos e capítulos teóricos (`archive/<materia>/resumos/<slug>.mdx`), o assistente **deve seguir rigorosamente a seguinte diretriz metodológica**:

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

### Desdobramento Operacional dos 6 Pilares da Diretriz

| Pilar | Como Implementar na Prática | O Que Evitar a Todo Custo |
| :--- | :--- | :--- |
| **1. Teoria Suficiente e Auto-Contida** | O texto deve ensinar o tópico do zero, definindo cada variável e termo. O estudante deve ser capaz de acertar qualquer questão de prova sem precisar consultar livros ou slides externos. | Presumir conhecimento tácito prévio de fórmulas específicas ou omitir relações intermediárias necessárias para resolver questões. |
| **2. Simples, Direta e Rigorosa** | Usar frases claras, vocabulário acessível e rigor técnico exato (nomes formais de transformadas, teoremas e propriedades). | Linguagem empolada ou pedante; por outro lado, simplismos informais que perdem a precisão matemática/física. |
| **3. Foco em Resultados Práticos (Sem Demonstrações)** | Apresentar a equação pronta, a tabela de transformadas/propriedades, as condições de contorno e a interpretação física operacional. | Gastar parágrafos deduzindo identidades trigonométricas, limites assintóticos ou provas de teoremas. |
| **4. Estrutura Lógica e Sequencial** | Apresentar primeiro os blocos fundamentais (ex: período $T$, trem de impulsos, espectro contínuo) antes de abordar tópicos dependentes (amostragem, aliasing, filtro de reconstrução). | Explicar fenômenos avançados antes de definir suas variáveis fundamentais. |
| **5. Sem Introduções Clichês** | Iniciar o capítulo imediatamente na definição matemática e física do primeiro conceito. | Parágrafos vazios como "Neste capítulo exploraremos a fascinação do processamento de sinais digitais..." |
| **6. Detalhamento sem Medo de Textos Longos** | Aprofundar em cada detalhe, casos especiais, armadilhas clássicas de prova e parâmetros de contorno. Texto extenso e compreensível é bem-vindo. | Resumos telegráficos superficiais que economizam palavras às custas da clareza e do entendimento do aluno. |

---

## 2. Orquestração Concorrente com Subagentes na Resolução de Provas

Quando o objetivo do estudo envolver a extração e resolução de questões de avaliações, o assistente **deve aproveitar a capacidade de paralelização do Antigravity CLI através de subagentes (`invoke_subagent`)**.

### Quando Paralelizar?
* **Múltiplos Arquivos de Avaliação:** Quando houver mais de um arquivo de prova/teste disponível (por exemplo: `material/testes/teste-1-2024.pdf`, `material/testes/teste-2-2024.pdf`, `material/provas/p1-2023.pdf`, etc.).
* **Muitas Questões no Mesmo Exame:** Quando uma única avaliação contiver um volume expressivo de questões que possam ser distribuídas em lotes concorrentes.

### Padrão de Invocação de Subagentes

O agente orquestrador principal lança múltiplos subagentes concorrentes utilizando o tool `invoke_subagent`:

```json
{
  "Subagents": [
    {
      "TypeName": "self",
      "Role": "Resolvedor Teste 1 2024",
      "Prompt": "Utilize a skill explain-question para inspecionar, recortar imagens (se houver) e resolver todas as questões de 'material/testes/teste-1-2024.pdf'. Para cada questão, aplique o prompt fundamental: explique detalhadamente a teoria necessária (<Theory>) e então resolva passo a passo (<Resolution>), utilizando KaTeX nas fórmulas matemáticas ($...$ e $$...$$). Salve cada questão em 'archive/pds/questoes/teste-1-2024-qX.mdx'. Ao finalizar, responda com a lista de IDs das questões criadas e seus tópicos."
    },
    {
      "TypeName": "self",
      "Role": "Resolvedor Teste 2 2024",
      "Prompt": "Utilize a skill explain-question para inspecionar, recortar imagens (se houver) e resolver todas as questões de 'material/testes/teste-2-2024.pdf'. Para cada questão, aplique o prompt fundamental: explique detalhadamente a teoria necessária (<Theory>) e então resolva passo a passo (<Resolution>), utilizando KaTeX nas fórmulas matemáticas ($...$ e $$...$$). Salve cada questão em 'archive/pds/questoes/teste-2-2024-qX.mdx'. Ao finalizar, responda com a lista de IDs das questões criadas e seus tópicos."
    }
  ]
}
```

### Regras de Execução com Subagentes:
1. **Sem Polling ou Espera Ativa:** Após chamar `invoke_subagent`, **não faça polling**. Pare de chamar tools e aguarde as mensagens reativas que o sistema enviará quando cada subagente terminar.
2. **Delegação Especializada à Skill `explain-question`:** Cada subagente deve seguir as convenções estritas da skill `explain-question`:
   * Inspecionar e classificar questões (`multipla_escolha` vs `discursiva`).
   * Recortar figuras preservando contexto superior e fórmulas matemáticas.
   * Utilizar `<Theory>` para teoria prévia pedagógica e `<Resolution>` para o desenvolvimento algébrico.
   * Usar delimitadores KaTeX `$...$` no `statement`, nas opções (`options[].text`) e no gabarito (`correctOption` ou `expectedAnswer`).
3. **Consolidação pelo Orquestrador Principal:**
   * Assim que os subagentes retornarem, o agente principal colhe os tópicos cobrados e os IDs gerados.
   * Em seguida, redige ou aprimora o caderno teórico contínuo (`archive/<materia>/resumos/<slug>.mdx`), garantindo que a teoria cubra integralmente todos os pontos demandados pelas questões recém-resolvidas.
   * Adiciona os IDs em `relatedQuestions` no frontmatter e insere os cartões `<QuestionCard id="..." />` nos pontos estratégicos do caderno.

---

## 3. Ecossistema Integrado de Skills

```
                        ┌─────────────────────────────────────┐
                        │     question-study-generator        │
                        │    (Orquestrador Macro / Teoria)    │
                        └──────────────────┬──────────────────┘
                                           │
                 ┌─────────────────────────┴─────────────────────────┐
                 ▼                                                   ▼
┌─────────────────────────────────┐                 ┌─────────────────────────────────┐
│        explain-question         │                 │    block-diagram-generator      │
│  (Resolução Micro de Questões   │                 │   (Diagramas Vetoriais KaTeX    │
│  Paralelizável via Subagentes)  │                 │    para Controle, SLITs e PDS)  │
└─────────────────────────────────┘                 └─────────────────────────────────┘
```

1. **`question-study-generator` (Esta skill):**
   * Estrutura macro da disciplina (`archive/<materia>/materia.json`).
   * Cadernos teóricos em fluxo contínuo (`archive/<materia>/resumos/...`).
   * Aplicação rigorosa da **Diretriz de Ouro de Redação Teórica**.
   * Coordenação de subagentes para extração e resolução massiva de provas.
2. **`explain-question`:**
   * Execução pontual de cada exercício.
   * Toggles independentes de teoria e resolução com `.academic-prose`.
   * Imagens limpas com clique direto para visualizador interativo (zoom, pan, roda do mouse).
3. **`block-diagram-generator`:**
   * Geração e inserção de blocos vetoriais `<BlockDiagram />` integrados ao tema do site para sistemas em cascata, malha fechada, amostragem e processamento contínuo/discreto.

---

## 4. Estrutura dos Arquivos de Resumo (`archive/<materia>/resumos/<slug>.mdx`)

Cada capítulo do caderno é um arquivo `.mdx` independente que compõe o fluxo de leitura contínuo:

```mdx
---
materia: "pds" # Slug da disciplina
title: "Capítulo 2: Amostragem de Sinais em Tempo Contínuo"
topic: "Amostragem e Aliasing"
chapter: 2
order: 2
description: "Teoria completa de amostragem periódica, critério de Nyquist, espectros de réplicas e reconstrução ideal."
relatedQuestions:
  - "teste-1-2024-q1"
  - "teste-1-2024-q2"
  - "teste-1-2024-q3"
  - "teste-1-2024-q4"
sections:
  - id: "cap-2-relacoes-frequencia"
    title: "2.1 Relações Fundamentais de Frequência"
  - id: "cap-2-espectro-amostragem"
    title: "2.2 Espectro na Modulação por Trem de Impulsos"
  - id: "cap-2-nyquist-reconstrucao"
    title: "2.3 Critério de Nyquist e Filtros Ideais"
---

<div id="cap-2-relacoes-frequencia"></div>

## 2.1 Relações Fundamentais de Frequência

Dado um período de amostragem $T$ (segundos), a taxa de amostragem temporal contínua é $f_s = \frac{1}{T}$ e a correspondente frequência angular é:
$$\omega_s = \frac{2\pi}{T} \quad [\text{rad/s}]$$

A relação direta de conversão entre a frequência contínua $\Omega$ (em rad/s) e a frequência angular discreta normalizada $\omega$ (em radianos) é dada pela equação de escala:
$$\omega = \Omega T$$

<BlockDiagram
  title="Cadeia Completa de Amostragem e Reconstrução Ideal"
  preset="sampling"
/>

<div id="cap-2-espectro-amostragem"></div>

## 2.2 Espectro na Modulação por Trem de Impulsos

Ao modular um sinal contínuo $x_c(t)$ por um trem periódico ideal de impulsos unitários $p(t) = \sum_{n=-\infty}^{+\infty} \delta(t - nT)$, o sinal amostrado no tempo é:
$$x_p(t) = x_c(t) \cdot p(t) = \sum_{n=-\infty}^{+\infty} x_c(nT)\,\delta(t - nT)$$

No domínio da frequência contínua, o espectro resultante $X_p(j\Omega)$ consiste em cópias periódicas do espectro original $X_c(j\Omega)$ escaladas por $\frac{1}{T}$:
$$X_p(j\Omega) = \frac{1}{T} \sum_{k=-\infty}^{+\infty} X_c(j(\Omega - k\omega_s))$$

* **Réplica Central ($k = 0$):** Mantém o formato original do sinal contínuo com amplitude multiplicada por $\frac{1}{T}$.
* **Réplicas Laterais ($k \neq 0$):** Cópias centradas em múltiplos inteiros da frequência de amostragem $\pm \omega_s, \pm 2\omega_s, \dots$.

<!-- Card interativo da questão referente a este tópico -->
<QuestionCard id="teste-1-2024-q4" />
<QuestionCard id="teste-1-2024-q1" />
```

---

## 5. Como Adicionar Novas Disciplinas do Zero

1. **Criar a pasta da disciplina:** `archive/<slug-da-materia>/`
2. **Criar o manifesto da disciplina (`archive/<slug-da-materia>/materia.json`):**
   ```json
   {
     "slug": "sistemas-lineares",
     "name": "Sinais e Sistemas Lineares",
     "code": "PTC3214",
     "institution": "Escola Politécnica da USP",
     "period": "P1",
     "description": "Transformada de Fourier contínua e discreta, SLITs, convolução e amostragem.",
     "status": "active",
     "topics": [
       "Sinais Básicos e Convolução",
       "Série de Fourier",
       "Transformada de Fourier Contínua",
       "Amostragem e Reconstrução"
     ]
   }
   ```
3. **Criar subpastas:**
   * `archive/<slug-da-materia>/resumos/` (para os capítulos teóricos `.mdx`)
   * `archive/<slug-da-materia>/questoes/` (para as questões geradas pela skill `explain-question`)
4. **Executar o Pipeline:**
   * Orquestrar subagentes para resolução dos exames existentes da matéria.
   * Gerar os cadernos teóricos em fluxo contínuo obedecendo à **Diretriz de Ouro**.
   * Validar a compilação com `npm run build` no diretório `site/`.
