import { homedir } from "node:os";
import { join } from "node:path";
import { createRelayServer } from "./http.ts";
import { openDb } from "./db.ts";
import { Store } from "./store.ts";

const port = Number(process.env.RELAY_PORT ?? process.argv.find((a) => a.startsWith("--port="))?.split("=")[1] ?? 8787);
const dbPath =
  process.env.RELAY_DB ??
  process.argv.find((a) => a.startsWith("--db="))?.split("=")[1] ??
  join(homedir(), ".agent-relay", "hub.db");
const publicUrl = process.env.RELAY_PUBLIC_URL ?? `http://127.0.0.1:${port}`;

const store = new Store(openDb(dbPath));
const server = createRelayServer(store, { publicUrl });
server.listen(port, "0.0.0.0", () => {
  console.log(`agent-relay hub on ${publicUrl}`);
  console.log(`db: ${dbPath}`);
  console.log("Friends need this URL. Then: relay signup <handle>   (set RELAY_URL first)");
});
