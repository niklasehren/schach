/// <reference types="vitest/config" />
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages liefert die App unter /schach/ aus; nur die Entwicklungs-Vorschau läuft unter /
export default defineConfig(({ command, isPreview }) => {
  const base = command === 'serve' && !isPreview ? '/' : '/schach/';
  return {
    base,
    // Version der App (zur Anzeige in den Einstellungen und für den Update-Test)
    define: {
      __APP_VERSION__: JSON.stringify(process.env.VITE_APP_VERSION ?? new Date().toISOString().slice(0, 16).replace('T', ' ')),
    },
    plugins: [
      react(),
      tailwindcss(),
      // Progressive Web App: installierbar, offline nutzbar. Neue Versionen erst nach Klick auf „Neu laden“.
      VitePWA({
        registerType: 'prompt',
        injectRegister: false,
        // Icons und Manifest kommen schon über globPatterns bzw. das Plugin selbst – nicht doppelt
        includeManifestIcons: false,
        manifest: {
          id: base,
          name: 'Schach',
          short_name: 'Schach',
          description: 'Persönlicher Schachberater: Partien analysieren, aus eigenen Fehlern trainieren.',
          lang: 'de',
          start_url: base,
          scope: base,
          display: 'standalone',
          orientation: 'any',
          background_color: '#121519',
          theme_color: '#121519',
          icons: [
            { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            {
              src: 'icons/icon-maskable-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          // App, Schriften, Stockfish (JS + WASM) und alle Puzzle-Themen vorab speichern → offline nutzbar
          globPatterns: ['**/*.{js,css,html,svg,png,woff2,wasm,txt}'],
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
          navigateFallback: 'index.html',
          cleanupOutdatedCaches: true,
          // Supabase und Chess.com nie aus dem Speicher – die Synchronisierung holt offline Verpasstes nach
          navigateFallbackDenylist: [/^\/functions\//],
        },
        devOptions: { enabled: false },
      }),
    ],
    resolve: { alias: { '@': path.resolve(__dirname, './src') } },
    test: { include: ['tests/unit/**/*.test.ts'] },
  };
});
