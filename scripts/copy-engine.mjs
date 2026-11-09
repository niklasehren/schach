// Kopiert die Stockfish-Dateien aus node_modules nach public/engine, damit der Browser sie laden kann.
import { cpSync, mkdirSync } from 'node:fs';

const files = ['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm'];
mkdirSync('public/engine', { recursive: true });
for (const f of files) cpSync(`node_modules/stockfish/bin/${f}`, `public/engine/${f}`);
cpSync('node_modules/stockfish/Copying.txt', 'public/engine/COPYING.txt');
