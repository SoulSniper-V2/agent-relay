function textToCopy(el) {
  const from = el.getAttribute("data-copy-from");
  if (from) {
    const node = document.querySelector(from);
    return (node?.innerText || node?.textContent || "").replace(/\n$/, "");
  }
  return el.getAttribute("data-copy") || "";
}

function flash(el, ok) {
  const original = el.getAttribute("data-label") || el.textContent;
  el.setAttribute("data-label", original);
  el.textContent = ok ? "Copied" : "Copy failed";
  el.classList.toggle("is-copied", ok);
  window.clearTimeout(el._copyTimer);
  el._copyTimer = window.setTimeout(() => {
    el.textContent = el.getAttribute("data-label") || "Copy";
    el.classList.remove("is-copied");
  }, 1400);
}

document.querySelectorAll("[data-copy], [data-copy-from]").forEach((el) => {
  el.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(textToCopy(el));
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
