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

const [command, argument] = process.argv.slice(2);
if (command) {
  if (!(COMMANDS as readonly string[]).includes(command)) {
    console.error(`Unknown command: ${command}. Commands: ${COMMANDS.join(', ')}.`);
    process.exit(2);
  }
  const code = await runCommand(db, command as (typeof COMMANDS)[number], argument);
  await db.end();
  process.exit(code);
}

const port = Number(process.env['PORT'] ?? 8080);
const cacheDir = process.env['CACHE_DIR'] ?? '/data/nix-cache';
const server = createSyncServer({ db, port, address: '0.0.0.0', cacheDir });
await server.listen();
console.log(`Charpentier sync server listening on port ${port}.`);
