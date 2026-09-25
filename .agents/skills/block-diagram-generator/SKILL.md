---
name: block-diagram-generator
description: >-
  Cria, customiza e insere diagramas de blocos vetoriais com KaTeX para sistemas de controle,
  sinais e sistemas e processamento digital de sinais.
---

# Skill: Gerador e Projetista de Diagramas de Blocos (`block-diagram-generator`)

## 1. Uso Básico

Use o componente `<BlockDiagram />` para inserir diagramas de blocos vetoriais com suporte a KaTeX diretamente em arquivos MDX.
**Nota:** Os diagramas são renderizados inline no próprio arquivo MDX. Nunca gere arquivos SVG ou imagens separados para isso.

## 2. Catálogo de Presets

Use os presets abaixo definindo a propriedade `preset` no componente `<BlockDiagram />`.

### 2.1 Controle por Realimentação (`feedback`)
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

## 3. Tabela de Parâmetros

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

## 4. Diagramas Customizados (`preset="custom"`)

Para topologias arbitrárias, use `preset="custom"` e insira o SVG no slot padrão.

### Classes CSS Padronizadas:
* `.system-diagram-line`: Linha de conexão do sinal.
* `.system-block-rect`: Retângulo do bloco.
* `.system-sum-junction`: Círculo do somador.
* `.system-sum-cross`: Cruz interna do somador.
* `.system-takeoff-dot`: Ponto de ramificação.
* `.system-port-sign`: Sinais de entrada no somador.
* `.system-fo-center`: Container `<foreignObject>` para KaTeX.

### Template Básico:
```mdx
<BlockDiagram preset="custom" title="Diagrama Customizado">
  <svg viewBox="0 0 760 180" class="system-diagram-svg">
    <defs>
      <marker id="custom-arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="var(--border-strong)" />
      </marker>
    </defs>
    {/* Adicione os caminhos e blocos aqui */}
  </svg>
</BlockDiagram>
```

## 5. Script Auxiliar

Use o script `.agents/skills/block-diagram-generator/scripts/generate_diagram.py` para listar opções ou gerar snippets.

### Comandos:
```bash
# Listar todos os presets disponíveis
python3 .agents/skills/block-diagram-generator/scripts/generate_diagram.py list

# Gerar snippet MDX pronto para copiar
python3 .agents/skills/block-diagram-generator/scripts/generate_diagram.py snippet feedback --title "Malha de Controle"

# Gerar esqueleto de SVG customizado
python3 .agents/skills/block-diagram-generator/scripts/generate_diagram.py template-custom --title "Meu Diagrama"
```

## 6. Referências

> Leia e siga `.agents/skills/_shared/references/common-rules.md` para regras de KaTeX, destino de arquivos e higiene.
