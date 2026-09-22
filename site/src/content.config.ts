import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const tagSchema = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((val) => {
    if (!val) return ['teste-1'];
    const arr = Array.isArray(val) ? val : [val];
    return arr.map((t) => t.trim()).filter(Boolean);
  });

const resumos = defineCollection({
  loader: glob({
    pattern: '**/resumos/**/*.{md,mdx}',
    base: '../archive',
    generateId: ({ entry }) => entry.replace(/^.*\/resumos\//, '').replace(/\.(md|mdx)$/, ''),
  }),
  schema: z
    .object({
      materia: z.string().default('pds'),
      title: z.string(),
      topic: z.string(),
      chapter: z.number(),
      description: z.string(),
      order: z.number().default(1),
      tags: tagSchema,
      tag: z.string().optional(),
      relatedQuestions: z.array(z.string()).default([]),
      sections: z
        .array(
          z.object({
            id: z.string(),
            title: z.string(),
          })
        )
        .optional(),
    })
    .transform((data) => {
      const tags = [...(data.tags || [])];
      if (data.tag && !tags.includes(data.tag)) {
        tags.push(data.tag);
      }
      return {
        ...data,
        tags: tags.length > 0 ? tags : ['teste-1'],
      };
    }),
});

const questoes = defineCollection({
  loader: glob({
    pattern: '**/questoes/**/*.{md,mdx}',
    base: '../archive',
    generateId: ({ entry }) => entry.replace(/^.*\/questoes\//, '').replace(/\.(md|mdx)$/, ''),
  }),
  schema: ({ image }) =>
    z
      .object({
        materia: z.string().default('pds'),
        id: z.string(),
        title: z.string(),
        exam: z.string(),
        year: z.number(),
        topic: z.string(),
        topicSlug: z.string(),
        tags: tagSchema,
        tag: z.string().optional(),
        difficulty: z.enum(['Fácil', 'Médio', 'Difícil']).default('Médio'),
        type: z.enum(['multipla_escolha', 'discursiva']).default('multipla_escolha'),
        statement: z.string().optional(),
        options: z
          .array(
            z.object({
              label: z.string(),
              text: z.string(),
            })
          )
          .optional(),
        correctOption: z.string().optional(),
        expectedAnswer: z.string().optional(),
        image: image().optional(),
        images: z
          .array(
            z.union([
              image(),
              z.object({
                src: image(),
                caption: z.string().optional(),
              }),
            ])
          )
          .optional(),
      })
      .transform((data) => {
        const tags = [...(data.tags || [])];
        if (data.tag && !tags.includes(data.tag)) {
          tags.push(data.tag);
        }
        return {
          ...data,
          tags: tags.length > 0 ? tags : ['teste-1'],
        };
      }),
});

export const collections = {
  resumos,
  questoes,
};
