import { execFileSync } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

/** Baut die App (wie für GitHub Pages unter /schach/) mit fester Versionsangabe in ein eigenes Verzeichnis */
export function buildApp(outDir: string, version: string) {
  execFileSync('npx', ['vite', 'build', '--outDir', outDir, '--emptyOutDir', '--logLevel', 'error'], {
    env: { ...process.env, VITE_APP_VERSION: version },
    stdio: 'inherit',
  });
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.wasm': 'application/wasm',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

/** Kleiner Server wie GitHub Pages: liefert ein Build-Verzeichnis unter /schach/ aus; das Verzeichnis lässt sich umschalten (= neue Version) */
export async function serveApp(root: string): Promise<{ url: string; setRoot: (dir: string) => void; close: () => Promise<void> }> {
  let current = root;
  const server: Server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    if (!path.startsWith('/schach/')) {
      res.writeHead(404).end();
      return;
    }
    let file = normalize(join(current, path.slice('/schach/'.length) || 'index.html'));
    if (!file.startsWith(current) || !existsSync(file) || statSync(file).isDirectory()) file = join(current, 'index.html');
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(readFileSync(file));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  return {
    url: `http://127.0.0.1:${port}/schach/`,
    setRoot: (dir) => (current = dir),
    close: () => new Promise((r) => server.close(() => r())),
  };
}
