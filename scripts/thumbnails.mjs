/**
 * Genera una miniatura PNG por mundo para las tarjetas del menu.
 *
 * Arranca `vite preview` sobre el build, abre cada mundo con ?shot=<id>,
 * espera a que la escena se anime y captura el canvas en public/previews/.
 *
 * Uso: npm run thumbnails  (requiere haber hecho antes `npm run build`)
 */
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const PORT = 4188;
const OUT = resolve(root, 'public/previews');
const CHROME = process.env.CHROME_PATH
  || `${process.env.HOME}/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome`;

// Lee los ids de mundos del registry sin compilar TS (regex simple)
const registry = readFileSync(resolve(root, 'src/worlds/registry.ts'), 'utf8');
const ids = [...registry.matchAll(/id:\s*'([^']+)'/g)].map((m) => m[1]);

function waitForServer(url, tries = 60) {
  return new Promise((res, rej) => {
    const tick = async (n) => {
      try { const r = await fetch(url); if (r.ok) return res(); } catch { /* aun no */ }
      if (n <= 0) return rej(new Error('server timeout'));
      setTimeout(() => tick(n - 1), 300);
    };
    tick(tries);
  });
}

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  cwd: root, stdio: 'inherit',
});

try {
  await waitForServer(`http://localhost:${PORT}/`);
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 640, height: 400 }, deviceScaleFactor: 1 });

  for (const id of ids) {
    await page.goto(`http://localhost:${PORT}/?shot=${id}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 15000 }).catch(() => {});
    await page.addStyleTag({ content: '#ui{display:none!important}' }); // fuera HUD/menu
    await page.waitForTimeout(400);
    await page.screenshot({ path: resolve(OUT, `${id}.png`) });
    console.log(`✓ ${id}`);
  }

  await browser.close();
} finally {
  server.kill('SIGTERM');
}
