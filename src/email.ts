import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { RelayError } from "./errors.ts";

export function normalizeEmail(email: string): string {
  const e = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || e.length > 254) {
    throw new Error("That does not look like an email address.");
  }
  return e;
}

export type Mail = { to: string; subject: string; text: string };
export type MailTransport = "resend" | "file" | "off";

/** How this process delivers mail. Never include the key. */
export function mailTransport(): MailTransport {
  const key = process.env.RELAY_RESEND_KEY;
  const from = process.env.RELAY_FROM_EMAIL?.trim();
  if (key && from) return "resend";
  if (key || process.env.RELAY_REQUIRE_EMAIL === "1") return "off";
  return "file";
}

/** Status agents should read before they try login. Missing `email` on old hubs is off. */
export function mailStatus(email: unknown = mailTransport()): {
  email: MailTransport;
  login_ok: boolean;
  hint: string;
} {
  const t: MailTransport = email === "resend" || email === "file" || email === "off" ? email : "off";
  if (t === "resend") {
    return { email: t, login_ok: true, hint: "OTP email is live. Ask the human for the 6-digit code. Do not invent one." };
  }
  if (t === "file") {
    return {
      email: t,
      login_ok: true,
      hint: "Local file mailbox. Ask the human to read RELAY_MAILBOX_DIR (default ~/.agent-relay/mailbox).",
    };
  }
  return {
    email: t,
    login_ok: false,
    hint: "Hub is not sending login email. Tell the human: set Fly secrets RELAY_RESEND_KEY and RELAY_FROM_EMAIL. Until a domain is verified, From can be Agent Relay <onboarding@resend.dev>. Do not invent a code.",
  };
}

export async function sendMail(mail: Mail): Promise<{ delivered: "resend" | "file" }> {
  const key = process.env.RELAY_RESEND_KEY;
  const from = process.env.RELAY_FROM_EMAIL?.trim();
  if (!key && process.env.RELAY_REQUIRE_EMAIL === "1") {
    throw new RelayError(
      503,
      "This hub is not sending email yet. Tell the human: hosted mail needs Resend (RELAY_RESEND_KEY and RELAY_FROM_EMAIL).",
    );
  }
  if (key) {
    if (!from) {
      throw new RelayError(
        503,
        "This hub has a Resend key but no RELAY_FROM_EMAIL. Set both Fly secrets. Until a domain is verified, From can be Agent Relay <onboarding@resend.dev>.",
      );
    }
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ from, to: mail.to, subject: mail.subject, text: mail.text }),
    });
    if (!res.ok) {
      await res.text().catch(() => "");
      throw new RelayError(
        502,
        "Resend rejected the mail. The from-address may be unverified. Do not invent a login code.",
      );
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

export function loginCodeMail(to: string, code: string): Mail {
  return {
    to,
    subject: "Your agent-relay login code",
    text: [
      `Your login code is: ${code}`,
      "",
      "Give this code to your agent.",
      "It expires in 10 minutes. Do not forward it.",
    ].join("\n"),
  };
}

export function inviteMail(fromHandle: string, to: string, code: string): Mail {
  return {
    to,
    subject: `@${fromHandle} invited your agent to agent-relay`,
    text: [
      `@${fromHandle} wants your agents to talk — humans stay out until an agent escalates.`,
      "",
      `1. Tell your agent: relay login ${to}`,
      `2. After login: relay accept ${code}`,
      "",
      `Invite code: ${code}`,
    ].join("\n"),
  };
}

export function inviteResult(
  inv: { code: string; from: string; expires_at: number },
  opts: { emailed?: string; mail_error?: string; hub?: string } = {},
) {
  return {
    ...inv,
    emailed: opts.emailed,
    mail_error: opts.mail_error,
    accept: `relay accept ${inv.code}`,
    hint: opts.mail_error
      ? `Invite created. Email was not sent. Give them this code in chat: relay accept ${inv.code}`
      : opts.emailed
        ? `Emailed ${opts.emailed}. They log in, then relay accept ${inv.code}.`
        : "Send this code to a friend. They log in on the same hub, then accept.",
    hub: opts.hub,
  };
}
