import type { APIRoute } from 'astro';
import { processFullArchiveUpload, processMateriaUpload } from '../../lib/upload';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, clientAddress }) => {
  const user = locals.user;
  if (!user) {
    return new Response(JSON.stringify({ error: 'Não autorizado. Faça login primeiro.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const ip = clientAddress || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
  const ua = request.headers.get('user-agent') || null;

  // Determina limite de upload baseado no perfil
  const maxMb = user.role === 'admin'
    ? parseInt(process.env.MAX_UPLOAD_MB_ADMIN || '100', 10)
    : parseInt(process.env.MAX_UPLOAD_MB_NORMAL || '50', 10);
  const maxBytes = maxMb * 1024 * 1024;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (err: any) {
    return new Response(JSON.stringify({ error: 'Erro ao processar o formulário de upload.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const file = formData.get('file') as File | null;
  const uploadType = String(formData.get('type') || 'archive');
  const materiaSlug = String(formData.get('materia_slug') || '').trim();

  if (!file || !(file instanceof File) || file.size === 0) {
    return new Response(JSON.stringify({ error: 'Nenhum arquivo ZIP foi enviado.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (file.size > maxBytes) {
    return new Response(
      JSON.stringify({
        error: `O arquivo enviado excede o limite máximo permitido de ${maxMb} MB.`,
      }),
      {
        status: 413,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (uploadType === 'materia') {
    if (!materiaSlug) {
      return new Response(JSON.stringify({ error: 'Identificador da matéria não informado.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const result = await processMateriaUpload(user.id, materiaSlug, buffer, ip, ua);
    if (!result.success) {
      return new Response(JSON.stringify({ error: result.error }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Matéria "${materiaSlug}" atualizada com sucesso (${result.filesCount} arquivos).`,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  // Upload do archive completo
  const result = await processFullArchiveUpload(user.id, buffer, ip, ua);
  if (!result.success) {
    return new Response(JSON.stringify({ error: result.error }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(
    JSON.stringify({
      success: true,
      message: `Archive completo atualizado com sucesso (${result.filesCount} arquivos).`,
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
};
