import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  use: { baseURL: 'http://localhost:5173' },
  webServer: { command: 'npm run dev', port: 5173, reuseExistingServer: true },
  projects: [
    { name: 'mac', use: { ...devices['Desktop Chrome'] } },
    { name: 'handy', use: { ...devices['iPhone 13'], browserName: 'chromium' } },
  ],
});
