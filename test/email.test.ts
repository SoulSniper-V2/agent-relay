import assert from "node:assert/strict";
import { readdirSync, readFileSync, rmSync, statSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { inviteMail, loginCodeMail, mailStatus, mailTransport, sendMail } from "../src/email.ts";
import { readSmtp } from "../src/smtp.ts";

const ENV_NAMES = [
  "RELAY_RESEND_KEY",
  "RELAY_FROM_EMAIL",
  "RELAY_REQUIRE_EMAIL",
  "RELAY_SMTP_URL",
  "RELAY_SMTP_HOST",
  "RELAY_SMTP_PORT",
  "RELAY_SMTP_USER",
  "RELAY_SMTP_PASS",
  "RELAY_MAILBOX_DIR",
] as const;

function saveEnv() {
  return Object.fromEntries(ENV_NAMES.map((name) => [name, process.env[name]])) as Record<string, string | undefined>;
}

function clearMailEnv() {
  for (const name of ENV_NAMES) delete process.env[name];
}

function restoreEnv(saved: Record<string, string | undefined>) {
  clearMailEnv();
  for (const name of ENV_NAMES) {
    if (saved[name] !== undefined) process.env[name] = saved[name];
  }
}

test("malformed explicit SMTP config fails closed instead of selecting file mail", () => {
  const saved = saveEnv();
  try {
    clearMailEnv();
    process.env.RELAY_SMTP_URL = "smtp://user:fixture@smtp.example.test:465";
    assert.equal(readSmtp(), null);
    assert.equal(mailTransport(), "off");
    assert.equal(mailStatus().email, "off");

    process.env.RELAY_SMTP_URL = "smtps://user:fixture@smtp.example.test:65536";
    assert.equal(readSmtp(), null);

    process.env.RELAY_SMTP_URL = "smtps://user%40example.test:fixture@smtp.example.test:465";
    assert.deepEqual(readSmtp(), {
      host: "smtp.example.test",
      port: 465,
      user: "user@example.test",
      pass: "fixture",
    });
  } finally {
    restoreEnv(saved);
  }
});

test("mail addresses with CRLF are rejected before Resend is called", async () => {
  const saved = saveEnv();
  const previousFetch = globalThis.fetch;
  let fetchCalls = 0;
  try {
    clearMailEnv();
    process.env.RELAY_RESEND_KEY = "fixture-key";
    process.env.RELAY_FROM_EMAIL = "Agent Relay <sender@example.test>";
    globalThis.fetch = (async () => {
      fetchCalls += 1;
      return new Response(null, { status: 200 });
    }) as typeof fetch;

    assert.throws(
      () => inviteMail("alice", "recipient@example.test\r\nBcc: victim@example.test", "ABC123"),
      /CR or LF/,
    );
    assert.throws(() => inviteMail("alice", "recipient@example.test>", "ABC123"), /valid/);
    await assert.rejects(
      () =>
        sendMail({
          to: "recipient@example.test\nBcc: victim@example.test",
          subject: "hello",
          text: "body",
        }),
      /CR or LF/,
    );

    process.env.RELAY_FROM_EMAIL = "Agent Relay\r\nBcc: victim@example.test <sender@example.test>";
    await assert.rejects(
      () => sendMail({ to: "recipient@example.test", subject: "hello", text: "body" }),
      /CR or LF/,
    );
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = previousFetch;
    restoreEnv(saved);
  }
});

test("Resend receives an abort signal for its finite request timeout", async () => {
  const saved = saveEnv();
  const previousFetch = globalThis.fetch;
  const previousAbortSignalTimeout = AbortSignal.timeout;
  let signal: AbortSignal | undefined;
  let fetchCalls = 0;
  try {
    clearMailEnv();
    process.env.RELAY_RESEND_KEY = "fixture-key";
    process.env.RELAY_FROM_EMAIL = "sender@example.test";
    AbortSignal.timeout = ((delay) => {
      assert.equal(delay, 10_000);
      return AbortSignal.abort();
    }) as typeof AbortSignal.timeout;
    globalThis.fetch = ((_input, init) => {
      fetchCalls += 1;
      signal = init?.signal as AbortSignal | undefined;
      if (signal?.aborted) return Promise.reject(new DOMException("The operation was aborted", "AbortError"));
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener(
          "abort",
          () => reject(new DOMException("The operation was aborted", "AbortError")),
          { once: true },
        );
      });
    }) as typeof fetch;
    await assert.rejects(
      () => sendMail(loginCodeMail("recipient@example.test", "123456")),
      (error: unknown) => error instanceof Error && "status" in error && error.status === 502 && /timed out/i.test(error.message),
    );
    assert.ok(signal);
    assert.equal(signal.aborted, true);
    assert.equal(fetchCalls, 1);
  } finally {
    globalThis.fetch = previousFetch;
    AbortSignal.timeout = previousAbortSignalTimeout;
    restoreEnv(saved);
  }
});

test("local code mailbox and files are private", async () => {
  const saved = saveEnv();
  const dir = mkdtempSync(join(tmpdir(), "relay-email-"));
  try {
    clearMailEnv();
    const mailbox = join(dir, "mailbox");
    process.env.RELAY_MAILBOX_DIR = mailbox;
    const result = await sendMail(loginCodeMail("recipient@example.test", "123456"));
    assert.deepEqual(result, { delivered: "file" });
    assert.equal(statSync(mailbox).mode & 0o777, 0o700);
    const [file] = readdirSync(mailbox);
    assert.ok(file);
    assert.equal(statSync(join(mailbox, file)).mode & 0o777, 0o600);
    assert.match(readFileSync(join(mailbox, file), "utf8"), /123456/);
  } finally {
    restoreEnv(saved);
    rmSync(dir, { recursive: true, force: true });
  }
});

test("mail status reports configuration without claiming delivery", () => {
  const smtp = mailStatus("smtp");
  assert.equal(smtp.login_ok, true);
  assert.equal(smtp.two_person, true);
  assert.match(smtp.hint, /configured, delivery not verified/);

  const resend = mailStatus("resend");
  assert.equal(resend.login_ok, true);
  assert.equal(resend.two_person, true);
  assert.match(resend.hint, /configured, delivery not verified/);
});
