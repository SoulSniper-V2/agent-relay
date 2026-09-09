function textToCopy(el) {
  const from = el.getAttribute("data-copy-from");
  if (from) {
    const node = document.querySelector(from);
    return (node?.innerText || node?.textContent || "").replace(/\n$/, "");
  }
  return el.getAttribute("data-copy") || "";
}

function flash(el, ok) {
  const original = el.getAttribute("data-label") || el.innerHTML;
  el.setAttribute("data-label", original);
  el.textContent = ok ? "Copied" : "Copy failed";
  el.classList.toggle("is-copied", ok);
  window.clearTimeout(el._copyTimer);
  el._copyTimer = window.setTimeout(() => {
    el.innerHTML = el.getAttribute("data-label") || "Copy";
    el.classList.remove("is-copied");
  }, 1400);
}

function copyText(text) {
  const clip =
    navigator.clipboard && navigator.clipboard.writeText
      ? navigator.clipboard.writeText(text)
      : Promise.reject(new Error("no clipboard"));
  return clip.catch(() => {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    if (!ok) throw new Error("copy");
  });
}

document.querySelectorAll("[data-copy], [data-copy-from]").forEach((el) => {
  el.addEventListener("click", async () => {
    try {
      await copyText(textToCopy(el));
      flash(el, true);
    } catch {
      flash(el, false);
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

const hubStatus = document.getElementById("hub-status");
if (hubStatus) {
  fetch("https://agent-relay.fly.dev/health")
    .then((r) => r.json())
    .then((h) => {
      if (h.email !== "resend") {
        hubStatus.hidden = false;
        hubStatus.textContent =
          h.email === "file"
            ? "This page is talking to a hub that writes login codes to disk, not email."
            : "Hosted login is not sending email yet. Install works. OTP does not, until Resend is set on the hub.";
      }
    })
    .catch(() => {
      hubStatus.hidden = false;
      hubStatus.textContent = "Could not reach the hosted hub.";
    });
}
