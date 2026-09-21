#!/usr/bin/env python3
"""
extract_exam.py
Utilitário para extração estruturada de provas e testes em PDF de PDS.
Usado pela Skill exam-study-generator do Antigravity CLI.
"""

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path

def run_cmd(cmd, cwd=None):
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, cwd=cwd)
    if res.returncode != 0:
        raise RuntimeError(f"Erro ao executar comando: {' '.join(cmd)}\n{res.stderr}")
    return res.stdout

def extract_pdf_text(pdf_path: str) -> str:
    """Extrai texto preservando layout usando pdftotext."""
    cmd = ["pdftotext", "-layout", pdf_path, "-"]
    return run_cmd(cmd)

def render_pdf_pages(pdf_path: str, output_dir: str, dpi: int = 150) -> list[str]:
    """Renderiza todas as páginas do PDF como imagens PNG."""
    os.makedirs(output_dir, exist_ok=True)
    base_name = Path(pdf_path).stem
    prefix = os.path.join(output_dir, f"{base_name}-page")
    cmd = ["pdftoppm", "-png", "-r", str(dpi), pdf_path, prefix]
    run_cmd(cmd)
    
    generated = sorted(list(Path(output_dir).glob(f"{base_name}-page-*.png")))
    return [str(p) for p in generated]

def parse_exam_metadata(text: str, filename: str) -> dict:
    """Extrai cabeçalho da prova (disciplina, teste, ano)."""
    meta = {
        "discipline": "PDS",
        "exam": "Teste",
        "year": 2024,
        "raw_title": ""
    }
    
    # Extrai do nome do arquivo (ex: teste-1-2024.pdf)
    fn = Path(filename).stem
    m_fn = re.search(r'teste[-_]?(\d+)[-_]?(\d{4})', fn, re.IGNORECASE)
    if m_fn:
        meta["exam"] = f"Teste {m_fn.group(1)}"
        meta["year"] = int(m_fn.group(2))
    
    lines = text.splitlines()
    for line in lines[:15]:
        if "PTC" in line or "Teste" in line:
            meta["raw_title"] = line.strip()
            # Procura por Teste X
            m_test = re.search(r'Teste\s*[-–]?\s*(\d+)', line, re.IGNORECASE)
            if m_test:
                meta["exam"] = f"Teste {m_test.group(1)}"
            # Procura ano / mês
            m_year = re.search(r'(?:20\d{2})', line)
            if m_year:
                meta["year"] = int(m_year.group(0))
            break
            
    return meta

def parse_questions(text: str) -> list[dict]:
    """Segmenta o texto em questões e alternativas."""
    questions = []
    
    # Encontra o início das questões (ex: 1. (2,5) ou 1. )
    # Ignora números no formulário
    q_pattern = re.compile(r'^\s*([1-9]\d?)\.\s*(?:\((\d+[,.]\d+)\))?\s*(.*)$', re.MULTILINE)
    
    matches = list(q_pattern.finditer(text))
    if not matches:
        return questions
        
    for i, match in enumerate(matches):
        q_num = int(match.group(1))
        q_points = match.group(2) or "2,5"
        start_idx = match.start()
        end_idx = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        
        q_block = text[start_idx:end_idx].strip()
        
        # Separa o enunciado das alternativas
        # Padrão de alternativas: (a), (b), (c), (d), (e)
        opt_pattern = re.compile(r'^\s*\(([a-eA-E])\)\s*(.*)$', re.MULTILINE)
        opt_matches = list(opt_pattern.finditer(q_block))
        
        options = []
        if opt_matches:
            stmt_end = opt_matches[0].start()
            statement = q_block[:stmt_end].strip()
            # Limpa prefixo "1. (2,5)" do enunciado
            stmt_clean = re.sub(r'^\s*[1-9]\d?\.\s*(?:\(\d+[,.]\d+\))?\s*', '', statement).strip()
            
            for j, o_m in enumerate(opt_matches):
                o_label = o_m.group(1).upper()
                o_start = o_m.start()
                o_end = opt_matches[j + 1].start() if j + 1 < len(opt_matches) else len(q_block)
                o_text = q_block[o_start:o_end].strip()
                # Remove o (a) da string de texto
                o_clean = re.sub(r'^\s*\([a-eA-E]\)\s*', '', o_text).strip()
                # Remove quebras extras de linha
                o_clean = " ".join(o_clean.split())
                options.append({"label": o_label, "text": o_clean})
        else:
            stmt_clean = re.sub(r'^\s*[1-9]\d?\.\s*(?:\(\d+[,.]\d+\))?\s*', '', q_block).strip()
            stmt_clean = " ".join(stmt_clean.split())
            
        questions.append({
            "number": q_num,
            "points": q_points,
            "statement": " ".join(stmt_clean.split()),
            "options": options
        })
        
    return questions

def generate_question_slug(meta: dict, q_num: int) -> str:
    exam_clean = re.sub(r'[^a-zA-Z0-9]', '-', meta['exam'].lower())
    exam_clean = re.sub(r'-+', '-', exam_clean).strip('-')
    return f"{exam_clean}-{meta['year']}-q{q_num}"

def main():
    parser = argparse.ArgumentParser(description="Extrator de Provas em PDF para o Estudo PDS")
    subparsers = parser.add_subparsers(dest="command", required=True)
    
    # Subcomando: inspect
    p_inspect = subparsers.add_parser("inspect", help="Inspeciona e exibe estrutura de questões de um PDF")
    p_inspect.add_argument("pdf_path", help="Caminho para o arquivo PDF")
    
    # Subcomando: dump-json
    p_dump = subparsers.add_parser("dump-json", help="Extrai texto e metadados para formato JSON")
    p_dump.add_argument("pdf_path", help="Caminho para o arquivo PDF")
    p_dump.add_argument("--output", "-o", help="Arquivo JSON de destino (opcional)")
    
    # Subcomando: render-pages
    p_render = subparsers.add_parser("render-pages", help="Renderiza páginas do PDF em imagens PNG")
    p_render.add_argument("pdf_path", help="Caminho para o arquivo PDF")
    p_render.add_argument("--outdir", default="site/public/images/questoes", help="Diretório de saída")
    p_render.add_argument("--dpi", type=int, default=150, help="Resolução DPI (padrão: 150)")
    
    # Subcomando: scaffold
    p_scaffold = subparsers.add_parser("scaffold", help="Gera esqueletos .mdx na pasta src/content/questoes")
    p_scaffold.add_argument("pdf_path", help="Caminho para o arquivo PDF")
    p_scaffold.add_argument("--materia", default="pds", help="Identificador da matéria (padrão: pds)")
    p_scaffold.add_argument("--site-dir", default="site", help="Diretório do projeto Astro")
    
    args = parser.parse_args()
    
    if args.command == "inspect":
        text = extract_pdf_text(args.pdf_path)
        meta = parse_exam_metadata(text, args.pdf_path)
        questions = parse_questions(text)
        print(f"=== {meta['exam']} ({meta['year']}) ===")
        print(f"Total de questões detectadas: {len(questions)}")
        for q in questions:
            print(f"\nQuestão {q['number']} ({q['points']} pts):")
            print(f"  Enunciado: {q['statement'][:100]}...")
            print(f"  Alternativas: {len(q['options'])}")
            for opt in q['options']:
                print(f"    ({opt['label']}) {opt['text'][:60]}")
                
    elif args.command == "dump-json":
        text = extract_pdf_text(args.pdf_path)
        meta = parse_exam_metadata(text, args.pdf_path)
        questions = parse_questions(text)
        data = {
            "metadata": meta,
            "questions": questions
        }
        json_str = json.dumps(data, indent=2, ensure_ascii=False)
        if args.output:
            with open(args.output, "w", encoding="utf-8") as f:
                f.write(json_str)
            print(f"Salvo em {args.output}")
        else:
            print(json_str)
            
    elif args.command == "render-pages":
        imgs = render_pdf_pages(args.pdf_path, args.outdir, args.dpi)
        print(f"{len(imgs)} páginas renderizadas:")
        for img in imgs:
            print(f"  {img}")
            
    elif args.command == "scaffold":
        text = extract_pdf_text(args.pdf_path)
        meta = parse_exam_metadata(text, args.pdf_path)
        out_dir = Path("archive") / args.materia / "questoes"
        if not out_dir.parent.exists():
            # Tenta encontrar se executado de dentro de site/
            if Path("../archive").exists():
                out_dir = Path("../archive") / args.materia / "questoes"
        out_dir.mkdir(parents=True, exist_ok=True)
        
        for q in questions:
            slug = generate_question_slug(meta, q['number'])
            file_path = out_dir / f"{slug}.mdx"
            if file_path.exists():
                print(f"[PULADO] Já existe: {file_path}")
                continue
                
            opts_yaml = ""
            for o in q['options']:
                safe_text = o['text'].replace('"', '\\"')
                opts_yaml += f'  - label: "{o["label"]}"\n    text: "{safe_text}"\n'
                
            content = f"""---
materia: "{args.materia}"
id: "{slug}"
title: "{meta['exam']} - Questão {q['number']}"
exam: "{meta['exam']}"
year: {meta['year']}
topic: "A definir"
topicSlug: "cap-2-amostragem"
difficulty: "Médio"
statement: "{q['statement'].replace('"', '\\"')}"
options:
{opts_yaml}correctOption: "A"
---

### Resolução Passo a Passo

*Resolução detalhada redigida pela IA via Skill exam-study-generator no padrão acadêmico.*
"""
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(content)
            print(f"[CRIADO] {file_path}")

if __name__ == "__main__":
    main()
