---
name: explain-question
description: >-
  Extrai questões de provas e listas, explicando a teoria antes da resolução em MDX/KaTeX.
---

# Skill: Resolução Pedagógica de Questões e Extração (`explain-question`)

## 1. Prompt Fundamental

Siga o seguinte princípio metodológico para toda questão:

> **"Para cada questão que você resolver primeiro explique detalhadamente a teoria necessária para resolver a questão, e então resolva a questão passo a passo."**

> **Nota:** Mantenha a teoria geral e conceitual, separada dos cálculos específicos da questão para promover o estudo ativo.

## 2. Formato MDX de Saída

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

> **Nota:** Não importe `<Theory>` ou `<Resolution>` dentro do arquivo MDX.

## 3. Schemas de Frontmatter

### 3.1 Questões de Múltipla Escolha (`type: "multipla_escolha"`)

```yaml
---
materia: "<materia>"
tags:
  - "teste-1"
id: "teste-1-2024-q1"
title: "Amostragem com Aliasing e Reconstrução"
exam: "Teste 1"
year: 2024
topic: "Amostragem e Aliasing"
topicSlug: "cap-2-amostragem"
difficulty: "Médio"
type: "multipla_escolha"
statement: "No sistema da Figura 1, suponha que $x_c(t) = 2\\cos(30\\pi t)$..."
image: "./diagrama.png" # Salva obrigatoriamente na mesma pasta archive/<materia>/questoes/ (ou images: [{ src: "./figura.png", caption }])
options:
  - label: "A"
    text: "$2\\cos(30\\pi t)$"
  - label: "B"
    text: "$2\\cos(40\\pi t)$"
correctOption: "B"
---
```

### 3.2 Questões Dissertativas Abertas (`type: "discursiva"`)

```yaml
---
materia: "<materia>"
tags:
  - "teste-2"
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

## 4. Script Utilitário

Use o script `.agents/skills/explain-question/scripts/extract_question.py` para parse e geração.

Comandos:
```bash
# 1. Inspecionar questões e detectar automaticamente tipo (múltipla escolha vs dissertativa)
python3 .agents/skills/explain-question/scripts/extract_question.py inspect material/testes/teste-1-2024.pdf

# 2. Forçar interpretação como dissertativa aberta
python3 .agents/skills/explain-question/scripts/extract_question.py inspect material/provas/p1-2023.pdf --type discursiva

# 3. Renderizar páginas em PNG para recorte de figuras e diagramas esquemáticos
python3 .agents/skills/explain-question/scripts/extract_question.py render-pages material/testes/teste-1-2024.pdf --outdir archive/<materia>/questoes

# 4. Recortar figura preservando fórmulas superiores e contexto matemático
python3 .agents/skills/explain-question/scripts/extract_question.py crop-figure material/testes/teste-1-2024.pdf --out archive/<materia>/questoes/sistema-amostragem-figura1.png --page 1 --top 770 --bottom 1540 --padding 25

# 5. Exportar estrutura completa das questões em JSON
python3 .agents/skills/explain-question/scripts/extract_question.py dump-json material/testes/teste-1-2024.pdf -o questoes.json

# 6. Gerar esqueletos .mdx prontos em archive/<materia>/questoes/
python3 .agents/skills/explain-question/scripts/extract_question.py scaffold material/testes/teste-1-2024.pdf --materia <materia>
```

**Regras de Recorte de Figuras:**
- **Preserve Fórmulas:** O recorte nunca deve começar rente à primeira linha de desenho. Englobe equações definidoras superiores, limites e contexto matemático associado.
- **Margem de Segurança:** Use `--padding 25` para evitar cortes em sobrescritos e acentos matemáticos.
- **Legendas:** Inclua a legenda original na base ("Figura X: ...").

## 5. Diretrizes de Redação

### Na Seção `<Theory>`:
- Detalhe todos os teoremas e fórmulas que serão empregados.
- Explique o porquê de cada conceito físico/matemático.
- Use KaTeX para fórmulas destacadas (`$$...$$`) e inline (`$...$`).
- Invoque a skill `block-diagram-generator` (`<BlockDiagram />`) para diagramas de blocos.
- Nunca substitua os valores numéricos específicos da questão na teoria.

**Checklist de Qualidade `<Theory>`:**
- [ ] Todos os teoremas e fórmulas que serão usados na resolução estão explicitados?
- [ ] Cada variável está definida?
- [ ] Nenhum valor numérico específico da questão aparece?
- [ ] O estudante conseguiria resolver a questão sozinho após ler apenas esta teoria?

### Exemplos: Teoria Sem Spoiler vs Com Spoiler

**❌ RUIM — Teoria com spoiler e valores da questão:**
```mdx
<Theory>
### Fundamentação Teórica Necessária
Para esta questão onde a amostragem é de $T = 0{,}01\text{ s}$ e a entrada é $x_c(t) = 2\cos(30\pi t)$:
A frequência angular de amostragem é $\omega_s = 2\pi / 0{,}01 = 200\pi\text{ rad/s}$.
Como $30\pi < 100\pi$, não há aliasing e a saída recuperada será exatamente a mesma.
</Theory>
```

**✅ BOM — Teoria conceitual, geral e formal (estudo ativo real):**
```mdx
<Theory>
### Fundamentação Teórica Necessária

#### 1. Relações de Frequência na Amostragem Periódica
Dado um período de amostragem $T$, a frequência angular de amostragem é:
$$
\omega_s = \frac{2\pi}{T} \quad [\text{rad/s}]
$$
A frequência de Nyquist (frequência de corte do filtro de reconstrução ideal) é dada por:
$$
\omega_N = \frac{\omega_s}{2} = \frac{\pi}{T}
$$

#### 2. Condição de Reconstrução sem Aliasing
Para um sinal senoidal puro $x_c(t) = A\cos(\Omega_0 t)$, a amostragem ideal produz réplicas espectrais em $\pm \Omega_0 + k\omega_s$, com $k \in \mathbb{Z}$.
Se $\Omega_0 < \omega_N$, a componente fundamental cai dentro da banda passante do filtro passa-baixas ideal de reconstrução (ganho $T$ e frequência de corte $\omega_c = \omega_s/2$), recuperando $y_r(t) = x_c(t)$ sem distorção.
Caso $\Omega_0 \ge \omega_N$, ocorrerá rebatimento (*aliasing*), e a componente recuperada terá frequência aparente $|\Omega_0 - k\omega_s| < \omega_N$.
</Theory>
```

### Na Seção `<Resolution>`:
- Inicie identificando formalmente os dados e variáveis do enunciado.
- Apresente todas as passagens matemáticas intermediárias (sem saltos abruptos).
- **Múltipla escolha:** Analise por que a correta é verdadeira e por que as distratoras mais atraentes são falsas. Conclua obrigatoriamente com: `Portanto, a alternativa correta é a **(X)**.`
- **Dissertativa:** Estruture em itens `#### Item (a)`, `#### Item (b)`, destacando a resposta final de forma clara e inequívoca.

## 6. Erros Frequentes que Agentes Cometem (e como evitar)

| O que o agente erra | Como fazer corretamente |
| :--- | :--- |
| **Colocar spoilers na `<Theory>`** | ❌ Inserir os números do enunciado ou já resolver o problema na teoria.<br>✅ A teoria deve conter apenas fórmulas gerais, definições e teoremas. |
| **Pular passagens algébricas na `<Resolution>`** | ❌ "Substituindo na fórmula, temos $Y(s) = \frac{2}{s+3}$, portanto alternativa B."<br>✅ Mostre todas as manipulações intermediárias, frações parciais e justifique por que as alternativas distratoras estão erradas. |
| **Usar `<ToggleBlock>` em vez de `<Theory>` e `<Resolution>`** | ❌ Inserir `<ToggleBlock title="...">`.<br>✅ Use os componentes nativos `<Theory>` e `<Resolution>`. Eles já são tratados pelo Astro. |
| **Recortar imagem cortando a equação superior** | ❌ Recortar rente ao desenho, perdendo fórmulas de definição posicionadas acima.<br>✅ Enquadre sempre a fórmula definidora e a legenda inferior com `--padding 25`. |
| **Salvar imagem fora de `archive/<materia>/questoes/`** | ❌ Salvar em `site/public/` ou na raiz.<br>✅ Salve sempre em `archive/<materia>/questoes/<nome>.png` e aponte no frontmatter como `image: "./<nome>.png"`. |

## 7. Referência a Regras Comuns

> Leia e siga `.agents/skills/_shared/references/common-rules.md` para regras de KaTeX, destino de arquivos e higiene.
