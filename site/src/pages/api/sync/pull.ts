import type { APIRoute } from 'astro';
import { createPullBundle } from '../../../lib/sync';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, clientAddress }) => {
  const user = locals.user;
  if (!user) {
    return new Response(JSON.stringify({ error: 'Não autorizado. Credenciais inválidas ou ausentes.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const ip = clientAddress || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
  const ua = request.headers.get('user-agent') || null;

  let requestedFiles: string[] = [];
  try {
    const body = await request.json();
    if (Array.isArray(body.files)) {
      requestedFiles = body.files.filter((item: any): item is string => typeof item === 'string' && item.trim().length > 0);
    }
  } catch {
    return new Response(JSON.stringify({ error: 'Corpo da requisição deve ser um JSON válido contendo {"files": string[]}.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (requestedFiles.length === 0) {
    return new Response(JSON.stringify({ error: 'Nenhum arquivo válido foi solicitado para download.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const zipBuffer = createPullBundle(user.id, requestedFiles, ip, ua);

    return new Response(zipBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="sync-delta.zip"',
        'Content-Length': String(zipBuffer.length),
      },
    });
  } catch (err: any) {
    console.error(`[SYNC PULL] Erro ao empacotar arquivos para usuário ${user.id}:`, err);
    return new Response(JSON.stringify({ error: `Erro ao gerar pacote de pull: ${err.message}` }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
