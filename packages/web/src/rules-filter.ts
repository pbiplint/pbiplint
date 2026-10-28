// The rules index's Show filter (v3 spec, section 10.2). The page lists every rule without it;
// this reveals the boxes and hides the rows of a family that is unchecked, and a category heading
// with its list once every row under it is hidden. It stores nothing: the state is the address's
// `layer` query, a comma-separated list of families, rewritten with replaceState as the boxes
// change, so a copied link opens what the reader sees and Back is not filled with filter states.
import { layerShown } from "./layers.js";

const form = document.querySelector<HTMLFieldSetElement>("#rules-filter");
if (form) {
  const boxes = [...form.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
  const present = boxes.map((b) => b.value);
  const rows = [...document.querySelectorAll<HTMLElement>(".rule-list > li[data-layer]")];
  const lists = [...document.querySelectorAll<HTMLElement>(".rule-list")];
  const count = form.querySelector<HTMLElement>(".rules-shown");

  // A missing, empty, or wholly unknown value checks every box; an unknown name among known ones
  // is ignored.
  const named = (new URLSearchParams(location.search).get("layer") ?? "")
    .split(",")
    .filter((l) => present.includes(l));
  for (const b of boxes) b.checked = named.length === 0 || named.includes(b.value);

  const apply = (): void => {
    const checked = new Set(boxes.filter((b) => b.checked).map((b) => b.value));
    for (const row of rows) row.hidden = !layerShown(row.dataset.layer ?? "", checked, present);
    for (const list of lists) {
      const empty = [...list.children].every((li) => (li as HTMLElement).hidden);
      list.hidden = empty;
      const heading = list.previousElementSibling;
      if (heading instanceof HTMLHeadingElement) heading.hidden = empty;
    }
    if (count)
      count.textContent = `Showing ${rows.filter((r) => !r.hidden).length} of ${rows.length} rules`;
    // Every other query parameter is kept; the plain /rules/ stays the default.
    const params = new URLSearchParams(location.search);
    params.delete("layer");
    const rest = params.toString();
    const layer =
      checked.size === boxes.length
        ? ""
        : `layer=${boxes
            .filter((b) => b.checked)
            .map((b) => b.value)
            .join(",")}`;
    const url = new URL(location.href);
    url.search = [rest, layer].filter(Boolean).join("&");
    if (url.href !== location.href) history.replaceState(history.state, "", url);
  };

  // The count is written before the boxes appear, so the live region does not announce the
  // page's opening state.
  apply();
  form.hidden = false;
  form.addEventListener("change", apply);
}
