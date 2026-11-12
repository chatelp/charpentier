import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';

/**
 * Main and preload are bundled with everything they use (workspace packages
 * are TypeScript sources): the packaged app needs no node_modules.
 */
export default defineConfig({
  main: {
    build: { externalizeDeps: false, target: 'node24' },
  },
  preload: {
    // Sandboxed preload scripts must be CommonJS.
    build: {
      externalizeDeps: false,
      rollupOptions: { output: { format: 'cjs', entryFileNames: '[name].cjs' } },
    },
  },
  renderer: {
    plugins: [
      react(),
      {
        // A strict content security policy for the built app (the dev server needs more).
        name: 'charpentier-csp',
        apply: 'build',
        transformIndexHtml: (html) =>
          html.replace(
            '<head>',
            `<head>\n    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'" />`,
          ),
      },
    ],
    build: { target: 'es2023' },
  },
});
