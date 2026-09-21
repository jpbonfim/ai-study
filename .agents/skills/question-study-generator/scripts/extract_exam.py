#!/usr/bin/env python3
"""
extract_exam.py (Compatibilidade legada)
Redireciona para a skill explain-question (.agents/skills/explain-question/scripts/extract_question.py).
A lógica de extração e resolução de questões agora reside oficialmente na skill explain-question.
"""

import sys
from pathlib import Path

target_script = Path(__file__).resolve().parent.parent.parent / "explain-question" / "scripts" / "extract_question.py"

if not target_script.exists():
    print(f"Erro: Script oficial não encontrado em {target_script}", file=sys.stderr)
    sys.exit(1)

# Executa o script oficial passando todos os argumentos
import runpy
sys.argv[0] = str(target_script)
runpy.run_path(str(target_script), run_name="__main__")
