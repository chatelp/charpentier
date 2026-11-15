import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * The page's style, served as is (docs/DESIGN.md §4.13): the app's tokens,
 * the stylesheet of the design session, the system's monospace font. From
 * the sources in development; next to `main.js` in the server's image, where
 * the build copies them (`scripts/copy-admin-assets.mjs`).
 */
export const ADMIN_ASSETS = {
  'tokens.css': {
    source: '../../../../packages/core/src/styles/tokens.css',
    type: 'text/css; charset=utf-8',
  },
  'admin.css': {
    source: '../../../../docs/design/admin/admin.css',
    type: 'text/css; charset=utf-8',
  },
  'JetBrainsMono-Variable.woff2': {
    source: '../../../../packages/core/src/fonts/JetBrainsMono-Variable.woff2',
    type: 'font/woff2',
  },
} as const;
export type AdminAsset = keyof typeof ADMIN_ASSETS;

const cache = new Map<AdminAsset, Buffer>();

export function adminAsset(name: AdminAsset): Buffer {
  const cached = cache.get(name);
  if (cached) return cached;
  const bundled = fileURLToPath(new URL(`./admin/${name}`, import.meta.url));
  const file = fs.existsSync(bundled)
    ? bundled
    : fileURLToPath(new URL(ADMIN_ASSETS[name].source, import.meta.url));
  const content = fs.readFileSync(file);
  cache.set(name, content);
  return content;
}

export const isAdminAsset = (name: string): name is AdminAsset => name in ADMIN_ASSETS;
