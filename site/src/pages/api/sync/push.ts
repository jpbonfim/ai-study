import type { APIRoute } from 'astro';
import { applyPushDelta } from '../../../lib/sync';

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

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (err: any) {
    return new Response(JSON.stringify({ error: 'Erro ao processar dados do formulário.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const bundleFile = formData.get('bundle') as File | null;
  const deletionsRaw = formData.get('deletions');

  let deletions: string[] = [];
  if (typeof deletionsRaw === 'string' && deletionsRaw.trim()) {
    try {
      const parsed = JSON.parse(deletionsRaw);
      if (Array.isArray(parsed)) {
        deletions = parsed.filter((item): item is string => typeof item === 'string');
      }
    } catch {
      return new Response(JSON.stringify({ error: 'Campo "deletions" deve ser um JSON array válido de caminhos.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  let buffer: Buffer | null = null;
  if (bundleFile && bundleFile instanceof File && bundleFile.size > 0) {
    const arrayBuffer = await bundleFile.arrayBuffer();
    buffer = Buffer.from(arrayBuffer);
  }

  if (!buffer && deletions.length === 0) {
    return new Response(JSON.stringify({ error: 'Nenhum arquivo para atualizar ou deletar foi enviado.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const result = await applyPushDelta(user.id, buffer, deletions, ip, ua);

  if (!result.success) {
    return new Response(JSON.stringify({ error: result.error || 'Falha ao aplicar push delta.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(
    JSON.stringify({
      success: true,
      updatedCount: result.updatedCount || 0,
      deletedCount: result.deletedCount || 0,
      message: `Sincronização push concluída: ${result.updatedCount || 0} atualizados, ${result.deletedCount || 0} removidos.`,
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
};
