import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export function normalizeEmail(email: string): string {
  const e = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || e.length > 254) {
    throw new Error("That does not look like an email address.");
  }
  return e;
}

export type Mail = { to: string; subject: string; text: string };

export async function sendMail(mail: Mail): Promise<{ delivered: "resend" | "file" }> {
  const key = process.env.RELAY_RESEND_KEY;
  if (key) {
    const from = process.env.RELAY_FROM_EMAIL ?? "relay@localhost";
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ from, to: mail.to, subject: mail.subject, text: mail.text }),
    });
    if (!res.ok) {
      throw new Error(`Resend failed: ${res.status} ${await res.text()}`);
    }
    return { delivered: "resend" };
  }
  const dir = process.env.RELAY_MAILBOX_DIR ?? join(homedir(), ".agent-relay", "mailbox");
  mkdirSync(dir, { recursive: true });
  const safe = mail.to.replace(/[^a-z0-9._+-]/g, "_");
  const path = join(dir, `${Date.now()}-${safe}.txt`);
  writeFileSync(path, `To: ${mail.to}\nSubject: ${mail.subject}\n\n${mail.text}\n`);
  console.log(`[mail:file] ${mail.to} → ${path}`);
  return { delivered: "file" };
}
