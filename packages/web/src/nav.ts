// The header's Menu button, below 680 pixels, is a details element, which opens and closes with
// no script. This adds what details lacks: Escape closes the menu and gives the button focus back,
// and a tap outside it closes it. Nothing here makes a request or stores anything.
for (const menu of document.querySelectorAll<HTMLDetailsElement>("details.nav-menu")) {
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !menu.open) return;
    menu.open = false;
    menu.querySelector("summary")?.focus();
  });
  document.addEventListener("click", (event) => {
    if (menu.open && event.target instanceof Node && !menu.contains(event.target))
      menu.open = false;
  });
}
