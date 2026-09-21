---
name: block-diagram-generator
description: >-
  Cria, customiza e insere diagramas de blocos vetoriais com KaTeX para sistemas de controle,
  sinais e sistemas e processamento digital de sinais (PDS) no website acadêmico em Astro.
---

# Skill: Gerador e Projetista de Diagramas de Blocos (`block-diagram-generator`)

Esta skill capacita o assistente **Antigravity CLI** a conceber, parametrizar e integrar diagramas de blocos vetoriais (SVG nativo com tipografia matemática KaTeX) em cadernos teóricos e questões resolvidas em formato MDX.

Os diagramas são renderizados pelo componente `<BlockDiagram />` do Astro, contando com suporte automático a temas (Papel, Escuro e OLED), visualizador interativo em modal de tela cheia (pan & pinch-to-zoom) e atalhos de navegação.

---

## 1. Visão Geral da Arquitetura

O ecossistema de diagramas no repositório é composto por:
* **Componente Base:** [`site/src/components/BlockDiagram.astro`](file:///home/joao/faculdade/processamento-digital-de-sinais/estudo-p1/site/src/components/BlockDiagram.astro)
* **Gerenciador Interativo (Client-side):** [`site/src/scripts/diagramManager.ts`](file:///home/joao/faculdade/processamento-digital-de-sinais/estudo-p1/site/src/scripts/diagramManager.ts)
* **Estilos e Variáveis Semânticas:** [`site/src/styles/global.css`](file:///home/joao/faculdade/processamento-digital-de-sinais/estudo-p1/site/src/styles/global.css)
* **Arquivos de Conteúdo:** MDX localizados em `archive/<materia>/resumos/*.mdx` e `archive/<materia>/questoes/*.mdx`.

### Recursos Integrados:
1. **Nenhum Bundle Pesado:** Vetores SVG puros gerados no servidor via Astro (zero overhead de bibliotecas pesadas de terceiros).
2. **Equações KaTeX no SVG:** Fórmulas são formatadas matematicamente via `<foreignObject>` com KaTeX em tempo de compilação.
3. **Modal com Pan & Zoom:** Botão de expandir e duplo clique para visualização imersiva com suporte a arrasto e pinça tátil (*touch gestures*).
4. **Respeito aos 3 Modos de Leitura:** Adaptação instantânea de contraste entre Papel (`#fbf8f2`), Escuro (`#151619`) e OLED (`#000000`).

---

## 2. Catálogo de Presets Disponíveis

O componente `<BlockDiagram />` possui 8 presets canônicos prontos para uso imediato, além do modo `custom`:

### 2.1 Controle por Realimentação (`feedback`)
Malha fechada canônica com somador, controlador $C(s)$, planta $G(s)$ e sensor/feedback $H(s)$.

```mdx
<BlockDiagram
  preset="feedback"
  title="Sistema de Controle em Malha Fechada"
  input="R(s)"
  controller="C(s)"
  plant="G(s)"
  feedback="H(s)"
  output="Y(s)"
  error="E(s)"
  controlSignal="U(s)"
  feedbackSign="-"
/>
```

### 2.2 Malha Fechada com Perturbação (`feedback-disturbance`)
Sistema de controle com injeção de distúrbio ou ruído de carga $D(s)$ na entrada da planta.

```mdx
<BlockDiagram
  preset="feedback-disturbance"
  title="Controle com Injeção de Perturbação na Planta"
  input="R(s)"
  controller="C(s)"
  disturbance="D(s)"
  plant="G(s)"
  feedback="H(s)"
  output="Y(s)"
  error="E(s)"
  controlSignal="U(s)"
  feedbackSign="-"
/>
```

### 2.3 Associação em Cascata / Série (`cascade`)
Dois subsistemas conectados em série: $Y(s) = H_1(s) \cdot H_2(s) \cdot X(s)$.

```mdx
<BlockDiagram
  preset="cascade"
  title="Associação de Subsistemas em Cascata"
  input="X(z)"
  controller="H_1(z)"
  plant="H_2(z)"
  output="Y(z)"
  controlSignal="W(z)"
/>
```

### 2.4 Associação em Paralelo (`parallel`)
Dois subsistemas somados em paralelo: $Y(s) = [H_1(s) + H_2(s)] X(s)$.

```mdx
<BlockDiagram
  preset="parallel"
  title="Associação de Subsistemas em Paralelo"
  input="X(s)"
  controller="H_1(s)"
  plant="H_2(s)"
  output="Y(s)"
  feedbackSign="+"
/>
```

### 2.5 Filtro Digital IIR em Forma Direta I (`direct-form-1`)
Estrutura separada com zeros (não recursivo) seguidos de polos (recursivo) com $M + N$ atrasadores $z^{-1}$.

```mdx
<BlockDiagram
  preset="direct-form-1"
  title="Filtro IIR em Forma Direta I"
  input="x[n]"
  output="y[n]"
  zeros={["b_0", "b_1", "b_2"]}
  poles={["-a_1", "-a_2"]}
  delayLabel="z^{-1}"
/>
```

### 2.6 Filtro Digital IIR em Forma Direta II / Canônica (`direct-form-2`)
Estrutura canônica de memória mínima ($\max(M, N)$ atrasadores) compartilhando os nós de estado $w[n]$.

```mdx
<BlockDiagram
  preset="direct-form-2"
  title="Filtro IIR em Forma Direta II Canônica"
  input="x[n]"
  output="y[n]"
  zeros={["b_0", "b_1", "b_2"]}
  poles={["-a_1", "-a_2"]}
  delayLabel="z^{-1}"
/>
```

### 2.7 Filtro FIR Transversal (`fir`)
Estrutura clássica de linha de atraso com derivações (*Tapped Delay Line*) para filtragem não-recursiva.

```mdx
<BlockDiagram
  preset="fir"
  title="Filtro FIR Transversal (Tapped Delay Line)"
  input="x[n]"
  output="y[n]"
  zeros={["b_0", "b_1", "b_2"]}
  delayLabel="z^{-1}"
/>
```

### 2.8 Representação em Espaço de Estados (`state-space`)
Sistema contínuo ou discreto com matrizes dinâmicas $A, B, C, D$ e integrador/acumulador.

```mdx
<BlockDiagram
  preset="state-space"
  title="Diagrama em Espaço de Estados"
  input="u(t)"
  output="y(t)"
  matrixA="A"
  matrixB="B"
  matrixC="C"
  matrixD="D"
  integratorLabel="\frac{1}{s}"
  stateVar="x(t)"
  stateDotVar="\dot{x}(t)"
/>
```

---

## 3. Tabela Completa de Parâmetros (Props)

| Propriedade | Tipo | Padrão | Descrição |
| :--- | :--- | :--- | :--- |
| `preset` | `string` | `'feedback'` | Nome do preset ou `'custom'` |
| `title` | `string` | `'Diagrama de Blocos de Sistemas'` | Título exibido no cabeçalho do card |
| `input` | `string` | `'R(s)'` ou `'x[n]'` | Sinal de entrada (KaTeX) |
| `output` | `string` | `'Y(s)'` ou `'y[n]'` | Sinal de saída principal (KaTeX) |
| `controller` | `string` | `'C(s)'` | Bloco de controle ou primeiro bloco |
| `plant` | `string` | `'G(s)'` | Bloco da planta ou segundo bloco |
| `feedback` | `string` | `'H(s)'` | Bloco no ramo de realimentação |
| `feedbackSign`| `'+'` \| `'-'` | `'-'` | Sinal da junção somadora de feedback |
| `disturbance` | `string` | `'D(s)'` | Sinal de perturbação no somador intermediário |
| `error` | `string` | `'E(s)'` | Sinal de erro após o primeiro somador |
| `controlSignal`| `string` | `'U(s)'` | Sinal de controle entre blocos |
| `zeros` | `string[]` | `['b_0', 'b_1', 'b_2']` | Coeficientes dos zeros de filtros IIR/FIR |
| `poles` | `string[]` | `['-a_1', '-a_2']` | Coeficientes recursivos dos polos de filtros IIR |
| `delayLabel` | `string` | `'z^{-1}'` | Rótulo dos blocos de atraso |
| `matrixA` | `string` | `'A'` | Matriz de dinâmica de estados |
| `matrixB` | `string` | `'B'` | Matriz de entrada |
| `matrixC` | `string` | `'C'` | Matriz de saída |
| `matrixD` | `string` | `'D'` | Matriz de transmissão direta |
| `integratorLabel` | `string` | `'\\frac{1}{s}'` | Bloco integrador contínuo ou acumulador |
| `stateVar` | `string` | `'x(t)'` | Vetor de variáveis de estado |
| `stateDotVar` | `string` | `'\\dot{x}(t)'` | Derivada temporal do vetor de estados |

> [!TIP]
> Em propriedades que contenham barras invertidas KaTeX (ex: `\frac{1}{s}` ou `\dot{x}`), no MDX você pode passar como string direta `integratorLabel="\frac{1}{s}"`.

---

## 4. Criando Diagramas Customizados (`preset="custom"`)

Quando um problema exigir uma topologia arbitrária (por exemplo, filtros em treliça, múltiplos laços de realimentação acoplados, observador de Luenberger ou controle feedforward), use `preset="custom"` e passe seu SVG no slot padrão.

### Classes CSS Padronizadas para SVG Customizado:
* **`.system-diagram-line`**: Linha de conexão do sinal (aplica traço vetorial de 2px e cor do tema).
* **`.system-block-rect`**: Retângulo do bloco (fundo semitransparente, contorno arredondado).
* **`.system-sum-junction`**: Círculo do somador ($r = 16$).
* **`.system-sum-cross`**: Cruz interna do somador ($+$).
* **`.system-takeoff-dot`**: Ponto de ramificação/derivação ($r = 4$).
* **`.system-port-sign`**: Sinais de entrada no somador ($+$ ou $-$).
* **`.system-fo-center`**: Container `<foreignObject>` para centralizar fórmulas KaTeX.

### Exemplo de Diagrama Customizado:
```mdx
<BlockDiagram preset="custom" title="Sistema com Controle Feedforward e Feedback">
  <svg viewBox="0 0 760 180" class="system-diagram-svg">
    <defs>
      <marker id="custom-arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="var(--border-strong)" />
      </marker>
    </defs>

    {/* Entrada R(s) e ramificação */}
    <path d="M 30 90 L 114 90" class="system-diagram-line" marker-end="url(#custom-arrow)" />
    <circle cx="70" cy="90" r="4" class="system-takeoff-dot" />

    {/* Ramo Feedforward G_ff */}
    <path d="M 70 90 L 70 30 L 300 30" class="system-diagram-line" marker-end="url(#custom-arrow)" />
    <rect x="300" y="12" width="70" height="36" rx="4" class="system-block-rect" />

    {/* Somador principal de erro */}
    <circle cx="130" cy="90" r="16" class="system-sum-junction" />
    <line x1="120" y1="90" x2="140" y2="90" class="system-sum-cross" />
    <line x1="130" y1="80" x2="130" y2="100" class="system-sum-cross" />

    {/* Controlador Feedback C(s) */}
    <path d="M 146 90 L 220 90" class="system-diagram-line" marker-end="url(#custom-arrow)" />
    <rect x="220" y="72" width="70" height="36" rx="4" class="system-block-rect" />
  </svg>
</BlockDiagram>
```

---

## 5. Script Auxiliar de Validação e Boilerplate

Localização: `.agents/skills/block-diagram-generator/scripts/generate_diagram.py`

### Comandos:
```bash
# Listar todos os presets disponíveis e seus parâmetros
python3 .agents/skills/block-diagram-generator/scripts/generate_diagram.py list

# Gerar snippet MDX pronto para copiar
python3 .agents/skills/block-diagram-generator/scripts/generate_diagram.py snippet feedback --title "Malha de Controle de Posição"

# Gerar snippet de filtro digital em Forma Direta II
python3 .agents/skills/block-diagram-generator/scripts/generate_diagram.py snippet direct-form-2 --zeros "1, -0.5, 0.25" --poles "0.8, -0.64"
```

---

## 6. Boas Práticas e Diretrizes

1. **Sempre Forneça um Título Descritivo:** Ajuda os alunos a identificar instantaneamente a estrutura no sumário ou no leitor.
2. **Priorize Notação Específica da Matéria:**
   - Em **Sinais Contínuos / Controle**: use notação no domínio de Laplace ($s$) ou tempo contínuo ($t$), ex: $R(s), C(s), G(s), Y(s)$.
   - Em **PDS / Sinais Discretos**: use notação em $z$ ou tempo discreto ($n$), ex: $x[n], y[n], z^{-1}, b_k, a_k$.
3. **Mantenha o Tamanho de ViewBox Balanceado:** Para diagramas customizados, mantenha alturas entre 140px e 240px e larguras entre 600px e 800px para leitura confortável no desktop e mobile.
4. **Evite IDs de Marcador Genéricos:** Em SVGs customizados, dê prefixos aos marcadores (ex: `<marker id="minha-seta" ...>`) para evitar colisões no DOM.
