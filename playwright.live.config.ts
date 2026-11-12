import { defineConfig, devices } from '@playwright/test';

// Live-Browser-Test gegen das echte Supabase-Projekt (Testkonto, danach gelöscht). Nur lokal: npm run test:live
export default defineConfig({
  testDir: 'tests/live',
  testMatch: '**/*.spec.ts',
  timeout: 120_000,
  use: { baseURL: 'http://localhost:5173' },
  webServer: { command: 'npm run dev', port: 5173, reuseExistingServer: true },
  projects: [{ name: 'live', use: { ...devices['Desktop Chrome'] } }],
});
