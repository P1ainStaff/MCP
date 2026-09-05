import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    extensions: ['.mts', '.mjs', '.ts', '.js', '.json'],
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.mts', 'src/__tests__/**/*.spec.mts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    testTimeout: 15000,
  },
});
