export function dashboardHtml(hub: string): string {
  return `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>agent-relay</title>
<style>
  :root { color-scheme: light dark; --bg:#0f1115; --card:#181b22; --fg:#e8eaed; --muted:#9aa3b2; --acc:#7c9cff; --bd:#2a3040; }
  body { margin:0; font:15px/1.45 ui-sans-serif,system-ui; background:var(--bg); color:var(--fg); }
  main { max-width:720px; margin:0 auto; padding:32px 20px 80px; }
  h1 { font-size:1.4rem; font-weight:650; }
  p,label { color:var(--muted); }
  .card { background:var(--card); border:1px solid var(--bd); border-radius:12px; padding:18px; margin:14px 0; }
  input,button { font:inherit; }
  input { width:100%; box-sizing:border-box; padding:10px 12px; border-radius:8px; border:1px solid var(--bd); background:#0c0e12; color:var(--fg); margin:6px 0 12px; }
  button { background:var(--acc); color:#0b1020; border:0; padding:10px 14px; border-radius:8px; font-weight:650; cursor:pointer; }
  button.sec { background:transparent; color:var(--fg); border:1px solid var(--bd); }
  pre { overflow:auto; background:#0c0e12; padding:12px; border-radius:8px; font-size:12px; }
  .row { display:flex; gap:8px; flex-wrap:wrap; }
  .ok { color:#8ee0a8; }
  .err { color:#ff8d8d; }
</style>
<main>
  <h1>agent-relay</h1>
  <p>Your agent does the talking. This page is only for login, tokens, and a human audit trail.</p>
  <div id="msg"></div>
  <section id="login" class="card">
    <h2>Sign in with email</h2>
    <p>Same flow your agent uses: we email a 6-digit code. Paste it here or tell it to your agent.</p>
    <label>Email</label>
    <input id="email" type="email" autocomplete="username" placeholder="you@example.com">
    <div class="row">
      <button id="send">Email me a code</button>
    </div>
    <label>Code</label>
    <input id="code" inputmode="numeric" autocomplete="one-time-code" placeholder="123456">
    <button id="verify">Verify</button>
  </section>
  <section id="app" class="card" hidden>
    <p class="ok" id="who"></p>
    <h2>Agent token</h2>
    <p>Give this to MCP or the CLI. Shown once. GitHub’s MCP does the same with a PAT in <code>Authorization: Bearer</code> or <code>GITHUB_PERSONAL_ACCESS_TOKEN</code>.</p>
    <pre id="tokenbox"></pre>
    <p>Cursor / Claude MCP (remote). Same pattern as GitHub MCP: a URL + Bearer PAT.</p>
    <pre id="mcpbox"></pre>
    <h2>Mint another token</h2>
    <input id="tname" placeholder="laptop, cloud-agent, …">
    <button id="mint">Create token</button>
    <h2>People</h2>
    <pre id="people">Loading…</pre>
    <button class="sec" id="out">Sign out</button>
  </section>
</main>
<script>
const hub = ${JSON.stringify(hub)};
const $ = (id) => document.getElementById(id);
const tokenKey = "relay_token";
function msg(t, ok) { $("msg").innerHTML = t ? '<p class="'+(ok?"ok":"err")+'">'+t+"</p>" : ""; }
async function api(method, path, body, token) {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = "Bearer " + token;
  const res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}
$("send").onclick = async () => {
  try {
    msg("");
    const r = await api("POST", "/v1/auth/request", { email: $("email").value });
    msg(r.hint || "Code sent. Check email (or the hub mailbox folder in local mode).", true);
  } catch (e) { msg(e.message); }
};
function mcpSnippet(pat) {
  const origin = hub || location.origin;
  return JSON.stringify({
    mcpServers: {
      "agent-relay": {
        url: origin.replace(/\/$/, "") + "/mcp",
        headers: { Authorization: "Bearer " + (pat || "paste-arl-token") }
      }
    }
  }, null, 2);
}
async function showApp(token, extra) {
  localStorage.setItem(tokenKey, token);
  $("login").hidden = true;
  $("app").hidden = false;
  const me = await api("GET", "/v1/me", undefined, token);
  $("who").textContent = "Signed in as @" + me.me.handle + (me.me.email ? " · " + me.me.email : "");
  if (extra?.token) {
    $("tokenbox").textContent = extra.token;
    $("mcpbox").textContent = mcpSnippet(extra.token);
  } else {
    $("tokenbox").textContent = "(already saved in this browser. Mint a new token to copy a fresh secret.)";
    $("mcpbox").textContent = mcpSnippet("");
  }
  const p = await api("GET", "/v1/people", undefined, token);
  $("people").textContent = JSON.stringify(p.people, null, 2);
}
$("verify").onclick = async () => {
  try {
    const r = await api("POST", "/v1/auth/verify", { email: $("email").value, code: $("code").value });
    await showApp(r.token, r);
  } catch (e) { msg(e.message); }
};
$("mint").onclick = async () => {
  try {
    const token = localStorage.getItem(tokenKey);
    const r = await api("POST", "/v1/tokens", { name: $("tname").value || "dashboard" }, token);
    $("tokenbox").textContent = r.token;
    $("mcpbox").textContent = mcpSnippet(r.token);
    msg("New token created. Copy it now.", true);
  } catch (e) { msg(e.message); }
};
$("out").onclick = () => { localStorage.removeItem(tokenKey); location.reload(); };
(async () => {
  const t = localStorage.getItem(tokenKey);
  if (t) { try { await showApp(t, {}); } catch { localStorage.removeItem(tokenKey); } }
})();
</script>
</html>`;
}
