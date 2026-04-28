import { defineConfig } from '@stryker-mutator/core';

export default defineConfig({
  packageManager: 'npm',
  reporters: ['html', 'clear-text', 'progress', 'dashboard'],
  testRunner: 'vitest',
  vitest: {
    configFile: 'backend/vitest.config.ts',
  },
  coverageAnalysis: 'perTest',
  mutate: [
    'backend/src/policy/**/*.ts',
    'backend/src/services/**/*.ts',
  ],
  threshold: {
    mutations: 80,
  },
  timeoutMS: 30000,
  concurrency: 2,
});