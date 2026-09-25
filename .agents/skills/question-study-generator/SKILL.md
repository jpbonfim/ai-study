---
name: question-study-generator
description: >-
  Gera cadernos teóricos completos e aprofundados baseados no conteúdo cobrado por provas e exames universitários, orquestrando subagentes para resolução de questões.
---

# Skill: Gerador de Cadernos Teóricos e Estudo por Questões (`question-study-generator`)

## 1. Regra de Tags (Obrigatória)

Todos os conteúdos e questões resolvidas são organizados por tags de avaliação (ex: `teste-1`, `p1`, `prova-2`).

> **ATENÇÃO:**
> 1. Verifique se o usuário forneceu explicitamente o nome da tag.
> 2. Se o usuário NÃO forneceu a tag, PARE e pergunte diretamente: *"Por favor, informe o nome da tag ou avaliação para este conteúdo (por exemplo: `teste-1`, `teste-2`, `p1` ou `prova-2`)."*
> 3. Nunca gere arquivos `.mdx` ou dispare subagentes sem que a tag esteja definida.
> 4. Adicione a tag definida no campo `tags: ["<tag>"]` do frontmatter de todos os arquivos gerados.

## 2. Diretriz de Escrita do Resumo Teórico

Ao redigir os cadernos teóricos, siga rigorosamente esta diretriz:

> **"Faça uma explicação teórica completa que aborde todo o conteúdo cobrado pelas provas. O conteúdo deve ser o suficiente para resolver todas as questões das provas sem conhecimento prévio dos tópicos abordados.**
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

Siga rigorosamente estes passos ao usar a skill:
1. **Pedir tag:** Confirme com o usuário a tag de avaliação antes de iniciar.
2. **Inspecionar PDF:** Inspecione os materiais de origem para mapear o volume de questões.
3. **Lançar subagentes:** Paralelize a resolução de provas usando subagentes com a tag correta.
4. **Consolidar resumo:** Após o retorno dos subagentes, redija o caderno teórico seguindo a diretriz de escrita acima.
5. **Validar:** Revise a compilação e referências (imagens, QuestionCards).

## 4. Orquestração de Subagentes

Quando houver múltiplas avaliações ou muitas questões, use a ferramenta `invoke_subagent` para paralelizar a resolução. 

### Padrão Genérico de Invocação

Use este modelo para lançar os subagentes:

```json
{
  "Subagents": [
    {
      "TypeName": "self",
      "Role": "Resolvedor <prova>",
      "Prompt": "Utilize a skill explain-question para inspecionar, recortar imagens e resolver as questões de 'material/provas/<prova>.pdf'. Explique a teoria (<Theory>) e resolva passo a passo (<Resolution>). Adicione a tag no frontmatter: tags: ['<tag>']. Salve cada questão em 'archive/<materia>/questoes/<prova>-qX.mdx'. Recorte figuras para 'archive/<materia>/questoes/<nome_figura>.png' e referencie com 'image: \"./<nome_figura>.png\"'. NUNCA salve em 'site/public/'. Limpe rascunhos. Responda com os IDs das questões criadas e seus tópicos."
    }
  ]
}
```

### Regras de Execução

1. **Sem Polling:** Após lançar os subagentes, não faça polling. Pare de chamar ferramentas e aguarde as mensagens do sistema.
2. **Delegação:** Cada subagente deve usar a skill `explain-question` para inspecionar o PDF, recortar figuras preservando contexto, estruturar a resolução (`<Theory>` e `<Resolution>`) e inserir a tag no frontmatter.
3. **Higiene:** Delete qualquer script temporário de extração de imagens (`crop_*.py`) antes de finalizar.
4. **Consolidação:** O agente principal coleta os IDs das questões criadas pelos subagentes e redige o caderno teórico (`archive/<materia>/resumos/<slug>.mdx`) garantindo que a teoria cubra todas as questões resolvidas. Adicione todos os IDs em `relatedQuestions` no frontmatter do resumo.
5. **Inserção de QuestionCard:** Insira o componente `<QuestionCard id="<id-da-questao>" />` diretamente no meio da teoria do resumo (logo após a explicação correspondente ao tópico da questão).

## 5. Formato de Saída — Resumo Teórico

Crie os capítulos teóricos (`archive/<materia>/resumos/<slug>.mdx`) seguindo rigorosamente a estrutura abaixo:

```mdx
---
materia: "<materia>"
tags:
  - "<tag>"
title: "Título do Capítulo"
topic: "Tópico"
chapter: 1
order: 1
description: "Descrição breve do capítulo."
relatedQuestions:
  - "<id-questao-1>"
  - "<id-questao-2>"
sections:
  - id: "id-secao-1"
    title: "1.1 Título da Seção"
  - id: "id-secao-2"
    title: "1.2 Título da Seção"
---

<div id="id-secao-1"></div>

## 1.1 Título da Seção

[Explicação teórica completa aqui, focada em resultados práticos sem demonstrações complexas]

[Fórmulas em KaTeX: $x$ ou $$y$$]

<!-- Inserção contextual do card da questão referenciada acima: LOGO APÓS a teoria correspondente -->
<QuestionCard id="<id-questao-1>" />

<div id="id-secao-2"></div>

## 1.2 Título da Seção

[Continuar a teoria para o próximo tópico...]

<QuestionCard id="<id-questao-2>" />
```

## 6. Referência a Regras Comuns

> Leia e siga `.agents/skills/_shared/references/common-rules.md` para diretrizes de ouro sobre redação teórica, uso de KaTeX, destino correto de arquivos e higiene obrigatória do workspace.
