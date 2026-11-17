// Removes Turbo's local cache entries older than a week (Turbo never prunes it
// itself). Everything in it rebuilds: the next build is only slower.
// Usage: pnpm clean:cache [days]
import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve(import.meta.dirname, '..', '.turbo', 'cache');
const days = Number(process.argv[2] ?? 7);
const limit = Date.now() - days * 24 * 3600 * 1000;

let freed = 0;
let removed = 0;
if (fs.existsSync(dir))
  for (const name of fs.readdirSync(dir)) {
    const file = path.join(dir, name);
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.mtimeMs >= limit) continue;
    fs.rmSync(file);
    freed += stat.size;
    removed += 1;
  }
console.log(
  `Turbo cache: ${removed} files older than ${days} days removed, ${(freed / 1e6).toFixed(0)} MB freed.`,
);
