// Imperative escape hatch for interactions a `data-tel` attribute can't
// reach — the 3D force graph's onNodeClick, canvas hit-testing, and anything
// else that isn't a real DOM element.
//
// Prefer the attribute. It survives refactors, needs no import, and doesn't
// pull a component across the server/client boundary. This exists so that the
// rare exception doesn't require re-plumbing the collector.
//
// Safe to call anywhere: a no-op during SSR, and a no-op if the visitor has
// opted out.

export function track(label: string, project?: string): void {
  if (typeof window === "undefined") return;
  window.__tel?.(label, project);
}
