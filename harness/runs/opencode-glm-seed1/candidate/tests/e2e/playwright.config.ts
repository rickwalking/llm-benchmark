import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  timeout: 60000,
  retries: 2,
  use: {
    baseURL: 'http://localhost:5173',
  },
  webServer: [
    {
      command: 'npm run dev --workspace=backend',
      port: 3001,
      reuseExistingServer: true,
      timeout: 30000,
    },
    {
      command: 'npm run dev --workspace=frontend',
      port: 5173,
      reuseExistingServer: true,
      timeout: 30000,
    },
  ],
});