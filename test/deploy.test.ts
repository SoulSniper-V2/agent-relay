import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const installer = readFileSync("deploy/remote-install.sh", "utf8");
const workflow = readFileSync(".github/workflows/deploy-hub.yml", "utf8");

function extractNodeSnippet(anchor: string) {
  const anchorOffset = installer.indexOf(anchor);
  assert.notEqual(anchorOffset, -1, `installer anchor missing: ${anchor}`);
  const commandOffset = installer.indexOf("--input-type=module -e '\n", anchorOffset);
  assert.notEqual(commandOffset, -1, `installer node command missing after: ${anchor}`);
  const scriptStart = commandOffset + "--input-type=module -e '".length;
  const scriptEnd = installer.indexOf("\n  '\n", scriptStart);
  assert.notEqual(scriptEnd, -1, `installer node script terminator missing after: ${anchor}`);
  return installer.slice(scriptStart, scriptEnd);
}

// Execute the exact scripts embedded in the installer. If either safety guard
// is changed or removed, this extraction or the behavior probe below fails.
const checkpointSnippet = extractNodeSnippet('RELAY_DB="$DATA_ROOT/hub.db"');
const integritySnippet = extractNodeSnippet('RELAY_DB="$DB_BACKUP"');

function runNode(script: string, dbPath: string) {
  return execFileSync(
    process.execPath,
    ["--experimental-sqlite", "--input-type=module", "-e", script],
    { env: { PATH: process.env.PATH ?? "", RELAY_DB: dbPath }, encoding: "utf8" },
  );
}

test("SQLite upgrade snapshot retains WAL data and refuses a busy checkpoint", () => {
  const dir = mkdtempSync(join(tmpdir(), "agent-relay-deploy-"));
  const dbPath = join(dir, "hub.db");
  const backupPath = join(dir, "hub.db.backup");
  try {
    const seed = new DatabaseSync(dbPath);
    assert.equal(String(seed.prepare("PRAGMA journal_mode=WAL").get()?.journal_mode), "wal");
    seed.exec("CREATE TABLE notes (body TEXT NOT NULL); INSERT INTO notes VALUES ('before');");
    seed.close();

    // Keep a read transaction open so the exact checkpoint guard observes
    // busy=1 while a committed row is waiting in the WAL.
    const reader = new DatabaseSync(dbPath);
    reader.exec("BEGIN; SELECT * FROM notes;");
    const writer = new DatabaseSync(dbPath);
    writer.exec("INSERT INTO notes VALUES ('after');");
    writer.close();

    let busyError: { status?: number } | undefined;
    try {
      runNode(checkpointSnippet, dbPath);
    } catch (error) {
      busyError = error as { status?: number };
    }
    assert.equal(busyError?.status, 1, "a live reader must make the installer refuse the checkpoint");

    reader.exec("ROLLBACK");
    reader.close();
    runNode(checkpointSnippet, dbPath);
    copyFileSync(dbPath, backupPath);
    runNode(integritySnippet, backupPath);

    const backup = new DatabaseSync(backupPath);
    const rows = backup.prepare("SELECT body FROM notes ORDER BY body").all() as { body: string }[];
    assert.deepEqual(rows.map((row) => row.body), ["after", "before"]);
    backup.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("hub upgrades preserve SQLite files and verify a coherent backup", () => {
  assert.doesNotMatch(installer, /rm\s+-[^\n]*hub\.db(?:-wal|-shm)?/);
  assert.match(installer, /wal_checkpoint\(TRUNCATE\)/);
  assert.match(installer, /const busy = Number\(result\?\.busy\)/);
  assert.match(installer, /if \(busy !== 0\) process\.exit\(1\)/);
  assert.match(installer, /PRAGMA integrity_check/);
  assert.match(installer, /DB_BACKUP=.*hub\.db-/);
});

test("hub deploys stage dependencies and rejects an unhealthy candidate", () => {
  assert.match(installer, /npm ci --omit=dev/);
  assert.match(installer, /curl -fsS --max-time 2/);
  assert.match(installer, /body\.ok !== true/);
  assert.match(installer, /body\.version !== process\.env\.EXPECTED_VERSION/);
  assert.match(installer, /agent-relay deploy failed; attempting rollback/);
  assert.match(workflow, /concurrency:/);
  assert.match(workflow, /npm run build/);
  assert.match(workflow, /npm test/);
});
