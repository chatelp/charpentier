// Copies the administration page's style next to the bundled server
// (dist/admin/), for the Docker image (docs/DESIGN.md §4.13).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const target = fileURLToPath(new URL('../dist/admin/', import.meta.url));
fs.mkdirSync(target, { recursive: true });
for (const source of [
  'packages/core/src/styles/tokens.css',
  'docs/design/admin/admin.css',
  'packages/core/src/fonts/JetBrainsMono-Variable.woff2',
])
  fs.copyFileSync(path.join(root, source), path.join(target, path.basename(source)));

// The app for the browser (phase 4.7 a), when it was built (`pnpm --filter
// @charpentier/web build`): dist/web/, served by the server. Always a folder,
// so that the Dockerfile's COPY finds one.
const web = fileURLToPath(new URL('../dist/web/', import.meta.url));
const built = path.join(root, 'apps/web/dist');
fs.rmSync(web, { recursive: true, force: true });
fs.mkdirSync(web, { recursive: true });
if (fs.existsSync(path.join(built, 'index.html'))) fs.cpSync(built, web, { recursive: true });
