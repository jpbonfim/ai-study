#!/usr/bin/env python3
"""
extract_material_images.py
Utilitário para inspeção de materiais acadêmicos (slides de aula, notas, apostilas em PDF),
extração seletiva de imagens embutidas e recorte de alta resolução de diagramas e esquemas.
Usado pela Skill summary-study-generator do Antigravity CLI e Claude Code.
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

def get_pdf_info(pdf_path: str) -> dict:
    """Obtém número de páginas e metadados básicos usando pdfinfo."""
    try:
        raw = run_cmd(["pdfinfo", pdf_path])
        info = {}
        for line in raw.splitlines():
            if ":" in line:
                key, val = line.split(":", 1)
                info[key.strip()] = val.strip()
        pages = int(info.get("Pages", 1))
        return {"pages": pages, "title": info.get("Title", ""), "info": info}
    except Exception as e:
        return {"pages": 1, "title": "", "error": str(e)}

def extract_pdf_page_text(pdf_path: str, page: int) -> str:
    """Extrai texto de uma página específica com layout preservado."""
    try:
        cmd = ["pdftotext", "-f", str(page), "-l", str(page), "-layout", pdf_path, "-"]
        return run_cmd(cmd)
    except Exception as e:
        return f"[Erro ao extrair texto da página {page}: {e}]"

def list_embedded_images(pdf_path: str) -> list[dict]:
    """Lista todas as imagens raster embutidas no PDF usando pdfimages -list."""
    try:
        raw = run_cmd(["pdfimages", "-list", pdf_path])
        lines = raw.strip().splitlines()
        if len(lines) <= 2:
            return []
        
        images = []
        # Header: page   num  type   width height color comp bpc  enc interp  object ID x-ppi y-ppi size ratio
        for line in lines[2:]:
            parts = line.split()
            if len(parts) >= 6:
                try:
                    images.append({
                        "page": int(parts[0]),
                        "num": int(parts[1]),
                        "type": parts[2],
                        "width": int(parts[3]),
                        "height": int(parts[4]),
                        "color": parts[5] if len(parts) > 5 else "",
                    })
                except (ValueError, IndexError):
                    continue
        return images
    except Exception as e:
        print(f"[Aviso] Não foi possível listar imagens embutidas com pdfimages: {e}", file=sys.stderr)
        return []

def inspect_material(pdf_path: str, max_pages_preview: int = 15):
    """Inspeciona o PDF do material e exibe resumo para o agente avaliar relevância."""
    path = Path(pdf_path)
    if not path.exists():
        print(f"Erro: Arquivo {pdf_path} não encontrado.", file=sys.stderr)
        sys.exit(1)

    info = get_pdf_info(str(path))
    total_pages = info.get("pages", 1)
    embedded_images = list_embedded_images(str(path))

    print(f"============================================================")
    print(f"INSPEÇÃO DE MATERIAL DIDÁTICO: {path.name}")
    print(f"Total de Páginas / Slides: {total_pages}")
    print(f"Total de Imagens Embutidas Detectadas: {len(embedded_images)}")
    print(f"============================================================")

    if embedded_images:
        print("\n--- Imagens Embutidas Significativas (> 150x150px) ---")
        large_images = [img for img in embedded_images if img["width"] >= 150 and img["height"] >= 150]
        if large_images:
            for img in large_images[:25]:
                print(f"  • Página {img['page']}: Imagem #{img['num']} ({img['width']}x{img['height']}px, tipo {img['type']})")
            if len(large_images) > 25:
                print(f"  ... e mais {len(large_images) - 25} imagens.")
        else:
            print("  (Nenhuma imagem raster grande embutida; provável uso de diagramas vetoriais renderizáveis via crop)")

    print("\n--- Amostra de Páginas / Tópicos Iniciais ---")
    limit = min(total_pages, max_pages_preview)
    for p in range(1, limit + 1):
        txt = extract_pdf_page_text(str(path), p).strip()
        first_line = txt.splitlines()[0] if txt else "(página sem texto ou apenas imagem)"
        first_line = re.sub(r'\s+', ' ', first_line)[:90]
        print(f"  Pág {p:02d}: {first_line}")

    print("\nPara extrair ou recortar figuras relevantes:")
    print(f"  1. Recortar diagrama de página específica:")
    print(f"     python3 extract_material_images.py crop {path} --page <NUM> --output archive/<materia>/resumos/materia/<nome>.png")
    print(f"  2. Renderizar slide inteiro como figura:")
    print(f"     python3 extract_material_images.py render-page {path} --page <NUM> --output archive/<materia>/resumos/materia/<nome>.png")
    print(f"  3. Extrair imagens embutidas brutas:")
    print(f"     python3 extract_material_images.py extract-embedded {path} --output-dir archive/<materia>/resumos/materia/")

def render_page(pdf_path: str, page: int, out_path: str, dpi: int = 200) -> str:
    """Renderiza uma página inteira do PDF com alta resolução."""
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    with tempfile.TemporaryDirectory() as tmpdir:
        prefix = os.path.join(tmpdir, "page")
        cmd = [
            "pdftoppm",
            "-png",
            "-r", str(dpi),
            "-f", str(page),
            "-l", str(page),
            pdf_path,
            prefix
        ]
        run_cmd(cmd)
        generated = sorted(list(Path(tmpdir).glob("page-*.png")))
        if not generated:
            raise RuntimeError(f"Falha ao renderizar página {page} de {pdf_path}")
        
        # Copia para o destino final
        rendered_file = generated[0]
        from PIL import Image
        im = Image.open(rendered_file)
        im.save(out_path)
        print(f"[RENDER SUCESSO] Página {page} salva em {out_path} ({im.size[0]}x{im.size[1]}px, {dpi} DPI)")
        return out_path

def crop_diagram(pdf_path: str, page: int, out_path: str, top: int = None, bottom: int = None, left: int = None, right: int = None, padding: int = 20, dpi: int = 200) -> str:
    """
    Renderiza a página do material em alta resolução e recorta a região do diagrama
    aplicando margem de segurança contra cortes de equações e legendas.
    """
    from PIL import Image
    import numpy as np

    with tempfile.TemporaryDirectory() as tmpdir:
        prefix = os.path.join(tmpdir, "crop_src")
        cmd = [
            "pdftoppm",
            "-png",
            "-r", str(dpi),
            "-f", str(page),
            "-l", str(page),
            pdf_path,
            prefix
        ]
        run_cmd(cmd)
        generated = sorted(list(Path(tmpdir).glob("crop_src-*.png")))
        if not generated:
            raise RuntimeError(f"Falha ao renderizar página {page} de {pdf_path}")
        
        im = Image.open(generated[0])
        width, height = im.size
        gray = np.array(im.convert("L"))

        # Se coordenadas não forem fornecidas, faz auto-detecção de conteúdo central
        if top is None and bottom is None and left is None and right is None:
            # Detecta linhas não-brancas (ignorando os 5% superiores e 5% inferiores para evitar cabeçalhos de slide)
            margin_y = int(height * 0.05)
            sub_gray = gray[margin_y:height - margin_y, :]
            non_white_rows = np.where(np.any(sub_gray < 245, axis=1))[0]
            if len(non_white_rows) > 0:
                y1 = max(0, int(non_white_rows[0] + margin_y) - padding)
                y2 = min(height, int(non_white_rows[-1] + margin_y) + padding)
            else:
                y1, y2 = 0, height

            non_white_cols = np.where(np.any(gray[y1:y2, :] < 245, axis=0))[0]
            if len(non_white_cols) > 0:
                x1 = max(0, int(non_white_cols[0]) - padding)
                x2 = min(width, int(non_white_cols[-1]) + padding)
            else:
                x1, x2 = 0, width
        else:
            # Aplica coordenadas especificadas com escala se necessário
            y1 = max(0, (top or 0) - padding)
            y2 = min(height, (bottom or height) + padding)
            x1 = max(0, (left or 0) - padding)
            x2 = min(width, (right or width) + padding)

        cropped = im.crop((x1, y1, x2, y2))
        os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
        cropped.save(out_path)
        print(f"[CROP SUCESSO] Diagrama recortado salvo em {out_path} ({cropped.size[0]}x{cropped.size[1]}px, bbox=({x1}, {y1}, {x2}, {y2}))")
        return out_path

def extract_embedded_all(pdf_path: str, output_dir: str, min_size: int = 150) -> list[str]:
    """Extrai todas as imagens embutidas do PDF com pdfimages -png."""
    os.makedirs(output_dir, exist_ok=True)
    base_name = Path(pdf_path).stem
    prefix = os.path.join(output_dir, f"{base_name}-img")
    cmd = ["pdfimages", "-png", pdf_path, prefix]
    run_cmd(cmd)

    extracted = sorted(list(Path(output_dir).glob(f"{base_name}-img-*.png")))
    valid_extracted = []
    
    from PIL import Image
    for p in extracted:
        try:
            im = Image.open(p)
            w, h = im.size
            if w < min_size or h < min_size:
                # Remove ícones pequenos irrelevantes
                os.remove(p)
            else:
                valid_extracted.append(str(p))
        except Exception:
            continue

    print(f"[EXTRAÇÃO SUCESSO] {len(valid_extracted)} imagens úteis extraídas em {output_dir}")
    return valid_extracted

def main():
    parser = argparse.ArgumentParser(description="Extrator de imagens e diagramas para materiais teóricos.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    # Inspecionar
    p_inspect = subparsers.add_parser("inspect", help="Inspeciona o conteúdo e imagens do PDF.")
    p_inspect.add_argument("pdf_path", help="Caminho do arquivo PDF do material")
    p_inspect.add_argument("--max-pages", type=int, default=20, help="Número máximo de páginas para preview")

    # Renderizar página inteira
    p_render = subparsers.add_parser("render-page", help="Renderiza slide ou página inteira.")
    p_render.add_argument("pdf_path", help="Caminho do PDF")
    p_render.add_argument("--page", type=int, required=True, help="Número da página (1-indexed)")
    p_render.add_argument("--output", required=True, help="Caminho de saída da imagem (.png)")
    p_render.add_argument("--dpi", type=int, default=200, help="Resolução DPI (default: 200)")

    # Recortar diagrama
    p_crop = subparsers.add_parser("crop", help="Recorta região ou diagrama de uma página.")
    p_crop.add_argument("pdf_path", help="Caminho do PDF")
    p_crop.add_argument("--page", type=int, required=True, help="Número da página (1-indexed)")
    p_crop.add_argument("--output", required=True, help="Caminho de saída da imagem (.png)")
    p_crop.add_argument("--top", type=int, default=None, help="Limite superior Y1")
    p_crop.add_argument("--bottom", type=int, default=None, help="Limite inferior Y2")
    p_crop.add_argument("--left", type=int, default=None, help="Limite esquerdo X1")
    p_crop.add_argument("--right", type=int, default=None, help="Limite direito X2")
    p_crop.add_argument("--padding", type=int, default=20, help="Margem de segurança em pixels")
    p_crop.add_argument("--dpi", type=int, default=200, help="Resolução DPI")

    # Extrair embutidas
    p_embed = subparsers.add_parser("extract-embedded", help="Extrai todas as imagens raster embutidas no PDF.")
    p_embed.add_argument("pdf_path", help="Caminho do PDF")
    p_embed.add_argument("--output-dir", required=True, help="Diretório de destino das imagens")
    p_embed.add_argument("--min-size", type=int, default=150, help="Dimensão mínima em pixels para preservar")

    args = parser.parse_args()

    if args.command == "inspect":
        inspect_material(args.pdf_path, args.max_pages)
    elif args.command == "render-page":
        render_page(args.pdf_path, args.page, args.output, args.dpi)
    elif args.command == "crop":
        crop_diagram(args.pdf_path, args.page, args.output, args.top, args.bottom, args.left, args.right, args.padding, args.dpi)
    elif args.command == "extract-embedded":
        extract_embedded_all(args.pdf_path, args.output_dir, args.min_size)

if __name__ == "__main__":
    main()
