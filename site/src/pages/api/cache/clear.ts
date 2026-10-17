import type { APIRoute } from 'astro';
import fs from 'node:fs';
import path from 'node:path';
import { clearPersistentMdxCache, getDataDirectory } from '../../../lib/db';
import { clearServerRenderCache } from '../../../lib/mdx-runtime';

export const prerender = false;

export const POST: APIRoute = async ({ locals }) => {
  const user = locals.user;
  if (!user) {
    return new Response(JSON.stringify({ error: 'Não autorizado. Faça login para limpar o cache.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const clearedEntries = clearPersistentMdxCache();
    clearServerRenderCache();

    // Sincroniza epoch do cache em arquivo se data/ existir
    try {
      const dataDir = getDataDirectory();
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      const epochFile = path.join(dataDir, '.cache_epoch');
      fs.writeFileSync(epochFile, String(Date.now()));
    } catch (epochErr) {
      console.warn('[Cache API] Não foi possível atualizar .cache_epoch:', epochErr);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Cache compilado e em memória do servidor limpos com sucesso.',
        clearedEntries,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (err: any) {
    console.error('[Cache API] Erro ao limpar cache do servidor:', err);
    return new Response(
      JSON.stringify({
        error: 'Falha ao limpar o cache do servidor.',
        details: err?.message,
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
