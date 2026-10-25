// Bundles the server into dist/server.mjs (plain Node, no TypeScript loader needed at runtime).
// Native and CommonJS-heavy packages stay external and are loaded from node_modules.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/main.ts'],
  outfile: 'dist/server.mjs',
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  sourcemap: true,
  external: ['better-sqlite3', 'bcryptjs', 'busboy', 'yauzl', 'yazl', 'gray-matter'],
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
});
