/**
 * The shape of a guided tour, deliberately free of React and of driver.js.
 *
 * A tour is data: a list of things on the page worth pointing at, in the order
 * somebody meeting the page for the first time would want them. Keeping that
 * list in a plain type means a project author writes copy, not overlay code,
 * and means swapping the renderer underneath never touches a call site.
 *
 * `target` is a CSS selector rather than a selector-or-resolver union. Every
 * target on the site so far is expressible as a selector, and the union cost a
 * cast at the boundary to say the same thing.
 */

export type TourStep = {
  /** CSS selector for the element to spotlight. First match wins. */
  target: string;

  title: string;
  body: string;

  /** Which side of the target the popover prefers. It flips if there is no room. */
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";

  /**
   * Runs immediately before this step is shown — switch a tab, open a panel,
   * scroll something into range.
   *
   * This is NOT driver.js's `onHighlightStarted`, and the difference matters:
   * driver waits for a step's element to appear BEFORE it fires that hook, so a
   * hook that reveals the target runs after the wait it was supposed to
   * satisfy. `before` is invoked by the navigation handler instead, so the
   * reveal always precedes the wait.
   */
  before?: () => void;

  /**
   * Milliseconds to wait for a target that `before` is still bringing into
   * existence. Backed by a MutationObserver, so this is a ceiling, not a delay.
   */
  waitFor?: number;

  /**
   * Spotlight an arbitrary rectangle instead of the target's own box.
   *
   * For pointing at a *group* of elements that share no wrapper — the platform
   * columns inside a board row are a bare fragment of sibling grid cells, so
   * there is no single element whose box is "the rankings". Return the union of
   * their rects and the step highlights exactly that, no markup change needed.
   *
   * `target` is still required, and is used if this returns null.
   */
  rect?: () => DOMRect | null;

  /** Overrides the final step's button label. */
  doneLabel?: string;

  /** Runs when the final step's button is clicked — the tour's payoff action. */
  onDone?: () => void;
};
