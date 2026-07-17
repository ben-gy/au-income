// vitest/config re-exports defineConfig with the `test` block typed.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: '/',
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
