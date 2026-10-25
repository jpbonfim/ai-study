import { defineConfig } from 'vitest/config';

/** Parity suite: needs ../data-dev and .parity/baseline (see tests/parity/README.md). */
export default defineConfig({
  test: {
    include: ['tests/parity/**/*.parity.test.ts'],
    root: new URL('../..', import.meta.url).pathname,
    testTimeout: 60_000,
    hookTimeout: 60_000,
    execArgv: ['--max-old-space-size=8192'],
  },
});
