import { connect } from "node:tls";
import { RelayError } from "./errors.ts";

export type SmtpAuth = { host: string; port: number; user: string; pass: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function bareAddr(from: string): string {
  const t = from.trim();
  const open = t.lastIndexOf("<");
  if (open >= 0) {
    if (!t.endsWith(">") || open === t.length - 1) return "";
    return t.slice(open + 1, -1).trim();
  }
  return t;
}

/** Validate an address before it can reach an SMTP command or mail header. */
export function validateMailAddress(raw: string, label = "email"): string {
  if (/[\r\n]/.test(raw)) {
    throw new RelayError(400, `${label} address must not contain CR or LF.`);
  }
  const address = bareAddr(raw);
  if (address.length > 254 || /[<>]/.test(address) || !EMAIL_RE.test(address)) {
    throw new RelayError(400, `That does not look like a valid ${label} address.`);
  }
  return address.toLowerCase();
}

function smtpPort(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const port = Number(raw);
  return Number.isInteger(port) && port >= 1 && port <= 65_535 ? port : null;
}

/** smtps://user:pass@host:465 or RELAY_SMTP_HOST + USER + PASS. Never log the password. */
export function readSmtp(): SmtpAuth | null {
  const raw = process.env.RELAY_SMTP_URL;
  if (raw !== undefined) {
    try {
      const u = new URL(raw.trim());
      if (u.protocol !== "smtps:" || !u.hostname || !u.username || !u.password) return null;
      const port = smtpPort(u.port || "465");
      if (port === null) return null;
      const user = decodeURIComponent(u.username);
      const pass = decodeURIComponent(u.password);
      if (!user || !pass || /[\r\n]/.test(user) || /[\r\n]/.test(pass)) return null;
      return {
        host: u.hostname,
        port,
        user,
        pass,
      };
    } catch {
      return null;
    }
  }
  const host = process.env.RELAY_SMTP_HOST?.trim();
  const user = process.env.RELAY_SMTP_USER;
  const pass = process.env.RELAY_SMTP_PASS;
  if (!host || !user || !pass) return null;
  const port = smtpPort(process.env.RELAY_SMTP_PORT?.trim() || "465");
  if (port === null || /[\r\n]/.test(host) || /[\r\n]/.test(user) || /[\r\n]/.test(pass)) return null;
  return { host, port, user, pass };
}

export async function sendSmtp(
  auth: SmtpAuth,
  mail: { from: string; to: string; subject: string; text: string },
): Promise<void> {
  const from = validateMailAddress(mail.from, "sender");
  const to = validateMailAddress(mail.to, "recipient");
  await new Promise<void>((resolve, reject) => {
    const sock = connect({ host: auth.host, port: auth.port, servername: auth.host });
    const timer = setTimeout(() => {
      sock.destroy();
      reject(new RelayError(502, "SMTP timed out. Check RELAY_SMTP_URL."));
    }, 20_000);
    const fail = (e: unknown) => {
      clearTimeout(timer);
      sock.destroy();
      reject(e);
    };
    sock.setEncoding("utf8");
    sock.on("error", fail);

    let buf = "";
    const pending: string[] = [];
    const waiters: Array<(line: string) => void> = [];
    const onLine = (line: string) => {
      const w = waiters.shift();
      if (w) w(line);
      else pending.push(line);
    };
    sock.on("data", (chunk: string) => {
      buf += chunk;
      for (;;) {
        const n = buf.indexOf("\r\n");
        if (n < 0) break;
        onLine(buf.slice(0, n));
        buf = buf.slice(n + 2);
      }
    });

    const readLine = () =>
      pending.length ? Promise.resolve(pending.shift()!) : new Promise<string>((res) => waiters.push(res));

    async function readReply() {
      let line = await readLine();
      let text = line;
      while (line.length >= 4 && line[3] === "-") {
        line = await readLine();
        text += `\n${line}`;
      }
      return { code: Number.parseInt(line.slice(0, 3), 10), text };
    }

    async function cmd(line: string, expect: number) {
      sock.write(`${line}\r\n`);
      const r = await readReply();
      if (r.code !== expect) {
        throw new RelayError(502, "SMTP rejected the mail. Check RELAY_SMTP_URL and RELAY_FROM_EMAIL.");
      }
      return r;
    }

    void (async () => {
      try {
        const greet = await readReply();
        if (greet.code !== 220) {
          throw new RelayError(502, "SMTP rejected the mail. Check RELAY_SMTP_URL and RELAY_FROM_EMAIL.");
        }
        await cmd("EHLO agent-relay", 250);
        const plain = Buffer.from(`\0${auth.user}\0${auth.pass}`, "utf8").toString("base64");
        await cmd(`AUTH PLAIN ${plain}`, 235);
        await cmd(`MAIL FROM:<${from}>`, 250);
        await cmd(`RCPT TO:<${to}>`, 250);
        await cmd("DATA", 354);
        const subject = mail.subject.replace(/[\r\n]+/g, " ");
        const body = mail.text.replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..");
        sock.write(
          `From: ${mail.from}\r\nTo: ${mail.to}\r\nSubject: ${subject}\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}\r\n.\r\n`,
        );
        const data = await readReply();
        if (data.code !== 250) {
          throw new RelayError(502, "SMTP rejected the mail. Check RELAY_SMTP_URL and RELAY_FROM_EMAIL.");
        }
        sock.write("QUIT\r\n");
        sock.end();
        clearTimeout(timer);
        resolve();
      } catch (e) {
        fail(e);
      }
    })();
  });
}
