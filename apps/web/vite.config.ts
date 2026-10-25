import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { build } from 'esbuild';
import { defineConfig, type Plugin } from 'vite';

const apiTarget = process.env.API_URL || 'http://127.0.0.1:3000';

/**
 * Inlines src/preferences/bootstrap.ts as a classic blocking script at the top of <head>, so the
 * saved theme and reading preferences are applied before the first paint (no flash).
 */
function inlinePreferencesBootstrap(): Plugin {
  const entry = fileURLToPath(new URL('./src/preferences/bootstrap.ts', import.meta.url));
  return {
    name: 'inline-preferences-bootstrap',
    async transformIndexHtml() {
      const result = await build({ entryPoints: [entry], bundle: true, write: false, format: 'iife', minify: true });
      return [{ tag: 'script', children: result.outputFiles[0]?.text ?? '', injectTo: 'head' }];
    },
  };
}

export default defineConfig({
  plugins: [inlinePreferencesBootstrap(), react(), tailwindcss()],
  server: {
    port: Number(process.env.WEB_PORT || 5173),
    proxy: {
      '/api': apiTarget,
      '/admin/api': apiTarget,
    },
  },
  worker: { format: 'es' },
  build: { target: 'es2022', sourcemap: true },
});
