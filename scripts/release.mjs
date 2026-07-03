// Copia la build (dist/) a ../public, la carpeta servida en internet.
// Vacia public antes de copiar para no dejar assets huerfanos de releases previas.
import { cp, rm, mkdir, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const dist = resolve(import.meta.dirname, '../dist');
const publicDir = resolve(import.meta.dirname, '../../public');

const distFiles = await readdir(dist).catch(() => null);
if (!distFiles || distFiles.length === 0) {
  console.error('dist/ esta vacio. Ejecuta `npm run build` primero.');
  process.exit(1);
}

await rm(publicDir, { recursive: true, force: true });
await mkdir(publicDir, { recursive: true });
await cp(dist, publicDir, { recursive: true });
console.log(`Release copiada a ${publicDir}`);
