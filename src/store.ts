import type { DatabaseSync } from "node:sqlite";
import {
  dmScope,
  hashToken,
  id,
  inviteCode,
  now,
  normalizeHandle,
  otp,
  roomScope,
  token,
} from "./ids.ts";
import { normalizeEmail } from "./email.ts";

export type User = {
  id: string;
  handle: string;
  name: string;
  email: string | null;
  last_seen: number | null;
  created_at: number;
};

function rowUser(r: Record<string, unknown>): User {
  return {
    id: String(r.id),
    handle: String(r.handle),
    name: String(r.name),
    email: r.email == null || r.email === "" ? null : String(r.email),
    last_seen: r.last_seen == null ? null : Number(r.last_seen),
    created_at: Number(r.created_at),
  };
}

export class RelayError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export class Store {
  constructor(private db: DatabaseSync) {}

  register(handle: string, name?: string): { user: User; token: string } {
    const h = normalizeHandle(handle);
    const t = token();
    const user: User = {
      id: id("usr"),
      handle: h,
      name: (name ?? h).trim() || h,
      email: null,
      last_seen: now(),
      created_at: now(),
    };
    try {
      this.db
        .prepare(
          "INSERT INTO users (id, handle, name, token_hash, last_seen, created_at, email) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .run(user.id, user.handle, user.name, hashToken(t), user.last_seen, user.created_at, null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("UNIQUE")) throw new RelayError(409, `Handle @${h} is taken.`);
      throw e;
    }
    return { user, token: t };
  }

  auth(rawToken: string | undefined): User {
    if (!rawToken) throw new RelayError(401, "Missing token. Run `relay login <email>` or set RELAY_TOKEN.");
    const t = rawToken.replace(/^Bearer\s+/i, "").trim();
    const hashed = hashToken(t);
    const viaPat = this.db
      .prepare(
        `SELECT u.* FROM agent_tokens a JOIN users u ON u.id = a.user_id WHERE a.token_hash = ?`,
      )
      .get(hashed) as Record<string, unknown> | undefined;
    if (viaPat) {
      this.db.prepare("UPDATE agent_tokens SET last_used = ? WHERE token_hash = ?").run(now(), hashed);
      this.db.prepare("UPDATE users SET last_seen = ? WHERE id = ?").run(now(), viaPat.id);
      return rowUser(viaPat);
    }
    const row = this.db.prepare("SELECT * FROM users WHERE token_hash = ?").get(hashed) as
      | Record<string, unknown>
      | undefined;
    if (!row) throw new RelayError(401, "Invalid token.");
    this.db.prepare("UPDATE users SET last_seen = ? WHERE id = ?").run(now(), row.id);
    return rowUser(row);
  }

  createLoginCode(emailRaw: string): { email: string; code: string; expires_at: number } {
    let email: string;
    try {
      email = normalizeEmail(emailRaw);
    } catch (e) {
      throw new RelayError(400, e instanceof Error ? e.message : "Invalid email");
    }
    const recent = this.db.prepare("SELECT created_at FROM login_codes WHERE email = ?").get(email) as
      | { created_at: number }
      | undefined;
    if (recent && now() - Number(recent.created_at) < 15_000) {
      throw new RelayError(429, "Wait a few seconds before requesting another code.");
    }
    const code = otp();
    const expires_at = now() + 10 * 60 * 1000;
    this.db
      .prepare(
        `INSERT INTO login_codes (email, code_hash, expires_at, attempts, created_at)
         VALUES (?, ?, ?, 0, ?)
         ON CONFLICT(email) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0, created_at = excluded.created_at`,
      )
      .run(email, hashToken(code), expires_at, now());
    return { email, code, expires_at };
  }

  verifyLogin(emailRaw: string, codeRaw: string): { user: User; token: string; is_new: boolean } {
    let email: string;
    try {
      email = normalizeEmail(emailRaw);
    } catch (e) {
      throw new RelayError(400, e instanceof Error ? e.message : "Invalid email");
    }
    const code = codeRaw.trim().replace(/\s/g, "");
    const row = this.db.prepare("SELECT * FROM login_codes WHERE email = ?").get(email) as
      | Record<string, unknown>
      | undefined;
    if (!row) throw new RelayError(400, "No login in progress. Ask your agent to request a new code.");
    if (Number(row.expires_at) < now()) throw new RelayError(400, "Code expired. Request a new one.");
    if (Number(row.attempts) >= 5) throw new RelayError(429, "Too many tries. Request a new code.");
    this.db.prepare("UPDATE login_codes SET attempts = attempts + 1 WHERE email = ?").run(email);
    if (hashToken(code) !== String(row.code_hash)) {
      throw new RelayError(400, "Wrong code. Check the email and try again.");
    }
    this.db.prepare("DELETE FROM login_codes WHERE email = ?").run(email);
    let existing = this.db.prepare("SELECT * FROM users WHERE email = ?").get(email) as
      | Record<string, unknown>
      | undefined;
    let is_new = false;
    if (!existing) {
      is_new = true;
      const handle = this.uniqueHandle(email.split("@")[0] ?? "user");
      const created = this.register(handle, handle);
      this.db.prepare("UPDATE users SET email = ? WHERE id = ?").run(email, created.user.id);
      existing = this.db.prepare("SELECT * FROM users WHERE id = ?").get(created.user.id) as Record<
        string,
        unknown
      >;
    }
    const user = rowUser(existing);
    const issued = this.issueToken(user, "login");
    return { user, token: issued.token, is_new };
  }

  private uniqueHandle(raw: string): string {
    let base = raw.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "user";
    if (base.length < 2) base = `u${base}`;
    base = base.slice(0, 24);
    try {
      normalizeHandle(base);
    } catch {
      base = "user";
    }
    let candidate = base;
    let i = 0;
    while (this.db.prepare("SELECT 1 FROM users WHERE handle = ?").get(candidate)) {
      i += 1;
      candidate = `${base}${i}`;
    }
    return candidate;
  }

  issueToken(me: User, name: string): { id: string; name: string; token: string } {
    const t = token();
    const tid = id("tok");
    const label = (name.trim() || "agent").slice(0, 40);
    this.db
      .prepare(
        "INSERT INTO agent_tokens (id, user_id, name, token_hash, created_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(tid, me.id, label, hashToken(t), now());
    return { id: tid, name: label, token: t };
  }

  listTokens(me: User) {
    return this.db
      .prepare(
        "SELECT id, name, created_at, last_used FROM agent_tokens WHERE user_id = ? ORDER BY created_at DESC",
      )
      .all(me.id) as { id: string; name: string; created_at: number; last_used: number | null }[];
  }

  revokeToken(me: User, tokenId: string) {
    const existed = this.db
      .prepare("SELECT id FROM agent_tokens WHERE id = ? AND user_id = ?")
      .get(tokenId, me.id);
    if (!existed) throw new RelayError(404, "Token not found.");
    this.db.prepare("DELETE FROM agent_tokens WHERE id = ? AND user_id = ?").run(tokenId, me.id);
    return { ok: true };
  }

  getUserByHandle(handle: string): User | undefined {
    const row = this.db
      .prepare("SELECT * FROM users WHERE handle = ?")
      .get(normalizeHandle(handle)) as Record<string, unknown> | undefined;
    return row ? rowUser(row) : undefined;
  }

  getUser(id: string): User | undefined {
    const row = this.db.prepare("SELECT * FROM users WHERE id = ?").get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? rowUser(row) : undefined;
  }

  createInvite(me: User): { code: string; from: string } {
    const code = inviteCode();
    this.db
      .prepare("INSERT INTO invites (code, from_user, created_at) VALUES (?, ?, ?)")
      .run(code, me.id, now());
    return { code, from: me.handle };
  }

  acceptInvite(me: User, code: string): { contact: User } {
    const inv = this.db.prepare("SELECT * FROM invites WHERE code = ?").get(code.trim().toLowerCase()) as
      | Record<string, unknown>
      | undefined;
    if (!inv) throw new RelayError(404, "Invite code not found.");
    if (inv.accepted_by) throw new RelayError(409, "Invite already used.");
    const fromId = String(inv.from_user);
    if (fromId === me.id) throw new RelayError(400, "You cannot accept your own invite.");
    this.addContact(fromId, me.id);
    this.db.prepare("UPDATE invites SET accepted_by = ? WHERE code = ?").run(me.id, code.trim().toLowerCase());
    const other = this.getUser(fromId);
    if (!other) throw new RelayError(404, "Inviter no longer exists.");
    this.systemMessage(fromId, me.id, `@${me.handle} accepted @${other.handle}'s invite. You can message each other now.`);
    return { contact: other };
  }

  private addContact(a: string, b: string) {
    const t = now();
    this.db.prepare("INSERT OR IGNORE INTO contacts (user_a, user_b, created_at) VALUES (?, ?, ?)").run(a, b, t);
    this.db.prepare("INSERT OR IGNORE INTO contacts (user_a, user_b, created_at) VALUES (?, ?, ?)").run(b, a, t);
  }

  requireContact(me: User, other: User) {
    const row = this.db
      .prepare("SELECT 1 FROM contacts WHERE user_a = ? AND user_b = ?")
      .get(me.id, other.id);
    if (!row) {
      throw new RelayError(
        403,
        `You are not connected to @${other.handle}. Send them an invite: relay invite`,
      );
    }
  }

  people(me: User) {
    const rows = this.db
      .prepare(
        `SELECT u.id, u.handle, u.name, u.last_seen, u.created_at
         FROM contacts c JOIN users u ON u.id = c.user_b
         WHERE c.user_a = ?
         ORDER BY u.handle`,
      )
      .all(me.id) as Record<string, unknown>[];
    return rows.map(rowUser);
  }

  createRoom(me: User, title: string, memberHandles: string[] = []) {
    const slug = normalizeHandle(title.replace(/\s+/g, "-")).slice(0, 32);
    const roomId = id("rm");
    try {
      this.db
        .prepare("INSERT INTO rooms (id, slug, title, created_by, created_at) VALUES (?, ?, ?, ?, ?)")
        .run(roomId, slug, title.trim(), me.id, now());
    } catch {
      throw new RelayError(409, `Room slug ${slug} already exists. Pick a different title.`);
    }
    this.db.prepare("INSERT INTO room_members (room_id, user_id) VALUES (?, ?)").run(roomId, me.id);
    for (const h of memberHandles) {
      this.addRoomMember(me, slug, h);
    }
    return this.getRoom(slug)!;
  }

  addRoomMember(me: User, slug: string, handle: string) {
    const room = this.requireRoomMember(me, slug);
    const other = this.getUserByHandle(handle);
    if (!other) throw new RelayError(404, `No user @${normalizeHandle(handle)}. They need to signup on this hub first.`);
    this.requireContact(me, other);
    this.db
      .prepare("INSERT OR IGNORE INTO room_members (room_id, user_id) VALUES (?, ?)")
      .run(room.id, other.id);
    this.sendRoom(me, slug, `@${me.handle} added @${other.handle} to the room.`, "system");
    return this.getRoom(slug)!;
  }

  listRooms(me: User) {
    const rows = this.db
      .prepare(
        `SELECT r.* FROM rooms r JOIN room_members m ON m.room_id = r.id
         WHERE m.user_id = ? ORDER BY r.title`,
      )
      .all(me.id) as Record<string, unknown>[];
    return rows.map((r) => this.roomPublic(r));
  }

  getRoom(slug: string) {
    const row = this.db.prepare("SELECT * FROM rooms WHERE slug = ?").get(normalizeHandle(slug)) as
      | Record<string, unknown>
      | undefined;
    return row ? this.roomPublic(row) : undefined;
  }

  private roomPublic(r: Record<string, unknown>) {
    const members = this.db
      .prepare(
        `SELECT u.handle, u.name FROM room_members m JOIN users u ON u.id = m.user_id
         WHERE m.room_id = ? ORDER BY u.handle`,
      )
      .all(r.id) as { handle: string; name: string }[];
    return {
      id: String(r.id),
      slug: String(r.slug),
      title: String(r.title),
      created_by: String(r.created_by),
      members: members.map((m) => m.handle),
    };
  }

  requireRoomMember(me: User, slug: string) {
    const room = this.getRoom(slug);
    if (!room) throw new RelayError(404, `Room ${slug} not found.`);
    const mem = this.db
      .prepare("SELECT 1 FROM room_members WHERE room_id = ? AND user_id = ?")
      .get(room.id, me.id);
    if (!mem) throw new RelayError(403, `You are not in room ${slug}.`);
    return room;
  }

  sendDm(me: User, handle: string, body: string, kind = "chat") {
    const other = this.getUserByHandle(handle);
    if (!other) throw new RelayError(404, `No user @${normalizeHandle(handle)} on this hub.`);
    this.requireContact(me, other);
    return this.insertMessage(me.id, other.id, null, body, kind);
  }

  sendRoom(me: User, slug: string, body: string, kind = "chat") {
    const room = this.requireRoomMember(me, slug);
    return this.insertMessage(me.id, null, room.id, body, kind);
  }

  private systemMessage(fromId: string, toId: string, body: string) {
    this.insertMessage(fromId, toId, null, body, "system");
  }

  private insertMessage(
    fromUser: string,
    toUser: string | null,
    roomId: string | null,
    body: string,
    kind: string,
  ) {
    const text = body.trim();
    if (!text) throw new RelayError(400, "Message body is empty.");
    if (text.length > 20_000) throw new RelayError(400, "Message too long (max 20k).");
    const msg = {
      id: id("msg"),
      from_user: fromUser,
      to_user: toUser,
      room_id: roomId,
      kind,
      body: text,
      created_at: now(),
    };
    this.db
      .prepare(
        "INSERT INTO messages (id, from_user, to_user, room_id, kind, body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(msg.id, msg.from_user, msg.to_user, msg.room_id, msg.kind, msg.body, msg.created_at);
    return this.hydrateMessage(msg as unknown as Record<string, unknown>, fromUser);
  }

  inbox(me: User, opts: { unread?: boolean; after?: number; limit?: number } = {}) {
    const limit = Math.min(opts.limit ?? 50, 200);
    const rows = this.db
      .prepare(
        `SELECT m.* FROM messages m
         LEFT JOIN room_members rm ON rm.room_id = m.room_id AND rm.user_id = ?
         WHERE (m.to_user = ? OR rm.user_id IS NOT NULL)
         AND (? IS NULL OR m.created_at > ?)
         ORDER BY m.created_at DESC
         LIMIT ?`,
      )
      .all(me.id, me.id, opts.after ?? null, opts.after ?? 0, limit) as Record<string, unknown>[];
    let items = rows.map((r) => this.hydrateMessage(r, me.id));
    if (opts.unread) items = items.filter((m) => !m.read && m.from !== me.handle);
    return items.reverse();
  }

  ack(me: User, messageId: string) {
    const m = this.db.prepare("SELECT * FROM messages WHERE id = ?").get(messageId) as
      | Record<string, unknown>
      | undefined;
    if (!m) throw new RelayError(404, "Message not found.");
    this.db
      .prepare("INSERT OR IGNORE INTO receipts (message_id, user_id) VALUES (?, ?)")
      .run(messageId, me.id);
    return { ok: true, id: messageId };
  }

  private hydrateMessage(r: Record<string, unknown>, viewerId: string) {
    const from = this.getUser(String(r.from_user));
    const to = r.to_user ? this.getUser(String(r.to_user)) : undefined;
    const room = r.room_id
      ? (this.db.prepare("SELECT slug FROM rooms WHERE id = ?").get(r.room_id) as { slug: string } | undefined)
      : undefined;
    const read = Boolean(
      this.db.prepare("SELECT 1 FROM receipts WHERE message_id = ? AND user_id = ?").get(r.id, viewerId),
    );
    return {
      id: String(r.id),
      from: from?.handle ?? "unknown",
      to: to?.handle ?? null,
      room: room?.slug ?? null,
      kind: String(r.kind ?? "chat"),
      body: String(r.body),
      created_at: Number(r.created_at),
      read,
    };
  }

  resolveScope(me: User, target: string): string {
    const t = target.trim().replace(/^@/, "");
    const room = this.getRoom(t);
    if (room) {
      this.requireRoomMember(me, room.slug);
      return roomScope(room.id);
    }
    const other = this.getUserByHandle(t);
    if (!other) throw new RelayError(404, `No person or room named ${t}.`);
    this.requireContact(me, other);
    return dmScope(me.id, other.id);
  }

  remember(me: User, target: string, key: string, value: string) {
    const scope = this.resolveScope(me, target);
    const k = key.trim();
    if (!k) throw new RelayError(400, "Memory key is required.");
    const v = value.trim();
    if (!v) throw new RelayError(400, "Memory value is required.");
    const existing = this.db.prepare("SELECT id FROM memory WHERE scope = ? AND key = ?").get(scope, k) as
      | { id: string }
      | undefined;
    const t = now();
    if (existing) {
      this.db
        .prepare("UPDATE memory SET value = ?, updated_by = ?, updated_at = ? WHERE id = ?")
        .run(v, me.id, t, existing.id);
      return { id: existing.id, key: k, value: v, scope: target };
    }
    const mid = id("mem");
    this.db
      .prepare(
        "INSERT INTO memory (id, scope, key, value, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(mid, scope, k, v, me.id, t);
    return { id: mid, key: k, value: v, scope: target };
  }

  recall(me: User, target: string, key?: string) {
    const scope = this.resolveScope(me, target);
    if (key) {
      const row = this.db.prepare("SELECT * FROM memory WHERE scope = ? AND key = ?").get(scope, key) as
        | Record<string, unknown>
        | undefined;
      return row ? [this.memPublic(row, me)] : [];
    }
    const rows = this.db
      .prepare("SELECT * FROM memory WHERE scope = ? ORDER BY key")
      .all(scope) as Record<string, unknown>[];
    return rows.map((r) => this.memPublic(r, me));
  }

  private memPublic(r: Record<string, unknown>, me: User) {
    const by = this.getUser(String(r.updated_by));
    return {
      id: String(r.id),
      key: String(r.key),
      value: String(r.value),
      updated_by: by?.handle ?? "unknown",
      updated_at: Number(r.updated_at),
      mine: String(r.updated_by) === me.id,
    };
  }

  createPlan(me: User, target: string, title: string, body = "") {
    const scope = this.resolveScope(me, target);
    const p = {
      id: id("pln"),
      scope,
      title: title.trim(),
      body: body.trim(),
      status: "active",
      updated_by: me.id,
      updated_at: now(),
    };
    if (!p.title) throw new RelayError(400, "Plan title is required.");
    this.db
      .prepare(
        "INSERT INTO plans (id, scope, title, body, status, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(p.id, p.scope, p.title, p.body, p.status, p.updated_by, p.updated_at);
    return this.planPublic(p as unknown as Record<string, unknown>, me, target);
  }

  listPlans(me: User, target: string) {
    const scope = this.resolveScope(me, target);
    const rows = this.db
      .prepare("SELECT * FROM plans WHERE scope = ? ORDER BY updated_at DESC")
      .all(scope) as Record<string, unknown>[];
    return rows.map((r) => this.planPublic(r, me, target));
  }

  updatePlan(me: User, planId: string, patch: { title?: string; body?: string; status?: string }) {
    const row = this.db.prepare("SELECT * FROM plans WHERE id = ?").get(planId) as
      | Record<string, unknown>
      | undefined;
    if (!row) throw new RelayError(404, "Plan not found.");
    this.assertScopeAccess(me, String(row.scope));
    const title = patch.title?.trim() ?? String(row.title);
    const body = patch.body != null ? patch.body : String(row.body);
    const status = patch.status?.trim() ?? String(row.status);
    if (!["active", "done", "paused"].includes(status)) {
      throw new RelayError(400, "Status must be active, paused, or done.");
    }
    this.db
      .prepare("UPDATE plans SET title = ?, body = ?, status = ?, updated_by = ?, updated_at = ? WHERE id = ?")
      .run(title, body, status, me.id, now(), planId);
    return this.planPublic(
      this.db.prepare("SELECT * FROM plans WHERE id = ?").get(planId) as Record<string, unknown>,
      me,
    );
  }

  private assertScopeAccess(me: User, scope: string) {
    if (scope.startsWith("dm:")) {
      const parts = scope.split(":");
      if (!parts.includes(me.id)) throw new RelayError(403, "Not your shared memory/plan.");
      return;
    }
    if (scope.startsWith("room:")) {
      const roomId = scope.slice(5);
      const mem = this.db
        .prepare("SELECT 1 FROM room_members WHERE room_id = ? AND user_id = ?")
        .get(roomId, me.id);
      if (!mem) throw new RelayError(403, "Not in that room.");
    }
  }

  private planPublic(r: Record<string, unknown>, me: User, targetHint?: string) {
    const by = this.getUser(String(r.updated_by));
    return {
      id: String(r.id),
      title: String(r.title),
      body: String(r.body),
      status: String(r.status),
      updated_by: by?.handle ?? "unknown",
      updated_at: Number(r.updated_at),
      target: targetHint,
    };
  }

  snapshot(me: User) {
    return {
      me,
      people: this.people(me),
      rooms: this.listRooms(me),
      inbox: this.inbox(me, { unread: true, limit: 20 }),
    };
  }
}
