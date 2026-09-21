#!/usr/bin/env python3
"""
generate_diagram.py
Utilitário para a skill block-diagram-generator.
Gera snippets MDX de diagramas de blocos, lista presets e templates customizados.
"""

import argparse
import sys
import json

PRESETS = {
    "feedback": {
        "description": "Sistema de controle em malha fechada canônica",
        "default_props": {
            "preset": "feedback",
            "title": "Sistema de Controle em Malha Fechada",
            "input": "R(s)",
            "controller": "C(s)",
            "plant": "G(s)",
            "feedback": "H(s)",
            "output": "Y(s)",
            "error": "E(s)",
            "controlSignal": "U(s)",
            "feedbackSign": "-"
        }
    },
    "feedback-disturbance": {
        "description": "Malha fechada com injeção de perturbação externa D(s)",
        "default_props": {
            "preset": "feedback-disturbance",
            "title": "Malha de Controle com Injeção de Perturbação",
            "input": "R(s)",
            "controller": "C(s)",
            "disturbance": "D(s)",
            "plant": "G(s)",
            "feedback": "H(s)",
            "output": "Y(s)",
            "error": "E(s)",
            "controlSignal": "U(s)",
            "feedbackSign": "-"
        }
    },
    "cascade": {
        "description": "Associação em série/cascata de dois subsistemas",
        "default_props": {
            "preset": "cascade",
            "title": "Associação em Cascata",
            "input": "X(s)",
            "controller": "G_1(s)",
            "plant": "G_2(s)",
            "output": "Y(s)",
            "controlSignal": "W(s)"
        }
    },
    "parallel": {
        "description": "Associação em paralelo de dois subsistemas com somador",
        "default_props": {
            "preset": "parallel",
            "title": "Associação em Paralelo",
            "input": "X(s)",
            "controller": "G_1(s)",
            "plant": "G_2(s)",
            "output": "Y(s)",
            "feedbackSign": "+"
        }
    },
    "direct-form-1": {
        "description": "Filtro digital IIR em Forma Direta I (zeros seguidos de polos)",
        "default_props": {
            "preset": "direct-form-1",
            "title": "Estrutura em Forma Direta I",
            "input": "x[n]",
            "output": "y[n]",
            "zeros": ["b_0", "b_1", "b_2"],
            "poles": ["-a_1", "-a_2"],
            "delayLabel": "z^{-1}"
        }
    },
    "direct-form-2": {
        "description": "Filtro digital IIR em Forma Canônica / Forma Direta II (mínima memória)",
        "default_props": {
            "preset": "direct-form-2",
            "title": "Estrutura Canônica em Forma Direta II",
            "input": "x[n]",
            "output": "y[n]",
            "zeros": ["b_0", "b_1", "b_2"],
            "poles": ["-a_1", "-a_2"],
            "delayLabel": "z^{-1}"
        }
    },
    "fir": {
        "description": "Filtro FIR transversal (Tapped Delay Line)",
        "default_props": {
            "preset": "fir",
            "title": "Estrutura Transversal de Filtro FIR",
            "input": "x[n]",
            "output": "y[n]",
            "zeros": ["b_0", "b_1", "b_2"],
            "delayLabel": "z^{-1}"
        }
    },
    "state-space": {
        "description": "Representação matricial em espaço de estados (A, B, C, D)",
        "default_props": {
            "preset": "state-space",
            "title": "Diagrama em Espaço de Estados",
            "input": "u(t)",
            "output": "y(t)",
            "matrixA": "A",
            "matrixB": "B",
            "matrixC": "C",
            "matrixD": "D",
            "integratorLabel": "\\frac{1}{s}",
            "stateVar": "x(t)",
            "stateDotVar": "\\dot{x}(t)"
        }
    }
}

CUSTOM_TEMPLATE = """<BlockDiagram preset="custom" title="{title}">
  <svg viewBox="0 0 760 180" class="system-diagram-svg">
    <defs>
      <marker id="custom-arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="var(--border-strong)" />
      </marker>
    </defs>

    {/* Linha de entrada */}
    <path d="M 30 90 L 114 90" class="system-diagram-line" marker-end="url(#custom-arrow)" />
    
    {/* Somador */}
    <circle cx="130" cy="90" r="16" class="system-sum-junction" />
    <line x1="120" y1="90" x2="140" y2="90" class="system-sum-cross" />
    <line x1="130" y1="80" x2="130" y2="100" class="system-sum-cross" />

    {/* Bloco 1 */}
    <path d="M 146 90 L 230 90" class="system-diagram-line" marker-end="url(#custom-arrow)" />
    <rect x="230" y="70" width="80" height="40" rx="4" class="system-block-rect" />

    {/* Saída */}
    <path d="M 310 90 L 450 90" class="system-diagram-line" marker-end="url(#custom-arrow)" />
  </svg>
</BlockDiagram>
"""

def format_mdx_prop(key: str, value) -> str:
    if isinstance(value, list):
        formatted_list = json.dumps(value)
        return f'  {key}={{{formatted_list}}}'
    return f'  {key}="{value}"'

def cmd_list(args):
    print("\n=== PRESETS DISPONÍVEIS NO <BlockDiagram /> ===")
    for preset, data in PRESETS.items():
        print(f"\n* {preset}:")
        print(f"  Descrição: {data['description']}")
        props = ", ".join(data["default_props"].keys())
        print(f"  Parâmetros: {props}")
    print("\n* custom:")
    print("  Descrição: Permite passar qualquer SVG com classes e KaTeX no slot padrão.")

def cmd_snippet(args):
    preset = args.preset
    if preset not in PRESETS:
        print(f"Erro: Preset '{preset}' não encontrado. Use 'list' para ver opções.", file=sys.stderr)
        sys.exit(1)

    props = dict(PRESETS[preset]["default_props"])
    if args.title:
        props["title"] = args.title
    if args.input:
        props["input"] = args.input
    if args.output:
        props["output"] = args.output
    if args.zeros:
        props["zeros"] = [z.strip() for z in args.zeros.split(",")]
    if args.poles:
        props["poles"] = [p.strip() for p in args.poles.split(",")]

    lines = ["<BlockDiagram"]
    for k, v in props.items():
        lines.append(format_mdx_prop(k, v))
    lines.append("/>")

    snippet = "\n".join(lines)
    print("\n" + snippet + "\n")

def cmd_template_custom(args):
    title = args.title or "Diagrama de Blocos Customizado"
    print("\n" + CUSTOM_TEMPLATE.format(title=title) + "\n")

def main():
    parser = argparse.ArgumentParser(description="Gerador e utilitário de diagramas de blocos para MDX")
    subparsers = parser.add_subparsers(dest="command", required=True)

    # Subcomando list
    sub_list = subparsers.add_parser("list", help="Lista todos os presets canônicos")
    sub_list.set_defaults(func=cmd_list)

    # Subcomando snippet
    sub_snip = subparsers.add_parser("snippet", help="Gera snippet MDX para um preset")
    sub_snip.add_argument("preset", choices=list(PRESETS.keys()), help="Nome do preset")
    sub_snip.add_argument("--title", help="Título do diagrama")
    sub_snip.add_argument("--input", help="Sinal de entrada (ex: X(z) ou x[n])")
    sub_snip.add_argument("--output", help="Sinal de saída (ex: Y(z) ou y[n])")
    sub_snip.add_argument("--zeros", help="Lista separada por vírgulas de coeficientes de zeros (ex: '1, -0.5, 0.25')")
    sub_snip.add_argument("--poles", help="Lista separada por vírgulas de coeficientes de polos (ex: '0.8, -0.64')")
    sub_snip.set_defaults(func=cmd_snippet)

    # Subcomando custom
    sub_custom = subparsers.add_parser("template-custom", help="Gera esqueleto de SVG customizado para o slot")
    sub_custom.add_argument("--title", help="Título do diagrama")
    sub_custom.set_defaults(func=cmd_template_custom)

    args = parser.parse_args()
    args.func(args)

if __name__ == "__main__":
    main()
