const COPY_STATUS_ID = "copy-status";
const HUB_HEALTH_TIMEOUT_MS = 5000;

function textToCopy(el) {
  const from = el.getAttribute("data-copy-from");
  if (from) {
    let node;
    try {
      node = document.querySelector(from);
    } catch {
      return "";
    }
    return (node?.innerText || node?.textContent || "").replace(/\n$/, "");
  }
  return el.getAttribute("data-copy") || "";
}

function copyStatusRegion() {
  const existing = document.getElementById(COPY_STATUS_ID);
  if (existing) return existing;
  if (!document.body) return null;

  const region = document.createElement("div");
  region.id = COPY_STATUS_ID;
  region.setAttribute("role", "status");
  region.setAttribute("aria-live", "polite");
  region.setAttribute("aria-atomic", "true");
  if (region.style) {
    region.style.position = "fixed";
    region.style.width = "1px";
    region.style.height = "1px";
    region.style.padding = "0";
    region.style.margin = "-1px";
    region.style.overflow = "hidden";
    region.style.clip = "rect(0 0 0 0)";
    region.style.whiteSpace = "nowrap";
    region.style.border = "0";
  }
  document.body.appendChild(region);
  return region;
}

function announceCopy(message) {
  const region = copyStatusRegion();
  if (region) region.textContent = message;
}

function flash(el, ok, announcement, label) {
  const original = el.getAttribute("data-label") || el.innerHTML;
  el.setAttribute("data-label", original);
  el.textContent = label || (ok ? "Copied" : "Copy failed");
  el.classList.toggle("is-copied", ok);
  if (typeof window.clearTimeout === "function") window.clearTimeout(el._copyTimer);
  const restore = () => {
    el.innerHTML = el.getAttribute("data-label") || "Copy";
    el.classList.remove("is-copied");
  };
  el._copyTimer =
    typeof window.setTimeout === "function" ? window.setTimeout(restore, 1400) : null;
  announceCopy(announcement || (ok ? "Copied to clipboard." : "Copy failed."));
}

function removeNode(node) {
  if (!node) return;
  try {
    if (typeof node.remove === "function") {
      node.remove();
      return;
    }
    if (node.parentNode && typeof node.parentNode.removeChild === "function") {
      node.parentNode.removeChild(node);
    }
  } catch {
    if (node.parentNode && typeof node.parentNode.removeChild === "function") {
      try {
        node.parentNode.removeChild(node);
      } catch {
        // Cleanup is best effort on unusual DOM implementations.
      }
    }
  }
}

function restoreFocus(el) {
  if (!el || typeof el.focus !== "function") return;
  try {
    el.focus();
  } catch {
    // The original control may have been removed while copying.
  }
}

function fallbackCopy(text) {
  const focused = document.activeElement;
  const ta = document.createElement("textarea");
  try {
    ta.value = text;
    ta.setAttribute("readonly", "");
    if (ta.style) {
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
    }
    document.body.appendChild(ta);
    ta.select();
    if (typeof document.execCommand !== "function" || !document.execCommand("copy")) {
      throw new Error("copy");
    }
  } finally {
    try {
      removeNode(ta);
    } finally {
      restoreFocus(focused);
    }
  }
}

function copyText(text) {
  if (typeof text !== "string" || !text.trim()) throw new Error("empty copy");

  if (
    typeof navigator !== "undefined" &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === "function"
  ) {
    try {
      return Promise.resolve(navigator.clipboard.writeText(text)).catch(() => fallbackCopy(text));
    } catch {
      return fallbackCopy(text);
    }
  }
  return fallbackCopy(text);
}

document.querySelectorAll("[data-copy], [data-copy-from]").forEach((el) => {
  el.addEventListener("click", async () => {
    try {
      const text = textToCopy(el);
      if (!text.trim()) {
        flash(el, false, "Nothing to copy.", "Nothing to copy");
        return;
      }
      await copyText(text);
      flash(el, true);
    } catch {
      flash(el, false, "Copy failed. Try again.");
    }
  });
});

const nav = [...document.querySelectorAll(".side a[href^='#']")];
const sections = nav
  .map((a) => document.querySelector(a.getAttribute("href")))
  .filter(Boolean);

if (nav.length && sections.length && "IntersectionObserver" in window) {
  const io = new IntersectionObserver(
    (entries) => {
      const hit = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!hit) return;
      nav.forEach((a) =>
        a.classList.toggle("on", a.getAttribute("href") === `#${hit.target.id}`),
      );
    },
    { rootMargin: "-18% 0px -70% 0px", threshold: [0, 0.2, 1] },
  );
  sections.forEach((s) => io.observe(s));
}

const RELAY_HUB = "https://35.211.23.64.sslip.io";
const hubStatus = document.getElementById("hub-status");

function fetchHubHealth() {
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const options = controller ? { signal: controller.signal } : undefined;
  let timer;
  const schedule =
    typeof window.setTimeout === "function" ? window.setTimeout.bind(window) : setTimeout;
  const request = Promise.resolve()
    .then(() => fetch(`${RELAY_HUB}/health`, options))
    .then((response) => {
      const status = Number(response?.status);
      const hasStatus = Number.isFinite(status);
      const accepted =
        response &&
        (typeof response.ok === "boolean" ? response.ok : hasStatus && status >= 200 && status < 300);
      if (!accepted || (hasStatus && (status < 200 || status >= 300))) {
        throw new Error("health request failed");
      }
      if (typeof response.json !== "function") throw new Error("health response invalid");
      return response.json();
    });
  const timeout = new Promise((_, reject) => {
    timer = schedule(() => {
      if (controller) {
        try {
          controller.abort();
        } catch {
          // Abort is an optimization; the timeout still bounds the request.
        }
      }
      reject(new Error("health request timed out"));
    }, HUB_HEALTH_TIMEOUT_MS);
  });
  return Promise.race([request, timeout]).finally(() => {
    if (timer !== undefined && typeof window.clearTimeout === "function") {
      window.clearTimeout(timer);
    }
  });
}

function hubHealthMessage(health) {
  if (!health || typeof health !== "object") return "Hosted signup status is unavailable.";
  if (health.sandbox === true) {
    return "Hosted signup is limited to the Resend account owner. Use a verified sending domain or SMTP for a second person.";
  }
  if (health.email === "file") {
    return "Hosted signup uses a local mailbox; email delivery is unavailable.";
  }
  const emailConfigured = health.email === "resend" || health.email === "smtp";
  if (
    health.ok !== true ||
    health.login_ok !== true ||
    health.two_person !== true ||
    !emailConfigured
  ) {
    return "Hosted signup is not ready for a second person. Configure a verified sending domain or SMTP on the hub.";
  }
  // Health reports configuration, not whether a recipient's inbox accepted a message.
  return "";
}

function showHubStatus(message, retry) {
  if (!hubStatus) return;
  hubStatus.hidden = false;
  hubStatus.textContent = message;
  if (!retry) return;

  hubStatus.textContent = `${message} `;
  const retryButton = document.createElement("button");
  retryButton.type = "button";
  retryButton.className = "copy";
  retryButton.textContent = "Retry";
  retryButton.addEventListener("click", () => loadHubStatus(true));
  hubStatus.appendChild(retryButton);
}

function loadHubStatus(showPending) {
  if (!hubStatus) return;
  if (showPending) showHubStatus("Checking hosted signup…", false);
  fetchHubHealth()
    .then((health) => {
      const message = hubHealthMessage(health);
      if (message) {
        showHubStatus(message, false);
      } else {
        hubStatus.hidden = true;
        hubStatus.textContent = "";
      }
    })
    .catch(() => showHubStatus("Could not reach hosted signup status.", true));
}

if (hubStatus) {
  hubStatus.setAttribute("aria-live", "polite");
  hubStatus.setAttribute("aria-atomic", "true");
  loadHubStatus(false);
}
