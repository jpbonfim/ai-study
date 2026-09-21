import type { APIRoute } from 'astro';
import { MATERIAS } from '../../data/materias';
import { generateStandaloneHtml } from '../../utils/generateStandaloneHtml';

export async function getStaticPaths() {
  return MATERIAS.filter((m) => m.status === 'active').map((materia) => ({
    params: { materia: materia.slug },
    props: { materia },
  }));
}

export const GET: APIRoute = async ({ props }) => {
  const { materia } = props;
  const html = generateStandaloneHtml(materia.slug);

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': `attachment; filename="${materia.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.html"`,
    },
  });
};
