(() => {
  const root = document.documentElement;
  let theme = "light";
  try {
    theme = localStorage.getItem("relay-theme") === "dark" ? "dark" : "light";
  } catch {
    /* Storage is optional. */
  }
  function applyTheme(value) {
    root.dataset.theme = value;
    const themeColor = document.querySelector?.('meta[name="theme-color"]');
    if (themeColor) {
      themeColor.setAttribute(
        "content",
        value === "dark" ? "#11151e" : "#f7f8fb",
      );
    }
    document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
      button.textContent = value === "dark" ? "Light mode" : "Dark mode";
      button.setAttribute(
        "aria-label",
        `Switch to ${value === "dark" ? "light" : "dark"} mode`,
      );
    });
  }
  applyTheme(theme);
  document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      theme = root.dataset.theme === "dark" ? "light" : "dark";
      applyTheme(theme);
      try {
        localStorage.setItem("relay-theme", theme);
      } catch {
        /* Storage is optional. */
      }
    });
  });
  const legacyTopics = new Set([
    "agents",
    "path",
    "runtime",
    "first-exchange",
    "install",
    "login",
    "invite",
    "triage",
    "webhook",
    "grants",
    "security",
    "tools",
    "hub",
  ]);
  const topic = location.hash.slice(1);
  if (/^\/docs\/?$/.test(location.pathname) && legacyTopics.has(topic)) {
    location.replace(`/docs/${topic}`);
    return;
  }
  document.querySelectorAll("[data-docs-search]").forEach((input) => {
    const scope = input.closest("nav, aside, details") || document;
    const links = [...scope.querySelectorAll("[data-doc-topic]")];
    const empty = scope.querySelector("[data-docs-empty]");
    input.addEventListener("input", () => {
      const query = input.value.trim().toLowerCase();
      let visible = 0;
      links.forEach((link) => {
        const matches = `${link.textContent} ${link.dataset.search || ""}`
          .toLowerCase()
          .includes(query);
        link.hidden = !matches;
        if (matches) visible++;
      });
      if (empty) empty.hidden = visible > 0;
    });
  });
  const docsSearch = document.querySelector("[data-docs-search]");
  if (
    docsSearch &&
    typeof docsSearch.focus === "function" &&
    document.addEventListener
  ) {
    document.addEventListener("keydown", (event) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey)
        return;
      const target = event.target;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
        return;
      event.preventDefault();
      docsSearch.focus();
    });
  }
})();
