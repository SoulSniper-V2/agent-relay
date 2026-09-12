import type { DatabaseSync } from "node:sqlite";

export type Migration = { version: number; name: string; sql: string };

/**
 * Forward-only migrations. Append new entries; never edit an applied one.
 * Version 1 is the original schema written with IF NOT EXISTS so an existing
 * hub database adopts the ledger without a rewrite.
 */
export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "baseline",
    sql: `
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        handle TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        email TEXT UNIQUE,
        last_seen INTEGER,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL,
        slug TEXT NOT NULL,
        display_name TEXT NOT NULL,
        card TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'idle',
        is_default INTEGER NOT NULL DEFAULT 0,
        last_seen INTEGER,
        created_at INTEGER NOT NULL,
        UNIQUE(owner_id, slug),
        FOREIGN KEY (owner_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS agent_tokens (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        name TEXT NOT NULL,
        token_hash TEXT UNIQUE NOT NULL,
        created_at INTEGER NOT NULL,
        last_used INTEGER,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (agent_id) REFERENCES agents(id)
      );

      CREATE TABLE IF NOT EXISTS login_codes (
        email TEXT PRIMARY KEY,
        code_hash TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS invites (
        code TEXT PRIMARY KEY,
        from_user TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        accepted_by TEXT,
        FOREIGN KEY (from_user) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS contacts (
        user_a TEXT NOT NULL,
        user_b TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (user_a, user_b)
      );

      CREATE TABLE IF NOT EXISTS grants (
        owner_id TEXT NOT NULL,
        peer_id TEXT NOT NULL,
        caps TEXT NOT NULL,
        inbound_policy TEXT NOT NULL DEFAULT 'triage',
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (owner_id, peer_id)
      );

      CREATE TABLE IF NOT EXISTS rooms (
        id TEXT PRIMARY KEY,
        slug TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS room_members (
        room_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        PRIMARY KEY (room_id, user_id),
        FOREIGN KEY (room_id) REFERENCES rooms(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS threads (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        user_a TEXT,
        user_b TEXT,
        room_id TEXT,
        created_at INTEGER NOT NULL,
        last_message_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        from_user TEXT NOT NULL,
        from_agent TEXT,
        from_role TEXT NOT NULL,
        room_id TEXT,
        intent TEXT NOT NULL DEFAULT 'chat',
        body TEXT NOT NULL,
        payload TEXT,
        needs_human INTEGER NOT NULL DEFAULT 0,
        reply_to TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (thread_id) REFERENCES threads(id)
      );

      CREATE TABLE IF NOT EXISTS deliveries (
        message_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        triage TEXT NOT NULL DEFAULT 'pending',
        visibility TEXT NOT NULL DEFAULT 'agent',
        escalate_reason TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        decided_at INTEGER,
        PRIMARY KEY (message_id, agent_id),
        FOREIGN KEY (message_id) REFERENCES messages(id)
      );

      CREATE TABLE IF NOT EXISTS memory (
        id TEXT PRIMARY KEY,
        scope TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        updated_by TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(scope, key)
      );

      CREATE INDEX IF NOT EXISTS deliveries_agent_triage ON deliveries(agent_id, triage, created_at);
      CREATE INDEX IF NOT EXISTS deliveries_human ON deliveries(user_id, visibility, created_at);
      CREATE INDEX IF NOT EXISTS messages_thread ON messages(thread_id, created_at);
      CREATE INDEX IF NOT EXISTS agents_owner ON agents(owner_id, is_default);
    `,
  },
  {
    version: 2,
    name: "webhooks",
    sql: `
      CREATE TABLE IF NOT EXISTS webhooks (
        user_id TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        secret TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
    `,
  },
];

export function appliedVersions(db: DatabaseSync): number[] {
  const rows = db.prepare("SELECT version FROM schema_migrations ORDER BY version").all() as { version: number }[];
  return rows.map((row) => Number(row.version));
}

/** Apply any unapplied migrations in order. Returns how many were applied. */
export function runMigrations(db: DatabaseSync, migrations: Migration[] = MIGRATIONS): number {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at INTEGER NOT NULL
  )`);
  const applied = new Set(appliedVersions(db));
  let count = 0;
  for (const migration of [...migrations].sort((a, b) => a.version - b.version)) {
    if (applied.has(migration.version)) continue;
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(migration.sql);
      db.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)").run(
        migration.version,
        migration.name,
        Date.now(),
      );
      db.exec("COMMIT");
      count += 1;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  return count;
}
