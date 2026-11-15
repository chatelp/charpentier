import pg from 'pg';
import { COMMANDS, runCommand } from './cli';
import { migrate } from './database';
import { createSyncServer } from './sync-server';

/**
 * Entry point of the server's Docker image: Postgres from DATABASE_URL, port
 * from PORT, the X250's binary cache in CACHE_DIR. With a command
 * (`create-user`, `reset-password`, `create-ci-token`, `revoke-ci-token`), runs it and exits.
 */
const databaseUrl = process.env['DATABASE_URL'];
if (!databaseUrl) {
  console.error('DATABASE_URL is missing.');
  process.exit(1);
}
const db = new pg.Pool({ connectionString: databaseUrl });
await migrate(db);

const [command, ...args] = process.argv.slice(2);
if (command) {
  if (!(COMMANDS as readonly string[]).includes(command)) {
    console.error(`Unknown command: ${command}. Commands: ${COMMANDS.join(', ')}.`);
    process.exit(2);
  }
  const code = await runCommand(db, command as (typeof COMMANDS)[number], args);
  await db.end();
  process.exit(code);
}

const port = Number(process.env['PORT'] ?? 8080);
const cacheDir = process.env['CACHE_DIR'] ?? '/data/nix-cache';
// The X250's network boot (phase 5.9 ter): Pixiecore's secret, and the MACs it serves.
const netboot = {
  secret: process.env['NETBOOT_SECRET'] || null,
  macs: (process.env['NETBOOT_MACS'] ?? '').split(',').filter(Boolean),
};
// The administration page (phase 4.6): who may reach it, the backups it reports on.
const admin = {
  ...(process.env['ADMIN_NETWORKS'] && {
    networks: process.env['ADMIN_NETWORKS'].split(',').filter(Boolean),
  }),
  backupsDir: process.env['BACKUP_DIR'] || null,
  timeZone: process.env['ADMIN_TIMEZONE'] || 'Europe/Paris',
};
const server = createSyncServer({ db, port, address: '0.0.0.0', cacheDir, netboot, admin });
await server.listen();
console.log(`Charpentier sync server listening on port ${port}.`);
