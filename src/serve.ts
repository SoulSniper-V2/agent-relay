import { homedir } from "node:os";
import { join } from "node:path";
import { createRelayServer } from "./http.ts";
import { openDb } from "./db.ts";
import { Store } from "./store.ts";
import { RelayBus } from "./bus.ts";
import { dispatchMessageWebhooks } from "./webhook.ts";
import { VERSION } from "./version.ts";

const port = Number(process.env.RELAY_PORT ?? process.argv.find((a) => a.startsWith("--port="))?.split("=")[1] ?? 8787);
const dbPath =
  process.env.RELAY_DB ??
  process.argv.find((a) => a.startsWith("--db="))?.split("=")[1] ??
  join(homedir(), ".agent-relay", "hub.db");
const publicUrl = process.env.RELAY_PUBLIC_URL ?? `http://127.0.0.1:${port}`;
const bind = process.env.RELAY_BIND ?? "0.0.0.0";

const bus = new RelayBus();
const store = new Store(openDb(dbPath), (ids, ev) => {
  bus.publish(ids, ev);
  if (ev.type === "message") {
    const recipients = Array.isArray(ev.recipients) ? (ev.recipients as string[]) : [];
    if (recipients.length) {
      // Best effort: the mailbox keeps the message whether or not the POST lands.
      void dispatchMessageWebhooks(store, recipients, ev.message).catch(() => {});
    }
  }
});
const server = createRelayServer(store, { publicUrl, bus });
server.listen(port, bind, () => {
  console.log(`agent-relay ${VERSION} on ${publicUrl} (bind ${bind}:${port})`);
  console.log(`db: ${dbPath}`);
  console.log("Agents: stdio MCP (`relay mcp`) or CLI for signup. Hosted MCP: POST /mcp with Bearer PAT.");
});
