#!/usr/bin/env python3
"""
extract_question.py
Utilitário para extração estruturada de questões (múltipla escolha e dissertativas abertas)
e recorte de figuras com margem de segurança para fórmulas matemáticas em provas e testes.
Usado pela Skill explain-question do Antigravity CLI.
"""

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
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
    """Renderiza todas as páginas do PDF como imagens PNG para recorte de figuras."""
    os.makedirs(output_dir, exist_ok=True)
    base_name = Path(pdf_path).stem
    prefix = os.path.join(output_dir, f"{base_name}-page")
    cmd = ["pdftoppm", "-png", "-r", str(dpi), pdf_path, prefix]
    run_cmd(cmd)
    
    generated = sorted(list(Path(output_dir).glob(f"{base_name}-page-*.png")))
    return [str(p) for p in generated]

def crop_figure(source_path: str, out_path: str, page: int = 1, top: int = None, bottom: int = None, left: int = None, right: int = None, padding: int = 25):
    """
    Recorta figuras e diagramas garantindo que fórmulas acima e legendas abaixo
    não sejam cortadas através de margem de segurança (padding).
    """
    from PIL import Image
    import numpy as np

    if source_path.lower().endswith(".pdf"):
        with tempfile.TemporaryDirectory() as tmpdir:
            rendered = render_pdf_pages(source_path, tmpdir, dpi=150)
            if page < 1 or page > len(rendered):
                raise ValueError(f"Página {page} fora do intervalo disponível (1 a {len(rendered)})")
            img_path = rendered[page - 1]
            im = Image.open(img_path)
            return _crop_and_save(im, out_path, top, bottom, left, right, padding)
    else:
        im = Image.open(source_path)
        return _crop_and_save(im, out_path, top, bottom, left, right, padding)

def _crop_and_save(im, out_path, top, bottom, left, right, padding):
    import numpy as np
    width, height = im.size
    gray = np.array(im.convert("L"))
    
    # Se top/bottom não especificados, detecta limites verticais de pixels escuros
    if top is None:
        non_white_rows = np.where(np.any(gray < 240, axis=1))[0]
        y1 = max(0, int(non_white_rows[0]) - padding) if len(non_white_rows) else 0
    else:
        y1 = max(0, top - padding)
        
    if bottom is None:
        non_white_rows = np.where(np.any(gray < 240, axis=1))[0]
        y2 = min(height, int(non_white_rows[-1]) + padding) if len(non_white_rows) else height
    else:
        y2 = min(height, bottom + padding)
        
    sub = gray[y1:y2, :]
    non_white_cols = np.where(np.any(sub < 240, axis=0))[0]
    
    if left is None:
        x1 = max(0, int(non_white_cols[0]) - padding) if len(non_white_cols) else 0
    else:
        x1 = max(0, left - padding)
        
    if right is None:
        x2 = min(width, int(non_white_cols[-1]) + padding) if len(non_white_cols) else width
    else:
        x2 = min(width, right + padding)
        
    cropped = im.crop((x1, y1, x2, y2))
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    cropped.save(out_path)
    print(f"[CROP SUCESSO] Imagem salva em {out_path} ({cropped.size[0]}x{cropped.size[1]}px, bbox=({x1}, {y1}, {x2}, {y2}))")
    return out_path

def parse_exam_metadata(text: str, filename: str) -> dict:
    """Extrai cabeçalho da prova (disciplina, teste/exame, ano)."""
    meta = {
        "discipline": "PDS",
        "exam": "Teste",
        "year": 2024,
        "raw_title": ""
    }
    
    fn = Path(filename).stem
    m_fn = re.search(r'(?:teste|prova|exame|p1|p2|p3)[-_]?(\d+)?[-_]?(\d{4})?', fn, re.IGNORECASE)
    if m_fn:
        num = m_fn.group(1) or "1"
        yr = m_fn.group(2)
        if "prova" in fn.lower() or "p" in fn.lower():
            meta["exam"] = f"Prova {num}"
        else:
            meta["exam"] = f"Teste {num}"
        if yr:
            meta["year"] = int(yr)
    
    lines = text.splitlines()
    for line in lines[:20]:
        if any(term in line.upper() for term in ["PTC", "TESTE", "PROVA", "EXAME", "P1", "P2", "P3"]):
            meta["raw_title"] = line.strip()
            m_test = re.search(r'(?:Teste|Prova|Exame|P)\s*[-–]?\s*(\d+)', line, re.IGNORECASE)
            if m_test:
                meta["exam"] = f"Teste {m_test.group(1)}"
            m_year = re.search(r'(?:20\d{2})', line)
            if m_year:
                meta["year"] = int(m_year.group(0))
            break
            
    return meta

def parse_questions(text: str, force_type: str = "auto") -> list[dict]:
    """
    Segmenta o texto em questões e alternativas.
    Identifica automaticamente questões de múltipla escolha vs dissertativas abertas.
    """
    questions = []
    
    q_pattern = re.compile(
        r'^\s*(?:Questão\s+)?([1-9]\d?)(?:ª\s*Questão|\.)?\s*(?:\((\d+[,.]\d+)\s*(?:pontos|pts)?\))?\s*[:\-]?\s*(.*)$',
        re.MULTILINE | re.IGNORECASE
    )
    
    matches = list(q_pattern.finditer(text))
    if not matches:
        return questions
        
    for i in range(len(matches)):
        match = matches[i]
        q_num = int(match.group(1))
        pts = match.group(2) if match.group(2) else "2,5"
        start_idx = match.start()
        end_idx = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        
        q_block = text[start_idx:end_idx].strip()
        
        if force_type == 'discursiva' or force_type == 'auto':
            stmt_clean = re.sub(r'^\s*(?:Questão\s+)?[1-9]\d?(?:ª\s*Questão|\.)?\s*(?:\(\d+[,.]\d+\s*(?:pontos|pts)?\))?\s*[:\-]?\s*', '', q_block, flags=re.IGNORECASE).strip()
            has_options = bool(re.search(r'^\s*\([a-eA-E]\)\s+', q_block, re.MULTILINE))
            if force_type == 'discursiva' or not has_options:
                questions.append({
                    "number": q_num,
                    "points": pts,
                    "type": "discursiva",
                    "statement": " ".join(stmt_clean.split()),
                    "options": []
                })
                continue
        
        opt_pattern = re.compile(r'^\s*\(([a-eA-E])\)\s*(.*)$', re.MULTILINE)
        opt_matches = list(opt_pattern.finditer(q_block))
        
        options = []
        q_type = "multipla_escolha" if (len(opt_matches) >= 2 and force_type != "discursiva") else "discursiva"
        if force_type == "multipla_escolha":
            q_type = "multipla_escolha"
            
        if opt_matches and q_type == "multipla_escolha":
            stmt_end = opt_matches[0].start()
            statement = q_block[:stmt_end].strip()
            stmt_clean = re.sub(r'^\s*(?:Questão\s+)?[1-9]\d?\.\s*(?:\(\d+[,.]\d+\s*(?:pontos|pts)?\))?\s*', '', statement, flags=re.IGNORECASE).strip()
            
            for j, o_m in enumerate(opt_matches):
                o_label = o_m.group(1).upper()
                o_start = o_m.start()
                o_end = opt_matches[j + 1].start() if j + 1 < len(opt_matches) else len(q_block)
                o_text = q_block[o_start:o_end].strip()
                o_clean = re.sub(r'^\s*\([a-eA-E]\)\s*', '', o_text).strip()
                o_clean = " ".join(o_clean.split())
                options.append({"label": o_label, "text": o_clean})
        else:
            stmt_clean = re.sub(r'^\s*(?:Questão\s+)?[1-9]\d?\.\s*(?:\(\d+[,.]\d+\s*(?:pontos|pts)?\))?\s*', '', q_block, flags=re.IGNORECASE).strip()
            stmt_clean = " ".join(stmt_clean.split())
            
        questions.append({
            "number": q_num,
            "points": q_points,
            "type": q_type,
            "statement": " ".join(stmt_clean.split()),
            "options": options
        })
        
    return questions

def generate_question_slug(meta: dict, q_num: int) -> str:
    exam_clean = re.sub(r'[^a-zA-Z0-9]', '-', meta['exam'].lower())
    exam_clean = re.sub(r'-+', '-', exam_clean).strip('-')
    return f"{exam_clean}-{meta['year']}-q{q_num}"

def main():
    parser = argparse.ArgumentParser(description="Extrator e Gerador de Esqueletos de Questões (Skill explain-question)")
    subparsers = parser.add_subparsers(dest="command", required=True)
    
    # Subcomando: inspect
    p_inspect = subparsers.add_parser("inspect", help="Inspeciona e exibe estrutura de questões de um PDF")
    p_inspect.add_argument("pdf_path", help="Caminho para o arquivo PDF")
    p_inspect.add_argument("--type", choices=["auto", "multipla_escolha", "discursiva"], default="auto", help="Forçar tipo de questão")
    
    # Subcomando: dump-json
    p_dump = subparsers.add_parser("dump-json", help="Extrai texto e metadados para formato JSON")
    p_dump.add_argument("pdf_path", help="Caminho para o arquivo PDF")
    p_dump.add_argument("--output", "-o", help="Arquivo JSON de destino (opcional)")
    p_dump.add_argument("--type", choices=["auto", "multipla_escolha", "discursiva"], default="auto", help="Forçar tipo de questão")
    
    # Subcomando: render-pages
    p_render = subparsers.add_parser("render-pages", help="Renderiza páginas do PDF em imagens PNG")
    p_render.add_argument("pdf_path", help="Caminho para o arquivo PDF")
    p_render.add_argument("--outdir", default="archive/pds/questoes", help="Diretório de saída")
    p_render.add_argument("--dpi", type=int, default=150, help="Resolução DPI (padrão: 150)")

    # Subcomando: crop-figure
    p_crop = subparsers.add_parser("crop-figure", help="Recorta figura de página PNG ou PDF com margem de segurança para fórmulas e legendas")
    p_crop.add_argument("source", help="Arquivo de origem (PNG da página ou PDF)")
    p_crop.add_argument("--out", "-o", required=True, help="Arquivo de destino PNG")
    p_crop.add_argument("--page", type=int, default=1, help="Número da página (se PDF, 1-indexed)")
    p_crop.add_argument("--top", type=int, help="Coordenada Y inicial aproximada (topo da fórmula/diagrama)")
    p_crop.add_argument("--bottom", type=int, help="Coordenada Y final aproximada (base da legenda)")
    p_crop.add_argument("--left", type=int, help="Coordenada X inicial (esquerda, opcional)")
    p_crop.add_argument("--right", type=int, help="Coordenada X final (direita, opcional)")
    p_crop.add_argument("--padding", type=int, default=25, help="Margem de respiro em pixels para não cortar símbolos matemáticos (padrão: 25px)")
    
    # Subcomando: scaffold
    p_scaffold = subparsers.add_parser("scaffold", help="Gera esqueletos .mdx na pasta archive/<materia>/questoes")
    p_scaffold.add_argument("pdf_path", help="Caminho para o arquivo PDF")
    p_scaffold.add_argument("--materia", default="pds", help="Identificador da matéria (padrão: pds)")
    p_scaffold.add_argument("--tag", default="teste-1", help="Tag ou avaliação da questão (ex: teste-1, teste-2, p1)")
    p_scaffold.add_argument("--type", choices=["auto", "multipla_escolha", "discursiva"], default="auto", help="Tipo das questões")
    
    args = parser.parse_args()
    
    if args.command == "inspect":
        text = extract_pdf_text(args.pdf_path)
        meta = parse_exam_metadata(text, args.pdf_path)
        questions = parse_questions(text, force_type=args.type)
        print(f"=== {meta['exam']} ({meta['year']}) ===")
        print(f"Total de questões detectadas: {len(questions)}")
        for q in questions:
            tipo_desc = "Múltipla Escolha" if q['type'] == "multipla_escolha" else "Dissertativa Aberta"
            print(f"\nQuestão {q['number']} ({q['points']} pts) [{tipo_desc}]:")
            print(f"  Enunciado: {q['statement'][:120]}...")
            if q['type'] == "multipla_escolha":
                print(f"  Alternativas: {len(q['options'])}")
                for opt in q['options']:
                    print(f"    ({opt['label']}) {opt['text'][:60]}")
                    
    elif args.command == "dump-json":
        text = extract_pdf_text(args.pdf_path)
        meta = parse_exam_metadata(text, args.pdf_path)
        questions = parse_questions(text, force_type=args.type)
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

    elif args.command == "crop-figure":
        crop_figure(
            args.source,
            args.out,
            page=args.page,
            top=args.top,
            bottom=args.bottom,
            left=args.left,
            right=args.right,
            padding=args.padding
        )
            
    elif args.command == "scaffold":
        text = extract_pdf_text(args.pdf_path)
        meta = parse_exam_metadata(text, args.pdf_path)
        questions = parse_questions(text, force_type=args.type)
        
        out_dir = Path("archive") / args.materia / "questoes"
        if not out_dir.parent.exists() and Path("../archive").exists():
            out_dir = Path("../archive") / args.materia / "questoes"
        out_dir.mkdir(parents=True, exist_ok=True)
        
        for q in questions:
            slug = generate_question_slug(meta, q['number'])
            file_path = out_dir / f"{slug}.mdx"
            if file_path.exists():
                print(f"[PULADO] Já existe: {file_path}")
                continue
                
            safe_stmt = q['statement'].replace('"', '\\"')
            
            if q['type'] == "multipla_escolha":
                opts_yaml = "options:\n"
                for o in q['options']:
                    safe_text = o['text'].replace('"', '\\"')
                    opts_yaml += f'  - label: "{o["label"]}"\n    text: "{safe_text}"\n'
                gabarito_yaml = 'correctOption: "A"\n'
                conclusao_step = "Portanto, a alternativa correta é a **(A)**."
            else:
                opts_yaml = ""
                gabarito_yaml = 'expectedAnswer: "" # Resposta esperada ou fórmula síntese\n'
                conclusao_step = "Portanto, a resposta final deduzida é: ..."

            content = f"""---
materia: "{args.materia}"
tags:
  - "{args.tag}"
id: "{slug}"
title: "{meta['exam']} - Questão {q['number']}"
exam: "{meta['exam']}"
year: {meta['year']}
topic: "A definir"
topicSlug: "cap-1-introducao"
difficulty: "Médio"
type: "{q['type']}"
statement: "{safe_stmt}"
{opts_yaml}{gabarito_yaml}---

<Theory>

### Fundamentação Teórica Necessária

*Apresente detalhadamente toda a teoria, propriedades matemáticas, teoremas e fórmulas necessárias para solucionar a questão (sem antecipar a resposta final).*

#### 1. Conceitos Fundamentais
...

#### 2. Propriedades e Relações Matemáticas
...

</Theory>

<Resolution>

### Resolução Passo a Passo

*Desenvolva a solução da questão passo a passo com rigor analítico, justificando cada passagem matemática.*

#### 1. Análise e Identificação dos Dados
...

#### 2. Desenvolvimento Algébrico / Demonstração
...

#### 3. Conclusão e Gabarito
{conclusao_step}

</Resolution>
"""
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(content)
            print(f"[CRIADO] {file_path}")

if __name__ == "__main__":
    main()
