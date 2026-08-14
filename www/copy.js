document.querySelectorAll("button.copy").forEach((b) => {
  b.addEventListener("click", async () => {
    const t = b.getAttribute("data-copy") || "";
    try {
      await navigator.clipboard.writeText(t);
      b.textContent = "copied";
      setTimeout(() => { b.textContent = "copy"; }, 1200);
    } catch {
      b.textContent = "fail";
    }
  });
});
