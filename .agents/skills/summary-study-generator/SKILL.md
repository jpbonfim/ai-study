---
name: summary-study-generator
description: >-
  Gera cadernos teóricos completos e aprofundados a partir de materiais didáticos da disciplina, extraindo diagramas com utilitário oficial e estruturando resumos contínuos em MDX/KaTeX.
---

# Skill: summary-study-generator

> Leia e siga `.agents/skills/_shared/references/common-rules.md` para regras de KaTeX, destino de arquivos, diretrizes de redação, higiene de workspace e pilares de criação de material.

## 1. Regra de Tags (Obrigatória)

Ao gerar resumos a partir de materiais:
1. Verifique se o usuário forneceu explicitamente o nome da tag (ex: `teste-1`, `teste-2`, `p1`, `prova-2`).
2. Se não forneceu, PARE OBRIGATORIAMENTE e pergunte:
   *"Por favor, informe o nome da tag ou avaliação para este resumo (por exemplo: `teste-1`, `teste-2`, `p1` ou `prova-2`)."*
3. Nunca gere arquivos `.mdx` sem a tag de destino definida.
4. Atribua a tag recebida no campo `tags: ["<tag>"]` do frontmatter.

## 2. Workflow

1. Instale as dependências do script de imagens: `pip install Pillow numpy`
2. Inspecione o material de origem com o comando `inspect` do script.
3. Extraia imagens relevantes usando `crop`, `render-page` ou `extract-embedded`. Salve as imagens em `archive/<materia>/resumos/materia/`.
4. Gere o texto teórico estruturado seguindo as regras e crie os arquivos `.mdx` em `archive/<materia>/resumos/materia/`.
5. Referencie as imagens com caminho relativo (`./<imagem>.png`).
6. Execute o build (`npm run build`) na pasta `site/` após concluir.

## 3. Script de Extração

Utilize o script `.agents/skills/summary-study-generator/scripts/extract_material_images.py` para processar PDFs. 

### Comandos:

**Inspecionar o material:**
```bash
python3 .agents/skills/summary-study-generator/scripts/extract_material_images.py inspect <caminho.pdf> --max-pages 20
```

**Extrair imagens raster embutidas:**
```bash
python3 .agents/skills/summary-study-generator/scripts/extract_material_images.py extract-embedded <caminho.pdf> --output-dir archive/<materia>/resumos/materia/
```

**Recortar diagrama de página específica com auto-detecção ou coordenadas:**
```bash
python3 .agents/skills/summary-study-generator/scripts/extract_material_images.py crop <caminho.pdf> --page <NUM> --output archive/<materia>/resumos/materia/<nome>.png --padding 20
```

**Renderizar slide inteiro:**
```bash
python3 .agents/skills/summary-study-generator/scripts/extract_material_images.py render-page <caminho.pdf> --page <NUM> --output archive/<materia>/resumos/materia/<nome>.png
```

## 4. Critério de Relevância para Imagens

Extraia imagens apenas se forem essenciais para a compreensão do conteúdo.

* **O QUE EXTRAIR:** Diagramas esquemáticos de sistemas, circuitos elétricos/lógicos, gráficos de resposta em frequência, curvas características, espectros de sinais, desenhos de transdutores/sensores e tabelas gráficas inviáveis em texto.
* **O QUE NÃO EXTRAIR:** Slides puramente textuais, capas de apresentação, logotipos institucionais, fotos decorativas, ilustrações abstratas ou qualquer elemento não técnico.

## 5. Formato de Saída (Frontmatter e MDX)

Crie os resumos em `archive/<materia>/resumos/materia/<slug>.mdx`.

### Frontmatter e Estrutura Obrigatórios

```mdx
---
materia: "<materia>"    # Slug da disciplina em archive/<materia>/materia.json
type: "materia"         # OBRIGATÓRIO: Identifica como 'Resumo da matéria'
tags:
  - "<tag>"             # Tag associada à avaliação (ex: teste-1, p1)
title: "Título do Capítulo"
topic: "Tópico Geral"
chapter: 1
order: 1
description: "Descrição breve dos conteúdos do arquivo."
sections:
  - id: "sec-1-id-da-secao"
    title: "1.1 Título da Seção"
---

<div id="sec-1-id-da-secao"></div>

## 1.1 Título da Seção

Texto com explicações teóricas diretas e KaTeX inline $x(t)$ ou em bloco $$.

![Descrição do diagrama](./imagem-extraida.png)

...
```

## 6. Referência a Regras Comuns

> Consulte `.agents/skills/_shared/references/common-rules.md` para regras globais.
