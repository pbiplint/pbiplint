// The header's Menu button, below 680 pixels, is a details element, which opens and closes with
// no script. This adds what details lacks, and makes no request and stores nothing: Escape closes
// the menu, a tap outside it closes it, and so do following a link in it, focus moving out of it
// (so the open list never covers what has focus), and the window widening past the breakpoint.
for (const menu of document.querySelectorAll<HTMLDetailsElement>("details.nav-menu")) {
  const close = (): void => {
    menu.open = false;
  };
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !menu.open) return;
    // Focus goes back to the button only when it was in the menu, never from elsewhere on the page.
    const inside = menu.contains(document.activeElement);
    close();
    if (inside) menu.querySelector("summary")?.focus();
  });
  // pointerdown rather than click: Safari on an iPhone sends no click for a tap on plain text.
  document.addEventListener("pointerdown", (event) => {
    if (menu.open && event.target instanceof Node && !menu.contains(event.target)) close();
  });
  menu.addEventListener("focusout", (event) => {
    if (!(event.relatedTarget instanceof Node && menu.contains(event.relatedTarget))) close();
  });
  menu.querySelector(".nav-panel")?.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest("a")) close();
  });
  matchMedia("(max-width: 679px)").addEventListener("change", (event) => {
    if (!event.matches) close();
  });
}
