import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { openDb } from "../src/db.ts";
import { MIGRATIONS, appliedVersions, runMigrations } from "../src/migrations.ts";

function tmpDir() {
  return mkdtempSync(join(tmpdir(), "relay-migrations-"));
}

test("a fresh database applies the baseline and records it", () => {
  const dir = tmpDir();
  try {
    const db = openDb(join(dir, "hub.db"));
    assert.deepEqual(appliedVersions(db), MIGRATIONS.map((m) => m.version));
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map(
      (t) => t.name,
    );
    for (const expected of ["users", "agents", "messages", "deliveries", "schema_migrations"]) {
      assert.ok(tables.includes(expected), `missing table ${expected}`);
    }
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("reopening a database does not re-apply migrations", () => {
  const dir = tmpDir();
  try {
    const path = join(dir, "hub.db");
    const first = openDb(path);
    assert.equal(runMigrations(first), 0);
    first.close();
    const second = openDb(path);
    assert.equal(runMigrations(second), 0);
    assert.deepEqual(appliedVersions(second), MIGRATIONS.map((m) => m.version));
    second.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("new migrations apply in order, once each", () => {
  const dir = tmpDir();
  try {
    const db = new DatabaseSync(join(dir, "hub.db"));
    const migrations = [
      { version: 1, name: "one", sql: "CREATE TABLE t (x INTEGER)" },
      { version: 2, name: "two", sql: "ALTER TABLE t ADD COLUMN y INTEGER NOT NULL DEFAULT 0" },
    ];
    assert.equal(runMigrations(db, migrations), 2);
    assert.deepEqual(appliedVersions(db), [1, 2]);
    assert.equal(runMigrations(db, migrations), 0);
    db.prepare("INSERT INTO t (x, y) VALUES (1, 2)").run();
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a failing migration rolls back and is not recorded", () => {
  const dir = tmpDir();
  try {
    const db = new DatabaseSync(join(dir, "hub.db"));
    const migrations = [
      { version: 1, name: "ok", sql: "CREATE TABLE t (x INTEGER)" },
      { version: 2, name: "duplicate", sql: "CREATE TABLE t (x INTEGER)" },
    ];
    assert.throws(() => runMigrations(db, migrations));
    assert.deepEqual(appliedVersions(db), [1]);
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
