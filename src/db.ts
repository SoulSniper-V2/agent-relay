import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export function openDb(path: string): DatabaseSync {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec(`
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
  `);
  return db;
}
