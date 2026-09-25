#!/usr/bin/env python3
"""
validate_mdx.py — Valida arquivos MDX gerados pelas skills.

Verifica:
  - Frontmatter YAML válido com campos obrigatórios por tipo
  - KaTeX balanceado ($...$ e $$...$$)
  - Presença de <Theory> e <Resolution> em questões
  - Imagens referenciadas existem no mesmo diretório
  - Tags presentes e não vazias

Uso:
    python3 validate_mdx.py archive/<materia>/questoes/*.mdx
    python3 validate_mdx.py archive/<materia>/resumos/*.mdx
    python3 validate_mdx.py --strict arquivo.mdx   # falha no primeiro erro

Saída: Relatório de erros/avisos por arquivo. Exit code 0 se tudo OK, 1 se há erros.
"""

import argparse
import re
import sys
from pathlib import Path

try:
    import yaml
except ImportError:
    # Fallback: parse YAML frontmatter manualmente (básico)
    yaml = None


# ─── Constantes ───────────────────────────────────────────────────────────────

QUESTAO_REQUIRED = {"materia", "id", "title", "exam", "year", "topic", "topicSlug", "type"}
QUESTAO_MC_REQUIRED = {"options", "correctOption"}
RESUMO_REQUIRED = {"materia", "title", "topic", "chapter", "description"}
RESUMO_MATERIA_REQUIRED = {"materia", "title", "topic", "chapter", "description", "type"}


# ─── Parsing ──────────────────────────────────────────────────────────────────

def extract_frontmatter(content: str) -> tuple[dict | None, str, str]:
    """Extrai frontmatter YAML e corpo do MDX. Retorna (data, body, error)."""
    if not content.startswith("---"):
        return None, content, "Arquivo não começa com frontmatter (---)"

    parts = content.split("---", 2)
    if len(parts) < 3:
        return None, content, "Frontmatter não fechado (falta --- final)"

    raw_yaml = parts[1].strip()
    body = parts[2]

    if yaml:
        try:
            data = yaml.safe_load(raw_yaml)
            if not isinstance(data, dict):
                return None, body, "Frontmatter não é um mapeamento YAML válido"
            return data, body, ""
        except yaml.YAMLError as e:
            return None, body, f"YAML inválido: {e}"
    else:
        # Fallback sem PyYAML: extrai campos básicos via regex
        data = {}
        for m in re.finditer(r'^(\w+):\s*(.+)$', raw_yaml, re.MULTILINE):
            key, val = m.group(1), m.group(2).strip().strip('"').strip("'")
            if val.isdigit():
                val = int(val)
            data[key] = val
        return data, body, ""


def detect_file_type(filepath: str, data: dict) -> str:
    """Detecta o tipo de arquivo MDX: 'questao', 'resumo', 'resumo_materia' ou 'desconhecido'."""
    path = Path(filepath)
    parts = [p for p in path.parts]

    if "questoes" in parts:
        return "questao"
    if "resumos" in parts:
        if data.get("type") == "materia":
            return "resumo_materia"
        return "resumo"
    # Tenta detectar pelo conteúdo
    if "id" in data and "type" in data and data.get("type") in ("multipla_escolha", "discursiva"):
        return "questao"
    if "chapter" in data:
        return "resumo"
    return "desconhecido"


# ─── Validações ───────────────────────────────────────────────────────────────

def validate_required_fields(data: dict, required: set, file_type: str) -> list[str]:
    """Verifica campos obrigatórios no frontmatter."""
    errors = []
    missing = required - set(data.keys())
    if missing:
        errors.append(f"Campos obrigatórios ausentes para {file_type}: {', '.join(sorted(missing))}")
    return errors


def validate_tags(data: dict) -> list[str]:
    """Verifica que tags existem e não estão vazias."""
    errors = []
    tags = data.get("tags") or data.get("tag")
    if not tags:
        errors.append("Campo 'tags' ausente ou vazio (ex: tags: [\"teste-1\"])")
    elif isinstance(tags, list) and len(tags) == 0:
        errors.append("Campo 'tags' é lista vazia")
    return errors


def validate_questao_type(data: dict) -> list[str]:
    """Validações específicas por tipo de questão."""
    errors = []
    q_type = data.get("type")
    if q_type == "multipla_escolha":
        if "options" not in data:
            errors.append("Questão multipla_escolha sem campo 'options'")
        elif not isinstance(data["options"], list) or len(data["options"]) < 2:
            errors.append("Campo 'options' deve ter pelo menos 2 alternativas")
        if "correctOption" not in data:
            errors.append("Questão multipla_escolha sem campo 'correctOption'")
    elif q_type == "discursiva":
        if "options" in data and data["options"]:
            errors.append("Questão discursiva não deve ter campo 'options'")
    elif q_type and q_type not in ("multipla_escolha", "discursiva"):
        errors.append(f"Tipo de questão inválido: '{q_type}' (use 'multipla_escolha' ou 'discursiva')")
    return errors


def validate_katex_balance(body: str) -> list[str]:
    """Verifica se delimitadores KaTeX estão balanceados."""
    errors = []

    # Remove blocos de código (```) para não contar $ dentro deles
    code_block_pattern = re.compile(r'```[\s\S]*?```', re.MULTILINE)
    clean = code_block_pattern.sub('', body)
    # Remove inline code
    clean = re.sub(r'`[^`]+`', '', clean)

    # Verifica $$ (display math)
    display_count = clean.count('$$')
    if display_count % 2 != 0:
        errors.append(f"Display math ($$) desbalanceado: {display_count} delimitadores (deve ser par)")

    # Verifica $ (inline math) — mais complexo, precisa ignorar $$
    # Substitui $$ por placeholder primeiro
    no_display = clean.replace('$$', '\x00\x00')
    # Conta $ restantes
    inline_count = no_display.count('$')
    if inline_count % 2 != 0:
        # Tenta encontrar a linha
        lines = no_display.split('\n')
        problem_lines = []
        for i, line in enumerate(lines, 1):
            if line.count('$') % 2 != 0:
                problem_lines.append(i)
        loc = f" (linhas aproximadas: {problem_lines[:5]})" if problem_lines else ""
        errors.append(f"Inline math ($) desbalanceado: {inline_count} delimitadores{loc}")

    return errors


def validate_theory_resolution(body: str) -> list[str]:
    """Verifica presença de <Theory> e <Resolution> em questões."""
    errors = []
    has_theory = bool(re.search(r'<Theory\s*/?>', body))
    has_theory_close = bool(re.search(r'</Theory>', body))
    has_resolution = bool(re.search(r'<Resolution\s*/?>', body))
    has_resolution_close = bool(re.search(r'</Resolution>', body))

    if not has_theory:
        errors.append("Seção <Theory> ausente (obrigatória em questões)")
    elif not has_theory_close:
        errors.append("<Theory> aberto mas </Theory> ausente")

    if not has_resolution:
        errors.append("Seção <Resolution> ausente (obrigatória em questões)")
    elif not has_resolution_close:
        errors.append("<Resolution> aberto mas </Resolution> ausente")

    return errors


def validate_images(data: dict, body: str, filepath: str) -> list[str]:
    """Verifica que imagens referenciadas existem no diretório."""
    warnings = []
    dirpath = Path(filepath).parent

    # Verifica campo image no frontmatter
    img = data.get("image")
    if img and isinstance(img, str) and img.startswith("./"):
        img_path = dirpath / img[2:]
        if not img_path.exists():
            warnings.append(f"Imagem referenciada não encontrada: {img} (esperada em {img_path})")

    # Verifica imagens no corpo MDX
    for m in re.finditer(r'!\[.*?\]\(\./([^)]+)\)', body):
        img_name = m.group(1)
        img_path = dirpath / img_name
        if not img_path.exists():
            warnings.append(f"Imagem no corpo não encontrada: ./{img_name} (esperada em {img_path})")

    return warnings


def validate_display_math_spacing(body: str) -> list[str]:
    """Verifica que $$ display math tem linhas em branco antes e depois."""
    warnings = []
    lines = body.split('\n')
    for i, line in enumerate(lines):
        stripped = line.strip()
        if stripped == '$$':
            # Verifica linha anterior (se não é início de arquivo)
            if i > 0 and lines[i - 1].strip() != '' and not lines[i - 1].strip().startswith('$$'):
                warnings.append(f"Linha {i + 1}: $$ display math sem linha em branco antes")
            # Verifica próxima linha
            if i < len(lines) - 1 and lines[i + 1].strip() != '' and not lines[i + 1].strip().startswith('$$') and not lines[i + 1].strip().startswith('\\begin'):
                # Pode ser o conteúdo do math, verificar se a próxima $$ tem espaço depois
                pass
    return warnings


# ─── Validador Principal ─────────────────────────────────────────────────────

def validate_file(filepath: str) -> tuple[list[str], list[str]]:
    """Valida um arquivo MDX. Retorna (erros, avisos)."""
    errors = []
    warnings = []

    path = Path(filepath)
    if not path.exists():
        return [f"Arquivo não encontrado: {filepath}"], []

    content = path.read_text(encoding="utf-8")
    if not content.strip():
        return ["Arquivo vazio"], []

    # 1. Parse frontmatter
    data, body, fm_error = extract_frontmatter(content)
    if fm_error:
        errors.append(fm_error)
    if data is None:
        return errors, warnings

    # 2. Detectar tipo
    file_type = detect_file_type(filepath, data)

    # 3. Validar campos obrigatórios
    if file_type == "questao":
        errors.extend(validate_required_fields(data, QUESTAO_REQUIRED, "questão"))
        errors.extend(validate_questao_type(data))
        errors.extend(validate_theory_resolution(body))
    elif file_type == "resumo":
        errors.extend(validate_required_fields(data, RESUMO_REQUIRED, "resumo"))
    elif file_type == "resumo_materia":
        errors.extend(validate_required_fields(data, RESUMO_MATERIA_REQUIRED, "resumo de matéria"))

    # 4. Tags
    errors.extend(validate_tags(data))

    # 5. KaTeX
    katex_issues = validate_katex_balance(body)
    errors.extend(katex_issues)

    # 6. Imagens
    warnings.extend(validate_images(data, body, filepath))

    # 7. Espaçamento display math
    warnings.extend(validate_display_math_spacing(body))

    return errors, warnings


# ─── CLI ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Valida arquivos MDX gerados pelas skills",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Exemplos:
  python3 validate_mdx.py archive/pds/questoes/*.mdx
  python3 validate_mdx.py archive/pds/resumos/*.mdx
  python3 validate_mdx.py --strict arquivo.mdx
  python3 validate_mdx.py --summary archive/pds/
        """
    )
    parser.add_argument("files", nargs="+", help="Arquivos MDX ou diretórios para validar")
    parser.add_argument("--strict", action="store_true", help="Falha imediatamente no primeiro erro")
    parser.add_argument("--summary", action="store_true", help="Mostra apenas resumo (sem detalhes)")
    parser.add_argument("--quiet", action="store_true", help="Sem saída se tudo OK")
    args = parser.parse_args()

    # Expandir diretórios
    all_files = []
    for f in args.files:
        p = Path(f)
        if p.is_dir():
            all_files.extend(sorted(p.rglob("*.mdx")))
        elif p.exists():
            all_files.append(p)
        elif "*" not in str(f):
            print(f"⚠ Arquivo não encontrado: {f}", file=sys.stderr)

    if not all_files:
        print("Nenhum arquivo MDX encontrado.", file=sys.stderr)
        sys.exit(1)

    total_errors = 0
    total_warnings = 0
    files_with_errors = 0

    for filepath in all_files:
        errors, warnings = validate_file(str(filepath))
        total_errors += len(errors)
        total_warnings += len(warnings)

        if errors:
            files_with_errors += 1

        if args.strict and errors:
            print(f"\n✗ {filepath}")
            for e in errors:
                print(f"  ERRO: {e}")
            sys.exit(1)

        if not args.summary and (errors or warnings):
            status = "✗" if errors else "⚠"
            print(f"\n{status} {filepath}")
            for e in errors:
                print(f"  ERRO: {e}")
            for w in warnings:
                print(f"  AVISO: {w}")
        elif not args.summary and not args.quiet:
            print(f"✓ {filepath}")

    # Resumo final
    total_files = len(all_files)
    ok_files = total_files - files_with_errors
    print(f"\n{'═' * 50}")
    print(f"Validação: {total_files} arquivo(s) | {ok_files} OK | {files_with_errors} com erros")
    print(f"Total: {total_errors} erro(s), {total_warnings} aviso(s)")
    print(f"{'═' * 50}")

    sys.exit(1 if total_errors > 0 else 0)


if __name__ == "__main__":
    main()
