/// <reference types="vitest/config" />
// Live-Tests gegen das echte Supabase-Projekt (zwei Testkonten, danach gelöscht).
// Nur lokal: npm run test:live (braucht das CLI-Login per Browser: npx supabase login)
import path from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  test: { include: ['tests/live/**/*.test.ts'], testTimeout: 120_000, hookTimeout: 180_000, fileParallelism: false },
});
