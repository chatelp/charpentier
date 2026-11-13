/**
 * What the server needs from Postgres: `pg`'s Pool in production, PGlite
 * (Postgres in WebAssembly) in the tests. Both answer `query(text, params)`.
 */
export interface Database {
  query<Row = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<{ readonly rows: Row[] }>;
}

/** Creates or updates the tables (idempotent: run at every start). */
export async function migrate(db: Database): Promise<void> {
  await db.query(`
    create table if not exists documents (
      name text primary key,
      state bytea not null,
      updated_at timestamptz not null default now()
    )
  `);
}

/** A document's whole Yjs state, as stored by the last save, or null if it is new. */
export async function loadDocument(db: Database, name: string): Promise<Uint8Array | null> {
  const { rows } = await db.query<{ state: Uint8Array }>(
    'select state from documents where name = $1',
    [name],
  );
  return rows[0]?.state ?? null;
}

/** Saves a document's whole Yjs state (Hocuspocus merges the updates before calling it). */
export async function storeDocument(db: Database, name: string, state: Uint8Array): Promise<void> {
  await db.query(
    `insert into documents (name, state, updated_at) values ($1, $2, now())
     on conflict (name) do update set state = excluded.state, updated_at = now()`,
    [name, state],
  );
}
