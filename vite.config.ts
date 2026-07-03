import { defineConfig } from 'vite';

export default defineConfig({
  // Rutas relativas para que la build funcione en cualquier subdirectorio
  base: './',
  build: {
    outDir: 'dist',
    target: 'es2022',
  },
});
