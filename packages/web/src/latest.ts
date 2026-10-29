// The /latest/ page, on pbiplint.com only. A self-hosted copy's footer links here with its own
// version in the fragment (#0.2.5), and this compares it with the version the page was built at.
// The fragment never leaves the tab: a browser sends it in no request and no referrer, so
// pbiplint.com never learns which version a firm runs. The fragment is untrusted text, so it is
// read against a strict pattern and written back only as textContent. Nothing is fetched or stored.
// The address is permanent and keeps accepting a bare version for as long as old copies link to it.

const VERSION = /^#?(\d+)\.(\d+)\.(\d+)$/;

const parse = (text: string): number[] | undefined => VERSION.exec(text)?.slice(1).map(Number);

/** What the page says to a copy whose footer link carried `fragment`, when the latest is `latest`. */
export function answer(fragment: string, latest: string): string {
  const copy = parse(fragment);
  const newest = parse(latest);
  if (!copy || !newest)
    return `The latest pbiplint is ${latest}. Compare it with the version in your copy's footer.`;
  const version = copy.join(".");
  const order = copy.map((n, i) => n - newest[i]!).find((d) => d !== 0) ?? 0;
  if (order < 0)
    return `Your copy is ${version}; the latest is ${latest}. Ask your IT team to update.`;
  if (order > 0) return `You're up to date: your copy is ${version}.`;
  return `You're up to date: your copy is ${version}, the latest pbiplint.`;
}

const target = document.querySelector<HTMLElement>("#latest-answer");
if (target) {
  const latest = target.dataset.version ?? "";
  const show = (): void => {
    target.textContent = answer(location.hash, latest);
  };
  show();
  window.addEventListener("hashchange", show);
}
