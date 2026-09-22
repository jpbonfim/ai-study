import type { APIRoute } from 'astro';
import { getMateria } from '../../data/materias';
import { generateStandaloneHtml } from '../../utils/generateStandaloneHtml';

export const prerender = false;

export const GET: APIRoute = async ({ params, props }) => {
  const slug = params.materia || (props as any)?.materia?.slug || 'pds';
  const materia = getMateria(slug);

  const materiaName = materia?.name || slug;
  const html = generateStandaloneHtml(slug);

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': `attachment; filename="${materiaName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.html"`,
    },
  });
};
