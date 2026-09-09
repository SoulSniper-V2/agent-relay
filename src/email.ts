import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { RelayError } from "./errors.ts";
import { readSmtp, sendSmtp } from "./smtp.ts";

export function normalizeEmail(email: string): string {
  const e = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || e.length > 254) {
    throw new Error("That does not look like an email address.");
  }
  return e;
}

export type Mail = { to: string; subject: string; text: string };
export type MailTransport = "resend" | "smtp" | "file" | "off";
export type MailStatus = {
  email: MailTransport;
  login_ok: boolean;
  sandbox: boolean;
  two_person: boolean;
  hint: string;
};

export function parseFromAddress(from: string): string {
  const t = from.trim();
  const m = t.match(/<([^>]+)>/);
  return (m ? m[1] : t).trim().toLowerCase();
}

/** Resend's shared from can only deliver to the Resend account email, not a second person. */
export function isResendSandbox(from: string): boolean {
  return parseFromAddress(from).endsWith("@resend.dev");
}

function fromEnv(): string {
  return process.env.RELAY_FROM_EMAIL?.trim() ?? "";
}

/** How this process delivers mail. Never include the key. */
export function mailTransport(): MailTransport {
  const key = process.env.RELAY_RESEND_KEY;
  const from = fromEnv();
  const smtp = readSmtp();
  if (smtp && from) return "smtp";
  if (key && from) return "resend";
  if (key || process.env.RELAY_REQUIRE_EMAIL === "1") return "off";
  return "file";
}

/** Status agents should read before they try login. Missing `email` on old hubs is off. */
export function mailStatus(email: unknown = mailTransport()): MailStatus {
  const t: MailTransport =
    email === "resend" || email === "smtp" || email === "file" || email === "off" ? email : "off";
  if (t === "off") {
    return {
      email: t,
      login_ok: false,
      sandbox: false,
      two_person: false,
      hint: "Hub is not sending login email. Two-person hosted login needs Resend with a verified domain (RELAY_RESEND_KEY + RELAY_FROM_EMAIL that is not @resend.dev) or SMTP (RELAY_SMTP_URL + RELAY_FROM_EMAIL). onboarding@resend.dev can only mail the Resend account owner. Do not invent a code.",
    };
  }
  if (t === "file") {
    return {
      email: t,
      login_ok: true,
      sandbox: false,
      two_person: true,
      hint: "Local file mailbox. Ask the human to read RELAY_MAILBOX_DIR (default ~/.agent-relay/mailbox).",
    };
  }
  if (t === "smtp") {
    return {
      email: t,
      login_ok: true,
      sandbox: false,
      two_person: true,
      hint: "OTP email is live over SMTP. Ask the human for the 6-digit code. Do not invent one.",
    };
  }
  const sandbox = isResendSandbox(fromEnv());
  if (sandbox) {
    return {
      email: t,
      login_ok: true,
      sandbox: true,
      two_person: false,
      hint: "Resend sandbox: onboarding@resend.dev can only mail the Resend account email. Two people cannot log in until RELAY_FROM_EMAIL uses a verified domain, or set SMTP. Do not invent a code.",
    };
  }
  return {
    email: t,
    login_ok: true,
    sandbox: false,
    two_person: true,
    hint: "OTP email is live. Ask the human for the 6-digit code. Do not invent one.",
  };
}

export async function sendMail(mail: Mail): Promise<{ delivered: "resend" | "smtp" | "file" }> {
  const key = process.env.RELAY_RESEND_KEY;
  const from = fromEnv();
  const smtp = readSmtp();
  const transport = mailTransport();
  if (transport === "off") {
    if (key && !from) {
      throw new RelayError(
        503,
        "This hub has a Resend key but no RELAY_FROM_EMAIL. Set both on the hub. Two-person login needs a verified domain in From, not onboarding@resend.dev.",
      );
    }
    throw new RelayError(
      503,
      "This hub is not sending email yet. Tell the human: hosted two-person mail needs Resend with a verified domain, or SMTP (RELAY_SMTP_URL + RELAY_FROM_EMAIL).",
    );
  }
  if (transport === "resend") {
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
        isResendSandbox(from)
          ? "Resend sandbox rejected the mail. onboarding@resend.dev can only mail the Resend account email. Verify a domain or use SMTP. Do not invent a login code."
          : "Resend rejected the mail. The from-address may be unverified. Do not invent a login code.",
      );
    }
    return { delivered: "resend" };
  }
  if (transport === "smtp" && smtp && from) {
    try {
      await sendSmtp(smtp, { from, to: mail.to, subject: mail.subject, text: mail.text });
    } catch (e) {
      if (e instanceof RelayError) throw e;
      throw new RelayError(502, "SMTP rejected the mail. Check RELAY_SMTP_URL and RELAY_FROM_EMAIL. Do not invent a login code.");
    }
    return { delivered: "smtp" };
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
