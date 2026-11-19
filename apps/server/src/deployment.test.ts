import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * A first deployment (scripts/deploy-server.sh) writes the host's .env; the
 * compose file refuses to start without some of its settings. The two are
 * read here, never run.
 */
const read = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');

describe('a first deployment of the server', () => {
  const compose = read('infra/docker-compose.yml');
  const script = read('scripts/deploy-server.sh');
  // The network boot's secret is asked by its own service only, started by hand for an install.
  const required = [...new Set([...compose.matchAll(/\$\{([A-Z_]+):\?/g)].map((m) => m[1]))].filter(
    (name) => name !== 'NETBOOT_SECRET',
  );

  it('writes every setting the compose file requires', () => {
    expect(required).toContain('ADMIN_NETWORKS');
    for (const name of required) expect(script).toContain(`echo "${name}=`);
  });

  it('asks for the networks of /admin before building, without a default', () => {
    const check = script.indexOf('set CHARPENTIER_HOST, BACKUP_ARCHIVE and ADMIN_NETWORKS');
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(script.indexOf('pnpm --filter'));
    // Never the private ranges, which hold Docker's bridges (infra/README.md).
    expect(script).not.toMatch(/ADMIN_NETWORKS:-[^}]/);
    expect(script).toContain('echo "ADMIN_NETWORKS=$4"');
  });

  it('documents every required setting in .env.example', () => {
    const example = read('infra/.env.example');
    for (const name of required) expect(example).toMatch(new RegExp(`^${name}=`, 'm'));
  });
});
