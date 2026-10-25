import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [{ find: /^src\//, replacement: new URL('./src/', import.meta.url).pathname }]
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node'
  }
});
