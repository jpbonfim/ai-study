---
name: explain-question
description: >-
  Extrai questões (múltipla escolha e dissertativas abertas) de provas e listas em PDF/texto,
  explicando detalhadamente a teoria necessária antes da resolução e resolvendo passo a passo
  em MDX/KaTeX com toggles independentes para o website acadêmico Astro.
---

# Skill: Resolução Pedagógica de Questões e Extração (`explain-question`)

Esta skill orienta o assistente **Antigravity CLI** na extração de questões de avaliações (provas, testes e listas) e na elaboração de resoluções de alto nível acadêmico para o website de estudos.

---

## 1. Filosofia de Estudo Ativo e Prompt Fundamental

Ao estudar por questões, o estudante utiliza o seguinte princípio metodológico:

> **"Para cada questão que você resolver primeiro explique detalhadamente a teoria necessária para resolver a questão, e então resolva a questão passo a passo."**

### Por que essa separação é crucial?
1. **Estudo Ativo:** O estudante pode abrir inicialmente apenas a **Explicação Teórica**, revisando conceitos, fórmulas e teoremas aplicáveis para então **tentar resolver a questão por conta própria**.
2. **Sem Spoilers na Teoria:** A seção teórica **não deve conter spoilers** nem os cálculos específicos da questão. Ela apresenta a fundamentação geral, as definições matemáticas e as condições de contorno necessárias para o problema.
3. **Resolução Passo a Passo e Gabarito:** Fica guardada em um bloco separado, revelado somente quando o estudante deseja conferir o raciocínio algébrico completo e o gabarito.

---

## 2. Arquitetura no Site Astro: Seções Expansíveis Independentes

No site, a explicação teórica e a resolução são apresentadas como **duas caixas retangulares estreitas e elegantes** com toggles 100% independentes:
* O estudante clica diretamente na caixa retangular **`[ § ] Explicação Teórica Necessária`** para abrir/ocultar apenas a fundamentação teórica.
* O estudante clica diretamente na caixa retangular **`[ ¶ ] Resolução Passo a Passo`** para abrir/ocultar a resolução.
* **Gabarito Integrado:** O gabarito oficial (ou resposta esperada) aparece **diretamente dentro da seção de resolução**, revelando-se apenas quando o aluno decide abrir o passo a passo.
* **Renderização Idêntica aos Resumos:** O conteúdo interno utiliza a classe `.academic-prose`, garantindo exatamente o mesmo padrão tipográfico dos cadernos teóricos: títulos hierárquicos estilizados, marcadores geométricos de tópicos e listas (`ul`/`ol`), caixas acadêmicas e KaTeX.

### Componentes MDX Nativos
No corpo de cada arquivo de questão (`archive/<materia>/questoes/<slug>.mdx`), utilize sempre os componentes `<Theory>` e `<Resolution>`:

```mdx
<Theory>

### Fundamentação Teórica Necessária

#### 1. Conceito Central
Definições teóricas gerais, fórmulas KaTeX $...$ e $$...$$

#### 2. Teoremas e Condições
Propriedades e condições de contorno necessárias.

</Theory>

<Resolution>

### Resolução Passo a Passo

#### 1. Análise dos Dados
Identificação dos dados fornecidos no enunciado.

#### 2. Desenvolvimento Algébrico
Demonstrações e contas passo a passo.

#### 3. Conclusão e Gabarito
Identificação da alternativa correta ou resultado analítico final.

</Resolution>
```

> **Nota:** Não é necessário importar `<Theory>` ou `<Resolution>` dentro do arquivo MDX; eles já são injetados automaticamente pela rota de renderização do Astro (`[slug].astro`).

---

## 3. Suporte aos Tipos de Questões

A skill suporta tanto **questões de múltipla escolha** quanto **questões dissertativas abertas**.

### 3.1 Questões de Múltipla Escolha (`type: "multipla_escolha"`)
* Possuem o campo `options` com alternativas identificadas por letras (`A`, `B`, `C`, etc.).
* Possuem o campo `correctOption` (ex: `"B"`).
* **Comportamento Interativo no Site:** Ao expandir a resolução, a alternativa correta é automaticamente destacada com contorno e fundo acentuado (`--accent-subtle`), facilitando a conferência visual.

#### Exemplo de Frontmatter:
```yaml
---
materia: "pds"
id: "teste-1-2024-q1"
title: "Amostragem com Aliasing e Reconstrução"
exam: "Teste 1"
year: 2024
topic: "Amostragem e Aliasing"
topicSlug: "cap-2-amostragem"
difficulty: "Médio"
type: "multipla_escolha"
statement: "No sistema da Figura 1, suponha que $x_c(t) = 2\\cos(30\\pi t)$..."
image: "/images/questoes/diagrama.png" # opcional se houver figura (ou images: [{ src, caption }])
options:
  - label: "A"
    text: "$2\\cos(30\\pi t)$"
  - label: "B"
    text: "$2\\cos(40\\pi t)$"
correctOption: "B"
---
```
> **Exibição de Imagens e Zoom:** As imagens das questões são inseridas limpas e sem caixas ou botões redundantes. Ao clicar diretamente sobre qualquer imagem, o estudante entra no modo de visualização com zoom interativo, arraste (*pan*), roda do mouse e reset.


---

### 3.2 Questões Dissertativas Abertas (`type: "discursiva"`)
* **Não possuem** o campo `options`.
* **Não exigem** `correctOption`.
* Possuem o campo opcional `expectedAnswer` contendo a síntese da resposta formal (fórmula analítica, valor numérico ou vetor).
* **Comportamento no Site:** Exibe um badge elegante `"Questão Dissertativa Aberta"` informando que requer desenvolvimento analítico, sem renderizar caixas de alternativas. O painel de resolução exibe o resumo em `expectedAnswer` e a dedução formal passo a passo.

#### Exemplo de Frontmatter:
```yaml
---
materia: "pds"
id: "teste-2-2024-q2"
title: "Função de Transferência, Região de Convergência e Resposta ao Impulso"
exam: "Teste 2"
year: 2024
topic: "Transformada Z e Estabilidade"
topicSlug: "cap-3-slits-convolucao"
difficulty: "Médio"
type: "discursiva"
statement: "Considere um sistema SLIT causal dado pela equação de diferenças... Obtenha: (a) H(z); (b) a ROC para estabilidade BIBO; (c) a resposta h[n]."
expectedAnswer: "H(z) = (1 + (1/3)z^-1)/(1 - (1/2)z^-1); ROC: |z| > 1/2; h[n] = (1/2)^n u[n] + (1/3)(1/2)^{n-1} u[n-1]"
---
```

---

## 4. Script Utilitário (`scripts/extract_question.py`)

Localização: `.agents/skills/explain-question/scripts/extract_question.py`

O script automatiza o parsing de exames e a geração de esqueletos prontos com os blocos `<Theory>` e `<Resolution>`.

### Comandos Principais:

```bash
# 1. Inspecionar questões e detectar automaticamente tipo (múltipla escolha vs dissertativa)
python3 .agents/skills/explain-question/scripts/extract_question.py inspect material/testes/teste-1-2024.pdf

# 2. Forçar interpretação como dissertativa aberta
python3 .agents/skills/explain-question/scripts/extract_question.py inspect material/provas/p1-2023.pdf --type discursiva

# 3. Renderizar páginas em PNG para recorte de figuras e diagramas esquemáticos
python3 .agents/skills/explain-question/scripts/extract_question.py render-pages material/testes/teste-1-2024.pdf --outdir archive/pds/questoes

# 4. Recortar figura preservando fórmulas superiores e contexto matemático
python3 .agents/skills/explain-question/scripts/extract_question.py crop-figure material/testes/teste-1-2024.pdf --out archive/pds/questoes/sistema-amostragem-figura1.png --page 1 --top 770 --bottom 1540 --padding 25

# 5. Exportar estrutura completa das questões em JSON
python3 .agents/skills/explain-question/scripts/extract_question.py dump-json material/testes/teste-1-2024.pdf -o questoes.json

# 6. Gerar esqueletos .mdx prontos em archive/<materia>/questoes/
python3 .agents/skills/explain-question/scripts/extract_question.py scaffold material/testes/teste-1-2024.pdf --materia pds
```

### Regras Críticas para Extração e Recorte de Figuras
* **Preservação de Fórmulas e Contexto Superior:** Em provas de engenharia e física, diagramas frequentemente possuem equações definidoras posicionadas imediatamente acima da figura (por exemplo, a equação do trem de impulsos $p(t) = \sum_{n=-\infty}^{+\infty} \delta(t - nT)$ e definições de variáveis). **O recorte nunca deve começar rente à primeira linha de desenho**, devendo sempre englobar toda a fórmula matemática associada, seus limites de somatório ($+\infty$, $-\infty$), frações e o texto introdutório.
* **Margem de Segurança (Padding):** Utilize sempre uma margem vertical de ao menos 25 pixels (`--padding 25`) para assegurar que sobrescritos, acentos matemáticos ($\hat{x}$, $\bar{x}$, $\dot{x}$) e símbolos não sofram corte horizontal.
* **Legenda Completa:** Inclua sempre a legenda na base ("Figura X: ...") para manter a rastreabilidade visual do exercício.

---

## 5. Relação com a Skill `question-study-generator`

* **`question-study-generator`**: Foca na organização macro da disciplina, geração dos cadernos teóricos contínuos (`archive/<materia>/resumos/...`), estruturação do sumário, orquestração de subagentes para resolução paralela de provas e inserção de referências às questões através de `<QuestionCard id="..." />`.
* **`explain-question`**: Foca no tratamento micro de cada questão: extração do PDF, tipagem (múltipla escolha ou dissertativa), elaboração da fundamentação teórica profunda e dedução analítica passo a passo.

Quando a skill `question-study-generator` estiver processando um teste ou prova, ela aciona e utiliza as diretrizes da skill `explain-question`.

---

## 6. Diretrizes para Redação da Teoria e da Resolução

Ao redigir o conteúdo para uma questão:

1. **Na Seção `<Theory>`:**
   - Detalhe **todos os teoremas e fórmulas** que serão empregados.
   - Explique o **porquê** de cada conceito físico/matemático (ex: por que uma função de suporte finito no tempo tem banda infinita; por que o filtro de reconstrução requer ganho $T$).
   - Use KaTeX em fórmulas destacadas (`$$...$$`) e inline (`$...$`).
   - Se a questão envolver diagramas de blocos, invoque e use a skill `block-diagram-generator` (`<BlockDiagram />`).
   - **IMPORTANTE:** NUNCA substitua os valores numéricos específicos da questão na teoria. A teoria deve ser formal, geral e conceitual.

2. **Na Seção `<Resolution>`:**
   - Inicie identificando formalmente os dados e variáveis do enunciado.
   - Apresente todas as passagens matemáticas intermediárias (sem saltos abruptos).
   - Se for múltipla escolha: analise por que a alternativa correta é verdadeira e, quando oportuno, por que as distratoras mais atraentes são falsas. Conclua com: `Portanto, a alternativa correta é a **(X)**.`
   - Se for dissertativa: estruture em itens `#### Item (a)`, `#### Item (b)`, destacando a resposta final de forma clara e inequívoca.

---

## 7. Higiene do Workspace e Limpeza Obrigatória de Rascunhos

Para evitar a poluição do repositório Git e da pasta raiz:
* **Proibição de scripts descartáveis na raiz:** Nunca crie scripts Python ad-hoc (ex: `crop_fig.py`, `test_parse.py`) ou dumps soltos (`questoes.json`) na raiz (`.`).
* **Utilize o script oficial:** Toda extração de páginas, recorte de figuras e dump JSON deve ser feita usando diretamente os subcomandos do utilitário oficial:
  ```bash
  python3 .agents/skills/explain-question/scripts/extract_question.py [subcomando] ...
  ```
* **Limpeza imediata de rascunhos:** Se o subagente gerar qualquer arquivo temporário durante o trabalho, ele é **estritamente obrigado** a remover esses arquivos com `rm` antes de finalizar sua execução e reportar os resultados ao agente pai.
