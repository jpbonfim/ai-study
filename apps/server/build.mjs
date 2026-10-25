// Bundles the server into dist/server.mjs (plain Node, no TypeScript loader needed at runtime).
import { build } from 'esbuild';
import { RUNTIME_EXTERNALS } from './runtime-externals.mjs';

await build({
  entryPoints: ['src/main.ts'],
  outfile: 'dist/server.mjs',
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  sourcemap: true,
  external: RUNTIME_EXTERNALS,
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
});
