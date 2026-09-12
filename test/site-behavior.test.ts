import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

const siteSource = readFileSync(new URL("../www/site.js", import.meta.url), "utf8");

function element(document: any, tagName = "div", initial: Record<string, string> = {}) {
  const attributes = new Map(Object.entries(initial));
  const classes = new Set<string>();
  const listeners = new Map<string, (() => unknown)[]>();
  let id = initial.id || "";
  const node: any = {
    tagName,
    children: [],
    listeners,
    attributes,
    innerHTML: "",
    textContent: "",
    innerText: "",
    hidden: false,
    parentNode: null,
    focusCount: 0,
    selected: false,
    classList: {
      toggle(name: string, force?: boolean) {
        const enabled = force === undefined ? !classes.has(name) : force;
        if (enabled) classes.add(name);
        else classes.delete(name);
        return enabled;
      },
      contains: (name: string) => classes.has(name),
      remove: (name: string) => classes.delete(name),
    },
    getAttribute: (name: string) => attributes.get(name) ?? null,
    setAttribute: (name: string, value: string) => {
      attributes.set(name, String(value));
      if (name === "id") node.id = String(value);
    },
    addEventListener: (type: string, listener: () => unknown) => {
      const current = listeners.get(type) || [];
      current.push(listener);
      listeners.set(type, current);
    },
    dispatch: async (type: string) => {
      for (const listener of listeners.get(type) || []) await listener();
    },
    appendChild: (child: any) => {
      child.parentNode = node;
      node.children.push(child);
      if (child.id) document.byId.set(child.id, child);
      return child;
    },
    removeChild: (child: any) => {
      const index = node.children.indexOf(child);
      if (index >= 0) node.children.splice(index, 1);
      child.parentNode = null;
      return child;
    },
    remove: () => node.parentNode?.removeChild(node),
    focus: () => {
      node.focusCount += 1;
      document.activeElement = node;
    },
    select: () => {
      node.selected = true;
      document.activeElement = node;
    },
  };
  Object.defineProperty(node, "id", {
    get: () => id,
    set: (value: string) => {
      id = String(value);
      attributes.set("id", id);
      document.byId.set(id, node);
    },
  });
  Object.defineProperty(node, "className", {
    get: () => attributes.get("class") || "",
    set: (value: string) => attributes.set("class", String(value)),
  });
  if (id) document.byId.set(id, node);
  return node;
}

function documentFixture() {
  const document: any = {
    byId: new Map(),
    copyElements: [],
    navElements: [],
    sections: new Map(),
    execCommand: () => true,
  };
  document.body = element(document, "body");
  document.activeElement = document.body;
  document.createElement = (tagName: string) => element(document, tagName);
  document.getElementById = (id: string) => document.byId.get(id) || null;
  document.querySelector = (selector: string) => {
    if (!selector.startsWith("#")) return null;
    const id = selector.slice(1);
    return document.sections.get(id) || document.byId.get(id) || null;
  };
  document.querySelectorAll = (selector: string) =>
    selector === "[data-copy], [data-copy-from]"
      ? document.copyElements
      : selector === ".side a[href^='#']"
        ? document.navElements
        : [];
  return document;
}

function browserWindow() {
  let nextTimer = 1;
  const timers = new Map<number, { callback: () => void; delay: number }>();
  return {
    timers,
    setTimeout(callback: () => void, delay: number) {
      const id = nextTimer++;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id: number) {
      timers.delete(id);
    },
    runNextTimer() {
      const entry = timers.entries().next().value as [number, { callback: () => void; delay: number }] | undefined;
      if (!entry) return false;
      timers.delete(entry[0]);
      entry[1].callback();
      return true;
    },
  } as any;
}

function runSite(document: any, window: any, options: any = {}) {
  if (options.IntersectionObserver) window.IntersectionObserver = options.IntersectionObserver;
  return runInNewContext(siteSource, {
    document,
    window,
    navigator: options.navigator || {},
    fetch: options.fetch || (() => Promise.resolve({ ok: true, status: 200, json: async () => ({}) })),
    IntersectionObserver: options.IntersectionObserver,
    Promise,
    AbortController: globalThis.AbortController,
    Number,
    setTimeout: window.setTimeout.bind(window),
    clearTimeout: window.clearTimeout.bind(window),
  });
}

async function nextTurn() {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

function copyButton(document: any, attributes: Record<string, string>) {
  const button = element(document, "button", attributes);
  button.innerHTML = "Copy";
  document.copyElements.push(button);
  return button;
}

function hubDocument() {
  const document = documentFixture();
  const hubStatus = element(document, "p");
  document.byId.set("hub-status", hubStatus);
  return { document, hubStatus };
}

test("copy status is announced and empty sources do not write clipboard data", async () => {
  const document = documentFixture();
  const prompt = element(document, "pre");
  prompt.innerText = "Read this\n";
  const empty = element(document, "pre");
  empty.innerText = "  \n";
  document.sections.set("prompt", prompt);
  document.sections.set("empty", empty);
  const button = copyButton(document, { "data-copy-from": "#prompt" });
  const emptyButton = copyButton(document, { "data-copy-from": "#empty" });
  const missingButton = copyButton(document, { "data-copy-from": "#missing" });
  const copied: string[] = [];

  runSite(document, browserWindow(), { navigator: { clipboard: { writeText: (text: string) => copied.push(text) } } });
  await button.dispatch("click");
  const status = document.getElementById("copy-status");
  assert.equal(status?.getAttribute("role"), "status");
  assert.equal(status?.getAttribute("aria-live"), "polite");
  assert.equal(status?.textContent, "Copied to clipboard.");
  assert.deepEqual(copied, ["Read this"]);

  await emptyButton.dispatch("click");
  await missingButton.dispatch("click");
  assert.equal(status?.textContent, "Nothing to copy.");
  assert.equal(copied.length, 1);
});

test("fallback copy cleans up and restores focus when execCommand throws", async () => {
  const document = documentFixture();
  const button = copyButton(document, { "data-copy": "fallback text" });
  button.focus();
  let textarea: any;
  const createElement = document.createElement;
  document.createElement = (tagName: string) => {
    const node = createElement(tagName);
    if (tagName === "textarea") textarea = node;
    return node;
  };
  document.execCommand = () => {
    throw new Error("blocked");
  };

  runSite(document, browserWindow());
  await button.dispatch("click");
  assert.equal(textarea.parentNode, null);
  assert.equal(document.activeElement, button);
  assert.ok(button.focusCount >= 2);
  assert.equal(document.getElementById("copy-status")?.textContent, "Copy failed. Try again.");
});

test("health rejects bad responses and times out with retryable status", async () => {
  const { document, hubStatus } = hubDocument();
  const window = browserWindow();
  let requests = 0;
  const fetch = () => {
    requests += 1;
    return Promise.resolve({ ok: false, status: 503, json: async () => ({}) });
  };

  runSite(document, window, { fetch });
  await nextTurn();
  await nextTurn();
  assert.match(hubStatus.textContent, /Could not reach hosted signup status/);
  assert.equal(hubStatus.children[0]?.textContent, "Retry");
  assert.equal(requests, 1);

  const timeoutFixture = hubDocument();
  const timeoutWindow = browserWindow();
  let signal: any;
  runSite(timeoutFixture.document, timeoutWindow, {
    fetch: (_url: unknown, options: any) => {
      signal = options.signal;
      return new Promise(() => {});
    },
  });
  await nextTurn();
  assert.equal(timeoutWindow.timers.size, 1);
  timeoutWindow.runNextTimer();
  await nextTurn();
  await nextTurn();
  assert.equal(signal.aborted, true);
  assert.equal(timeoutFixture.hubStatus.children[0]?.textContent, "Retry");
});

test("docs section observer still marks the strongest visible section", () => {
  const document = documentFixture();
  const firstNav = element(document, "a", { href: "#first" });
  const secondNav = element(document, "a", { href: "#second" });
  document.navElements.push(firstNav, secondNav);
  document.sections.set("first", element(document, "section", { id: "first" }));
  document.sections.set("second", element(document, "section", { id: "second" }));
  let observerCallback: ((entries: unknown[]) => void) | undefined;
  class Observer {
    constructor(callback: (entries: unknown[]) => void) {
      observerCallback = callback;
    }

    observe() {}
  }

  runSite(document, browserWindow(), { IntersectionObserver: Observer });
  observerCallback?.([
    { isIntersecting: true, intersectionRatio: 0.25, target: document.sections.get("first") },
    { isIntersecting: true, intersectionRatio: 0.9, target: document.sections.get("second") },
  ]);
  assert.equal(firstNav.classList.contains("on"), false);
  assert.equal(secondNav.classList.contains("on"), true);
});
