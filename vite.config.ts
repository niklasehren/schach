/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages liefert die App unter /schach/ aus; nur die Entwicklungs-Vorschau läuft unter /
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'serve' && !isPreview ? '/' : '/schach/',
  plugins: [react()],
  test: { include: ['tests/unit/**/*.test.ts'] },
}));
