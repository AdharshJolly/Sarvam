/**
 * In-page jumps. The URL hash belongs to the router (`#/run/<id>/<tab>`), so a plain `href="#section"`
 * would replace the route and drop the run. Links call this instead and never touch the hash.
 */
export function jumpTo(id: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  el.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
  // Headings and sections are not focusable by default; make the jump land where keyboard users are.
  if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
  el.focus({ preventScroll: true });
}

/** Click handler for an anchor whose `href` is `#id`: keep the href for semantics, but jump in place. */
export function onAnchorClick(id: string) {
  return (e: { preventDefault: () => void }) => {
    e.preventDefault();
    jumpTo(id);
  };
}
