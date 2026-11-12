// Erzeugt die App-Icons (Klubhaus-Stil: Waldgrün, Messing-Ring, Springer aus dem Figurensatz cburnett des Bretts).
//   node scripts/icons.mjs
// Ergebnis in public/icons/ (wird eingecheckt). Gerendert mit dem Chromium aus Playwright.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const css = readFileSync('node_modules/@lichess-org/chessground/assets/chessground.cburnett.css', 'utf8');
const m = css.match(/piece\.knight\.white\s*\{\s*background-image:\s*url\('data:image\/svg\+xml;base64,([^']+)'\)/);
if (!m) throw new Error('Springer nicht gefunden');
const knight = Buffer.from(m[1], 'base64').toString('utf8');
// Inneren Teil des 45×45-SVG übernehmen
const inner = knight.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');

const GREEN = '#183d30';
const GREEN_DARK = '#10291f';
const BRASS = '#e0b24f';

/**
 * scale: Größe des Springers relativ zur Fläche. Maskable-Icons (Android) brauchen Rand,
 * weil das System bis zu 20 % rundherum abschneidet; iOS rundet die Ecken selbst ab.
 */
function iconSvg({ ring = true, scale = 0.62 } = {}) {
  const k = 512 * scale;
  const off = (512 - k) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs><radialGradient id="g" cx="50%" cy="38%" r="70%"><stop offset="0" stop-color="${GREEN}"/><stop offset="1" stop-color="${GREEN_DARK}"/></radialGradient></defs>
  <rect width="512" height="512" fill="url(#g)"/>
  ${ring ? `<circle cx="256" cy="256" r="${200 * (scale / 0.62)}" fill="none" stroke="${BRASS}" stroke-width="${10 * (scale / 0.62)}" opacity="0.9"/>` : ''}
  <g transform="translate(${off} ${off - k * 0.02}) scale(${k / 45})">${inner}</g>
</svg>`;
}

mkdirSync('public/icons', { recursive: true });
const variants = [
  { file: 'icon-192.png', size: 192, svg: iconSvg() },
  { file: 'icon-512.png', size: 512, svg: iconSvg() },
  { file: 'icon-maskable-512.png', size: 512, svg: iconSvg({ scale: 0.5 }) },
  { file: 'apple-touch-icon.png', size: 180, svg: iconSvg() },
  { file: 'favicon-32.png', size: 32, svg: iconSvg({ ring: false, scale: 0.8 }) },
];
writeFileSync('public/icons/icon.svg', iconSvg());
writeFileSync('public/favicon.svg', iconSvg({ ring: false, scale: 0.8 }));

const browser = await chromium.launch();
const page = await browser.newPage();
for (const v of variants) {
  await page.setViewportSize({ width: v.size, height: v.size });
  await page.setContent(`<html><body style="margin:0">${v.svg.replace('width="512" height="512"', `width="${v.size}" height="${v.size}"`)}</body></html>`);
  await page.screenshot({ path: `public/icons/${v.file}`, clip: { x: 0, y: 0, width: v.size, height: v.size } });
  console.log('geschrieben', v.file);
}
await browser.close();
