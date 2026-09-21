import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const resumos = defineCollection({
  loader: glob({
    pattern: '**/resumos/**/*.{md,mdx}',
    base: '../archive',
    generateId: ({ entry }) => entry.replace(/^.*\/resumos\//, '').replace(/\.(md|mdx)$/, ''),
  }),
  schema: z.object({
    materia: z.string().default('pds'),
    title: z.string(),
    topic: z.string(),
    chapter: z.number(),
    description: z.string(),
    order: z.number().default(1),
    relatedQuestions: z.array(z.string()).default([]),
    sections: z
      .array(
        z.object({
          id: z.string(),
          title: z.string(),
        })
      )
      .optional(),
  }),
});

const questoes = defineCollection({
  loader: glob({
    pattern: '**/questoes/**/*.{md,mdx}',
    base: '../archive',
    generateId: ({ entry }) => entry.replace(/^.*\/questoes\//, '').replace(/\.(md|mdx)$/, ''),
  }),
  schema: z.object({
    materia: z.string().default('pds'),
    id: z.string(),
    title: z.string(),
    exam: z.string(),
    year: z.number(),
    topic: z.string(),
    topicSlug: z.string(),
    difficulty: z.enum(['Fácil', 'Médio', 'Difícil']).default('Médio'),
    type: z.enum(['multipla_escolha', 'discursiva']).default('multipla_escolha'),
    statement: z.string().optional(),
    options: z.array(
      z.object({
        label: z.string(),
        text: z.string(),
      })
    ).optional(),
    correctOption: z.string().optional(),
    expectedAnswer: z.string().optional(),
    image: z.string().optional(),
  }),
});

export const collections = {
  resumos,
  questoes,
};
