import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = process.cwd();
const docsDir = join(root, "www", "docs");

function buildDocs() {
  execFileSync(process.execPath, ["scripts/build-site-docs.mjs"], {
    cwd: root,
    stdio: "pipe",
  });
}

test("docs build emits the complete deterministic topic surface", () => {
  buildDocs();
  const first = readFileSync(join(docsDir, "index.html"), "utf8");
  buildDocs();
  const second = readFileSync(join(docsDir, "index.html"), "utf8");
  assert.equal(second, first);

  const pages = readdirSync(docsDir).filter((file) => file.endsWith(".html"));
  assert.equal(pages.length, 14);

  const quickstart = first;
  assert.match(quickstart, /npx skills add SoulSniper-V2\/agent-relay/);
  assert.match(quickstart, /id="install"/);
  assert.match(quickstart, /href="\/docs\/install"/);
  const vercel = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8"));
  assert.equal(vercel.cleanUrls, true);

  const install = readFileSync(join(docsDir, "install.html"), "utf8");
  assert.match(install, /coding-agent-relay tokens --name cloud/);
  assert.match(install, /--agent claude-code/);
  assert.match(install, /--agent codex/);
  assert.match(install, /room create/);
  assert.match(install, /vscode\.dev\/redirect\/mcp\/install\?name=agent-relay&config=/);
  assert.doesNotMatch(install, /vscode\.dev\/redirect\/mcp\/install\?%7B/);
  assert.equal((install.match(/id="content"/g) ?? []).length, 1);
  assert.match(install, /class="skip" href="#main-content"/);
  assert.doesNotMatch(install, /<h1[^>]*>Install<\/h1>[\s\S]*<h3>/);

  const login = readFileSync(join(docsDir, "login.html"), "utf8");
  assert.match(login, /<code>smtp<\/code>/);

  const agents = readFileSync(join(docsDir, "agents.html"), "utf8");
  assert.match(agents, /\/skill\.md/);
  const tools = readFileSync(join(docsDir, "tools.html"), "utf8");
  assert.match(tools, /relay_login_request/);
  assert.match(tools, /resend, smtp, file, or off/);
  const webhook = readFileSync(join(docsDir, "webhook.html"), "utf8");
  assert.match(webhook, /signature/);

  for (const file of pages) {
    const html = readFileSync(join(docsDir, file), "utf8");
    assert.doesNotMatch(html, /npx\s+(?:-y\s+)?agent-relay(?!-)/);
  }
});
