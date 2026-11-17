import react from '@vitejs/plugin-react';
import { execFileSync } from 'node:child_process';
import { defineConfig } from 'electron-vite';

/**
 * The commit the app is built from, shown beside its version (a development
 * build keeps the last release's number): given by Nix, which builds without
 * the repository's history (CHARPENTIER_COMMIT), else asked of git.
 */
function commit(): string {
  const given = process.env['CHARPENTIER_COMMIT'];
  if (given !== undefined) return given.slice(0, 7);
  try {
    return execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

/**
 * Main and preload are bundled with everything they use (workspace packages
 * are TypeScript sources): the packaged app needs no node_modules.
 */
export default defineConfig({
  main: {
    build: { externalizeDeps: false, target: 'node24' },
    define: { __CHARPENTIER_COMMIT__: JSON.stringify(commit()) },
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
