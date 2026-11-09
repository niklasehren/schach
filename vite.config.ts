/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages liefert die App unter /schach/ aus, lokal unter /
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/schach/' : '/',
  plugins: [react()],
  test: { include: ['tests/unit/**/*.test.ts'] },
}));
