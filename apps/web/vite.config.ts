import react from '@vitejs/plugin-react';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

/** The desktop app's version: the web app is the same app. */
const version = (
  JSON.parse(readFileSync(new URL('../desktop/package.json', import.meta.url), 'utf8')) as {
    version: string;
  }
).version;

/** The commit the app is built from, « + » after it when the tree was modified. */
function commit(): string {
  try {
    const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim();
    const head = git('rev-parse', '--short=7', 'HEAD');
    return git('status', '--porcelain', '--untracked-files=no') ? `${head}+` : head;
  } catch {
    return '';
  }
}

export default defineConfig({
  plugins: [react()],
  define: {
    __CHARPENTIER_VERSION__: JSON.stringify(version),
    __CHARPENTIER_COMMIT__: JSON.stringify(commit()),
  },
  build: { target: 'es2023' },
  server: { port: 5173, strictPort: true },
});
