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

## 2. Diretriz de Escrita do Resumo Teórico

Ao redigir os capítulos teóricos a partir dos materiais didáticos, siga rigorosamente esta diretriz:

> **"Faça uma explicação teórica completa que abranja todo o conteúdo abordado pelo material. O conteúdo deve ser o suficiente para aprender toda a matéria, não presuma que o leitor já sabe partes do conteúdo.**
>
> **A explicação deve ser direta ao ponto e de fácil entendimento, use linguagem simples e precisa (mantenha as explicações e termos corretos, não faça simplificações que prejudiquem a precisão do conteúdo).**
>
> **Pule demonstrações, foque em resultados práticos.**
>
> **Organize a estrutura do texto de forma lógica e sequencial, os assuntos que se estudam antes devem ser explicados antes.**
>
> **Não perca tempo com introduções, vá direto para a teoria.**
>
> **Faça um texto detalhado explicando todos os tópicos, não tenha medo de textos longos, o importante é passar todos os conteúdos de maneira compreensível!"**

## 3. Workflow

1. Instale as dependências do script de imagens: `pip install Pillow numpy`
2. Inspecione o material de origem com o comando `inspect` do script.
3. Extraia imagens relevantes usando `crop`, `render-page` ou `extract-embedded`. Salve as imagens em `archive/<materia>/resumos/materia/`.
4. Gere o texto teórico estruturado seguindo rigorosamente a diretriz de escrita e crie os arquivos `.mdx` em `archive/<materia>/resumos/materia/`.
5. Referencie as imagens com caminho relativo (`./<imagem>.png`).
6. Valide o MDX com `python3 .agents/skills/_shared/scripts/validate_mdx.py archive/<materia>/resumos/materia/*.mdx`.
7. Execute o build (`npm run build`) na pasta `site/` após concluir.

## 4. Script de Extração

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

## 5. Critério de Relevância para Imagens

Extraia imagens apenas se forem essenciais para a compreensão do conteúdo.

* **O QUE EXTRAIR:** Diagramas esquemáticos de sistemas, circuitos elétricos/lógicos, gráficos de resposta em frequência, curvas características, espectros de sinais, desenhos de transdutores/sensores e tabelas gráficas inviáveis em texto.
* **O QUE NÃO EXTRAIR:** Slides puramente textuais, capas de apresentação, logotipos institucionais, fotos decorativas, ilustrações abstratas ou qualquer elemento não técnico.

## 6. Formato de Saída (Frontmatter e MDX)

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

## 7. Referência a Regras Comuns

> Consulte `.agents/skills/_shared/references/common-rules.md` para regras globais.
