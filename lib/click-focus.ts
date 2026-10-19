/**
 * Was this control focused by clicking it (rather than by keyboard)?
 *
 * Clicking a button leaves it focused, and Space then presses it again. A
 * play/pause shortcut has to tell that apart from someone who tabbed to the
 * button on purpose. `:focus-visible` can't: browsers already count the Space
 * keypress itself as keyboard use by the time a handler sees it.
 */
let lastClicked: Element | null = null;

if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", (e) => void (lastClicked = e.target instanceof Element ? e.target : null), true);
  // Tab (or any focus that isn't the thing just clicked) means the keyboard took over.
  window.addEventListener("keydown", (e) => e.key === "Tab" && void (lastClicked = null), true);
  window.addEventListener("focusin", (e) => {
    if (lastClicked && !(e.target instanceof Node && (e.target as Element).contains(lastClicked))) lastClicked = null;
  }, true);
}

export function isClickFocused(control: Element): boolean {
  return lastClicked !== null && control.contains(lastClicked);
}
