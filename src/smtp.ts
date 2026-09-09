import { connect } from "node:tls";
import { RelayError } from "./errors.ts";

export type SmtpAuth = { host: string; port: number; user: string; pass: string };

function bareAddr(from: string): string {
  const t = from.trim();
  const m = t.match(/<([^>]+)>/);
  return (m ? m[1] : t).trim();
}

/** smtps://user:pass@host:465 or RELAY_SMTP_HOST + USER + PASS. Never log the password. */
export function readSmtp(): SmtpAuth | null {
  const raw = process.env.RELAY_SMTP_URL?.trim();
  if (raw) {
    try {
      const u = new URL(raw);
      if (!u.hostname || !u.username || !u.password) return null;
      return {
        host: u.hostname,
        port: u.port ? Number(u.port) : 465,
        user: decodeURIComponent(u.username),
        pass: decodeURIComponent(u.password),
      };
    } catch {
      return null;
    }
  }
  const host = process.env.RELAY_SMTP_HOST?.trim();
  const user = process.env.RELAY_SMTP_USER;
  const pass = process.env.RELAY_SMTP_PASS;
  if (!host || !user || !pass) return null;
  return { host, port: Number(process.env.RELAY_SMTP_PORT || 465), user, pass };
}

export async function sendSmtp(
  auth: SmtpAuth,
  mail: { from: string; to: string; subject: string; text: string },
): Promise<void> {
  const from = bareAddr(mail.from);
  const to = bareAddr(mail.to);
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
