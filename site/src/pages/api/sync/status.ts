import type { APIRoute } from 'astro';
import { getUserArchiveManifest } from '../../../lib/sync';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  const user = locals.user;
  if (!user) {
    return new Response(JSON.stringify({ error: 'Não autorizado. Credenciais inválidas ou ausentes.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const manifest = getUserArchiveManifest(user.id, user.username);
    return new Response(
      JSON.stringify({
        success: true,
        manifest,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (err: any) {
    console.error(`[SYNC STATUS] Erro ao obter manifesto do usuário ${user.id}:`, err);
    return new Response(
      JSON.stringify({ error: `Erro ao obter manifesto: ${err.message}` }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
