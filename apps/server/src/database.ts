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
  await db.query(`
    create table if not exists users (
      id uuid primary key,
      email text not null unique,
      password_hash text not null,
      created_at timestamptz not null default now()
    )
  `);
  await db.query(`
    create table if not exists sessions (
      id uuid primary key,
      user_id uuid not null references users (id),
      token_hash text not null unique,
      device text not null default '',
      created_at timestamptz not null default now(),
      last_seen_at timestamptz not null default now(),
      revoked_at timestamptz
    )
  `);
  await db.query(`
    create table if not exists projects (
      id text primary key,
      user_id uuid not null references users (id),
      created_at timestamptz not null default now()
    )
  `);
  // The X250's versions (D-31): the CI's tokens, and every version published.
  await db.query(`
    create table if not exists ci_tokens (
      id uuid primary key,
      name text not null,
      token_hash text not null unique,
      created_at timestamptz not null default now(),
      last_used_at timestamptz,
      revoked_at timestamptz
    )
  `);
  await db.query(`
    create table if not exists updates (
      id bigserial primary key,
      version text not null,
      notes text not null default '',
      systems jsonb not null,
      published_at timestamptz not null default now()
    )
  `);
  // Administration (phase 4.6): roles, disabled accounts (never deleted), the
  // page's own sessions (a cookie), and the log of what administrators did.
  await db.query(
    'alter table users add column if not exists is_admin boolean not null default false',
  );
  await db.query('alter table users add column if not exists disabled_at timestamptz');
  // The first account is an administrator, as long as there is none.
  await db.query(`
    update users set is_admin = true
    where id = (select id from users order by created_at, id limit 1)
      and not exists (select 1 from users where is_admin)
  `);
  await db.query(`
    create table if not exists admin_sessions (
      id uuid primary key,
      user_id uuid not null references users (id),
      token_hash text not null unique,
      csrf text not null,
      created_at timestamptz not null default now(),
      last_seen_at timestamptz not null default now(),
      revoked_at timestamptz
    )
  `);
  await db.query(`
    create table if not exists admin_log (
      id bigserial primary key,
      at timestamptz not null default now(),
      admin_id uuid not null references users (id),
      action text not null,
      target text not null default '',
      detail text not null default ''
    )
  `);
  // The install key's image of each version (the last two kept).
  await db.query(`
    create table if not exists installers (
      version text primary key,
      size bigint not null,
      sha256 text not null,
      published_at timestamptz not null default now()
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
