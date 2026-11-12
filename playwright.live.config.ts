import { defineConfig, devices } from '@playwright/test';

// Live-Browser-Test gegen das echte Supabase-Projekt (Testkonto, danach gelöscht). Nur lokal: npm run test:live
export default defineConfig({
  testDir: 'tests/live',
  testMatch: '**/*.spec.ts',
  timeout: 120_000,
  // LIVE_URL=https://niklasehren.github.io/schach/ prüft die veröffentlichte Seite statt des lokalen Servers
  use: { baseURL: process.env.LIVE_URL ?? 'http://localhost:5173/' },
  webServer: process.env.LIVE_URL ? undefined : { command: 'npm run dev', port: 5173, reuseExistingServer: true },
  projects: [{ name: 'live', use: { ...devices['Desktop Chrome'] } }],
});
