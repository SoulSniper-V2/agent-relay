import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

const uiSource = readFileSync(new URL("../www/ui.js", import.meta.url), "utf8");

type Listener = (event?: { type: string; target: unknown }) => void;

function node(initial: Record<string, string> = {}) {
  const attributes = new Map(Object.entries(initial));
  const listeners = new Map<string, Listener[]>();
  const dataset: Record<string, string> = {};
  const element: any = {
    attributes,
    dataset,
    hidden: false,
    textContent: "",
    value: "",
    getAttribute(name: string) {
      return attributes.get(name) ?? null;
    },
    setAttribute(name: string, value: string) {
      attributes.set(name, String(value));
    },
    addEventListener(type: string, listener: Listener) {
      const current = listeners.get(type) ?? [];
      current.push(listener);
      listeners.set(type, current);
    },
    dispatch(type: string) {
      for (const listener of listeners.get(type) ?? [])
        listener({ type, target: element });
    },
  };
  for (const [name, value] of Object.entries(initial)) {
    if (name.startsWith("data-")) {
      const key = name
        .slice(5)
        .replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());
      dataset[key] = value;
    }
  }
  return element;
}

function storageFixture(storedTheme?: string, blocked = false) {
  const writes: string[][] = [];
  return {
    writes,
    getItem(key: string) {
      if (blocked) throw new Error("Storage is blocked");
      return key === "relay-theme" ? (storedTheme ?? null) : null;
    },
    setItem(key: string, value: string) {
      if (blocked) throw new Error("Storage is blocked");
      writes.push([key, value]);
    },
  };
}

function fixture(
  options: {
    pathname?: string;
    hash?: string;
    storedTheme?: string;
    blockedStorage?: boolean;
    links?: any[];
  } = {},
) {
  const toggles = [
    node({ "data-theme-toggle": "" }),
    node({ "data-theme-toggle": "" }),
  ];
  const search = node({ "data-docs-search": "" });
  const empty = node({ "data-docs-empty": "" });
  const themeMeta = node({ name: "theme-color", content: "#f7f8fb" });
  const keyListeners: Array<(event: any) => void> = [];
  const links = options.links ?? [];
  const scope = {
    querySelectorAll(selector: string) {
      return selector === "[data-doc-topic]" ? links : [];
    },
    querySelector(selector: string) {
      return selector === "[data-docs-empty]" ? empty : null;
    },
  };
  search.closest = () => scope;
  const document: any = {
    documentElement: { dataset: {} },
    querySelectorAll(selector: string) {
      if (selector === "[data-theme-toggle]") return toggles;
      if (selector === "[data-docs-search]") return [search];
      return [];
    },
    querySelector(selector: string) {
      if (selector === "[data-docs-search]") return search;
      return selector === 'meta[name="theme-color"]' ? themeMeta : null;
    },
    addEventListener(type: string, listener: (event: any) => void) {
      if (type === "keydown") keyListeners.push(listener);
    },
  };
  const replacements: string[] = [];
  const location = {
    pathname: options.pathname ?? "/",
    hash: options.hash ?? "",
    replace(path: string) {
      replacements.push(path);
    },
  };
  const localStorage = storageFixture(
    options.storedTheme,
    options.blockedStorage,
  );
  return {
    document,
    toggles,
    search,
    empty,
    themeMeta,
    keyListeners,
    links,
    location,
    localStorage,
    replacements,
  };
}

function runUI(current: ReturnType<typeof fixture>) {
  runInNewContext(uiSource, {
    document: current.document,
    location: current.location,
    localStorage: current.localStorage,
  });
}

test("blocked storage does not abort theme setup or toggles", () => {
  const current = fixture({ blockedStorage: true });

  assert.doesNotThrow(() => runUI(current));
  assert.equal(current.document.documentElement.dataset.theme, "light");
  assert.equal(current.themeMeta.getAttribute("content"), "#f7f8fb");
  assert.equal(current.toggles[0].textContent, "Dark mode");
  assert.equal(
    current.toggles[0].getAttribute("aria-label"),
    "Switch to dark mode",
  );

  assert.doesNotThrow(() => current.toggles[0].dispatch("click"));
  assert.equal(current.document.documentElement.dataset.theme, "dark");
  assert.equal(current.themeMeta.getAttribute("content"), "#11151e");
  assert.equal(current.toggles[1].textContent, "Light mode");
  assert.equal(
    current.toggles[1].getAttribute("aria-label"),
    "Switch to light mode",
  );
});

test("persisted theme is applied and every toggle persists the next theme", () => {
  const current = fixture({ storedTheme: "dark" });

  runUI(current);
  assert.equal(current.document.documentElement.dataset.theme, "dark");
  assert.equal(current.themeMeta.getAttribute("content"), "#11151e");
  for (const toggle of current.toggles) {
    assert.equal(toggle.textContent, "Light mode");
    assert.equal(toggle.getAttribute("aria-label"), "Switch to light mode");
  }

  current.toggles[1].dispatch("click");
  assert.equal(current.document.documentElement.dataset.theme, "light");
  assert.equal(current.themeMeta.getAttribute("content"), "#f7f8fb");
  for (const toggle of current.toggles) {
    assert.equal(toggle.textContent, "Dark mode");
    assert.equal(toggle.getAttribute("aria-label"), "Switch to dark mode");
  }
  assert.deepEqual(current.localStorage.writes, [["relay-theme", "light"]]);
});

test("known legacy docs hashes redirect to canonical topic paths", () => {
  const current = fixture({ pathname: "/docs/", hash: "#triage" });

  runUI(current);

  assert.deepEqual(current.replacements, ["/docs/triage"]);
});

test("unknown docs hashes do not redirect", () => {
  const current = fixture({ pathname: "/docs", hash: "#not-a-topic" });

  runUI(current);

  assert.deepEqual(current.replacements, []);
});

test("topic search hides matches, shows no-results, and restores links when cleared", () => {
  const links = [
    Object.assign(node({ "data-doc-topic": "" }), {
      textContent: "For agents",
      dataset: { search: "mailbox" },
    }),
    Object.assign(node({ "data-doc-topic": "" }), {
      textContent: "Runtime",
      dataset: { search: "execution" },
    }),
  ];
  const current = fixture({ pathname: "/docs", links });

  runUI(current);

  current.search.value = "runtime";
  current.search.dispatch("input");
  assert.equal(links[0].hidden, true);
  assert.equal(links[1].hidden, false);
  assert.equal(current.empty.hidden, true);

  current.search.value = "missing topic";
  current.search.dispatch("input");
  assert.equal(links[0].hidden, true);
  assert.equal(links[1].hidden, true);
  assert.equal(current.empty.hidden, false);

  current.search.value = "  ";
  current.search.dispatch("input");
  assert.equal(links[0].hidden, false);
  assert.equal(links[1].hidden, false);
  assert.equal(current.empty.hidden, true);
});

test("slash focuses the desktop docs search without hijacking form input", () => {
  const current = fixture({ pathname: "/docs" });
  let focused = false;
  current.search.focus = () => {
    focused = true;
  };

  runUI(current);
  const event = {
    key: "/",
    target: { tagName: "BODY" },
    prevented: false,
    preventDefault() {
      this.prevented = true;
    },
  };
  current.keyListeners.forEach((listener) => listener(event));
  assert.equal(focused, true);
  assert.equal(event.prevented, true);

  focused = false;
  const inputEvent = {
    key: "/",
    target: { tagName: "INPUT" },
    preventDefault() {
      focused = true;
    },
  };
  current.keyListeners.forEach((listener) => listener(inputEvent));
  assert.equal(focused, false);
});
