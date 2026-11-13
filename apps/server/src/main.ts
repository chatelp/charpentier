import pg from 'pg';
import { migrate } from './database';
import { createSyncServer } from './sync-server';

/** Entry point of the server's Docker image: Postgres from DATABASE_URL, port from PORT. */
const databaseUrl = process.env['DATABASE_URL'];
if (!databaseUrl) {
  console.error('DATABASE_URL is missing.');
  process.exit(1);
}
const port = Number(process.env['PORT'] ?? 8080);
const db = new pg.Pool({ connectionString: databaseUrl });
await migrate(db);
const server = createSyncServer({ db, port, address: '0.0.0.0' });
await server.listen();
console.log(`Charpentier sync server listening on port ${port}.`);
