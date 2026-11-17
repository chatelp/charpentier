import react from '@vitejs/plugin-react';
import { execFileSync } from 'node:child_process';
import { defineConfig } from 'electron-vite';

/**
 * The commit the app is built from, shown beside its version (a development
 * build keeps the last release's number), « + » after it when the tree was
 * modified. Asked of git; Nix builds without the history and gives it at
 * launch instead (CHARPENTIER_COMMIT, read by the main process).
 */
function commit(): string {
  const given = process.env['CHARPENTIER_COMMIT'];
  if (given !== undefined) return given;
  try {
    const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim();
    const head = git('rev-parse', '--short=7', 'HEAD');
    return git('status', '--porcelain', '--untracked-files=no') ? `${head}-dirty` : head;
  } catch {
    return '';
  }
}

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
