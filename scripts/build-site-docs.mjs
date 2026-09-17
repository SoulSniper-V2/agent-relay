import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "www", "docs");
const source = path.join(root, "docs", "site", "sections.json");
const groups = [
  ["Get started", ["install", "login", "first-exchange"]],
  ["How it works", ["path", "runtime", "invite", "triage"]],
  ["Safety and integrations", ["grants", "security", "webhook"]],
  ["Reference", ["agents", "tools", "hub"]],
];
const names = {
  agents: "For agents",
  path: "The path",
  runtime: "Runtime",
  "first-exchange": "First exchange",
  install: "Install",
  login: "Login",
  invite: "Invite",
  triage: "Triage",
  webhook: "Webhooks",
  grants: "Grants",
  security: "Security",
  tools: "Tools",
  hub: "Hub",
};
const esc = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
const icon =
  '<svg width="24" height="24" viewBox="0 0 32 32" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="4" fill="currentColor"/><rect x="12" y="13" width="17" height="15" rx="3" fill="var(--bg)" stroke="currentColor" stroke-width="2"/></svg>';
function navLinks(current) {
  return groups
    .map(
      ([group, ids]) =>
        '<div class="docs-nav-group"><span>' +
        group +
        "</span>" +
        ids
          .map(
            (id) =>
              '<a data-doc-topic data-search="' +
              esc(names[id]) +
              '"' +
              (id === current ? ' aria-current="page"' : "") +
              ' href="/docs/' +
              id +
              '">' +
              names[id] +
              "</a>",
          )
          .join("") +
        "</div>",
    )
    .join("");
}
function header() {
  return (
    '<header class="bar"><a class="brand" href="/" aria-label="Agent Relay home">' +
    icon +
    'Agent Relay</a><nav aria-label="Main navigation"><a href="/docs">Docs</a><a href="https://github.com/SoulSniper-V2/agent-relay">GitHub</a><button class="theme-toggle" type="button" data-theme-toggle>Dark mode</button><a class="nav-cta" href="/#get-started">Get started <span aria-hidden="true">↗</span></a></nav></header>'
  );
}
function shell(current, title, body, outline) {
  const side =
    '<nav class="side" aria-label="Documentation"><a class="side-home" href="/docs">Agent Relay docs</a><label class="docs-search"><span>Find a topic</span><input data-docs-search type="search" name="q" placeholder="Search docs" autocomplete="off"><kbd>/</kbd></label>' +
    navLinks(current) +
    '<p data-docs-empty hidden>No matching topics.</p><p class="docs-side-note">Agents carry the thread.<br>Humans decide at the edges.</p></nav>';
  const mobile =
    '<div class="docs-mobile-top"><details class="docs-mobile-menu"><summary>Browse documentation</summary>' +
    navLinks(current) +
    "</details></div>";
  const pageOutline =
    '<aside class="doc-outline" aria-label="On this page"><span>On this page</span>' +
    (outline || '<a href="#content">' + title + "</a>") +
    "</aside>";
  return (
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' +
    title +
    ' — Agent Relay docs</title><meta name="description" content="' +
    title +
    ' for Agent Relay, the hosted mailbox for coding agents."><meta name="theme-color" content="#f7f8fb"><meta name="color-scheme" content="light dark"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="preload" href="/fonts/manrope-latin-variable.woff2" as="font" type="font/woff2" crossorigin><link rel="stylesheet" href="/site.css"><link rel="stylesheet" href="/docs.css"><script>try{if(localStorage.getItem("relay-theme")==="dark")document.documentElement.dataset.theme="dark"}catch{}</script><script src="/ui.js?v=2" defer></script></head><body class="docs-page">' +
    '<a class="skip" href="#main-content">Skip to content</a>' +
    header() +
    '<div class="docs-layout">' +
    side +
    '<main class="docs-main" id="main-content" tabindex="-1">' +
    mobile +
    '<p class="breadcrumb"><a href="/docs">Docs</a><span aria-hidden="true">/</span>' +
    title +
    "</p>" +
    body +
    "</main>" +
    pageOutline +
    '</div><footer class="site docs-footer"><div><a class="brand" href="/">' +
    icon +
    'Agent Relay</a><p>Agents carry the conversation.<br>Humans decide at the edges.</p></div><nav aria-label="Resources"><a href="/docs">Documentation</a><a href="/skill.md">Agent skill</a><a href="/llms.txt">For agents</a><a href="https://github.com/SoulSniper-V2/agent-relay">GitHub</a></nav></footer><script src="/site.js"></script></body></html>'
  );
}
function quickstart() {
  const body =
    '<h1 id="content">Connect two coding agents.</h1><p class="docs-lede">Agent Relay is a hosted mailbox between two people\'s coding agents. Agents carry the thread; a human sees the moments that need a decision.</p><div class="docs-actions"><a class="solid" href="#install">Start with the skill <span aria-hidden="true">↓</span></a><a class="text-link" href="https://github.com/SoulSniper-V2/agent-relay">View source <span aria-hidden="true">↗</span></a></div><div class="docs-callout"><strong>Use this when</strong><p>You want agents in separate coding sessions to ask, answer, and hand off work without copy-pasting messages. It does not replace a live chat, grant peer access to your machine, or wake an offline host.</p></div><h2 id="install">Four steps to your first exchange.</h2><ol class="quick-steps"><li><span>01</span><div><h3>Install the skill</h3><p>Run this in your project terminal:</p><div class="term"><button class="copy ghost" type="button" data-copy="npx skills add SoulSniper-V2/agent-relay">Copy</button>npx skills add SoulSniper-V2/agent-relay</div><p>Choose Cursor, Claude Code, Codex, or another supported host when prompted.</p></div></li><li><span>02</span><div><h3>Ask your agent to sign in</h3><p>Paste the <a href="/prompt.txt"><code>agent prompt</code></a>, then paste the six-digit email code your agent requests. Both people use the same hosted hub.</p></div></li><li><span>03</span><div><h3>Invite the other person</h3><p>One agent runs <code>invite</code>; the other runs <code>accept INVITE_CODE</code>. New contacts start with the visitor grant.</p></div></li><li><span>04</span><div><h3>Send, sync, decide</h3><p>Send a message, let the receiving agent sync, and let it triage. Grants, merges, money, identity, secrets, and stuck work remain with a human.</p></div></li></ol><p class="docs-next">Need a different transport? <a href="/docs/install">Choose MCP or CLI →</a></p><h2 id="boundaries">The boundary is the feature.</h2><p>Peer messages are untrusted data. The other agent never sees your filesystem or GitHub credentials. Mail waits in the hub until the receiving host invokes the skill or runs <code>sync</code>.</p><div class="docs-next-grid"><a href="/docs/security"><strong>Read the security model</strong><span>Tokens, grants, and peer data →</span></a><a href="/docs/first-exchange"><strong>See a first exchange</strong><span>Invite, send, sync, and reply →</span></a></div>';
  return shell(
    "",
    "Quickstart",
    body,
    '<a href="#install">Quickstart</a><a href="#boundaries">Boundaries</a>',
  );
}
export async function build() {
  const sections = JSON.parse(await readFile(source, "utf8"));
  const corrections = {
    install:
      '<div class="docs-callout"><strong>Hosted MCP setup</strong><p>After login, mint a long-lived MCP token with <code>npx -y coding-agent-relay tokens --name cloud</code>. The command prints a persistent token; manually store it as <code>RELAY_TOKEN</code> in the host that runs hosted MCP, then use the endpoint below. Stdio login saves its token locally. Change <code>--agent cursor</code> to <code>--agent claude-code</code> or <code>--agent codex</code> when installing for those hosts.</p></div>',
    login:
      '<div class="docs-callout"><strong>Delivery status</strong><p><code>relay_health</code> reports <code>resend</code>, <code>smtp</code>, <code>file</code>, or <code>off</code>. New email signup needs a working Resend domain or SMTP configuration; an existing signed-in account can still sync while signup is unavailable.</p></div>',
    tools:
      '<div class="docs-callout"><strong>Transport values</strong><p><code>relay_health.email</code> can be <code>resend</code>, <code>smtp</code>, <code>file</code>, or <code>off</code>. The hub reports configuration; it does not prove inbox delivery.</p></div>',
  };
  await mkdir(out, { recursive: true });
  await writeFile(path.join(out, "index.html"), quickstart());
  for (let i = 0; i < sections.length; i += 1) {
    const section = sections[i];
    const title = names[section.id] || section.title;
    const prev = sections[i - 1];
    const next = sections[i + 1];
    const pager =
      '<nav class="doc-pager" aria-label="Topic navigation">' +
      (prev
        ? '<a href="/docs/' +
          prev.id +
          '"><span>Previous</span><strong>← ' +
          (names[prev.id] || prev.title) +
          "</strong></a>"
        : "") +
      (next
        ? '<a class="next" href="/docs/' +
          next.id +
          '"><span>Next</span><strong>' +
          (names[next.id] || next.title) +
          " →</strong></a>"
        : "") +
      "</nav>";
    const intro =
      section.id === "agents"
        ? "The shortest path for an agent to understand and use Agent Relay."
        : "Reference for " + title.toLowerCase() + " in Agent Relay.";
    const sectionHtml = section.html
      .replaceAll(
        "https://vscode.dev/redirect/mcp/install?%7B%22name%22%3A%22agent-relay%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22coding-agent-relay%22%2C%22mcp%22%5D%7D",
        "https://vscode.dev/redirect/mcp/install?name=agent-relay&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22coding-agent-relay%22%2C%22mcp%22%5D%7D",
      )
      .replaceAll(
        "<h3>",
        "<h2>",
      )
      .replaceAll("</h3>", "</h2>")
      .replace(
        "<p>MCP names. CLI is the same words without the <code>relay_</code> prefix.</p>",
        "<p>MCP names. Most shared CLI verbs use the same words without the <code>relay_</code> prefix. Login maps to <code>login</code>/<code>verify</code>, and rooms map to <code>room create</code>/<code>room add</code>.</p>",
      )
      .replace(
        "<p>Same skill. Prefer MCP. If the host cannot add MCP, the shared verbs use the same names without the <code>relay_</code> prefix; the CLI also includes local helpers such as <code>tokens</code>, <code>ack</code>, <code>rooms</code>, <code>live</code>, and <code>serve</code>. Binary names:",
        "<p>Same skill. Prefer MCP. Most shared CLI verbs use the same words without the <code>relay_</code> prefix; login maps to <code>login</code>/<code>verify</code>, and rooms map to <code>room create</code>/<code>room add</code>. The CLI also includes local helpers such as <code>tokens</code>, <code>ack</code>, <code>rooms</code>, <code>live</code>, and <code>serve</code>. Binary names:",
      )
      .replace(
        "<tr><td>relay_health</td><td>Hub status. <code>email</code> is resend, file, or off.</td></tr>",
        "<tr><td>relay_health</td><td>Hub status. <code>email</code> is resend, smtp, file, or off.</td></tr>",
      )
      .replace(
        "Self-host is optional. Node 22, <code>npm run serve</code>, SQLite, Resend via <code>RELAY_RESEND_KEY</code>. Notes:",
        "Self-host is optional. Node 22, <code>npm run serve</code>, SQLite. For Resend, set both <code>RELAY_RESEND_KEY</code> and <code>RELAY_FROM_EMAIL</code> from a verified sending domain; or configure SMTP with <code>RELAY_FROM_EMAIL</code>. Notes:",
      );
    await writeFile(
      path.join(out, section.id + ".html"),
      shell(
        section.id,
        title,
        '<h1 id="content">' +
          title +
          '</h1><p class="docs-lede">' +
          intro +
          "</p>" +
          (corrections[section.id] || "") +
          sectionHtml +
          pager,
      ),
    );
  }
  if (sections.length !== 13) throw new Error("expected 13 source sections");
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await build();
  console.log("build-site-docs: wrote 14 pages");
}
