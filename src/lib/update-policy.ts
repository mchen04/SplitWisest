// The ONE place that decides whether a detected update reloads the page.
// Every detection signal (controllerchange, resume, poll) funnels through this
// so the paths cannot race each other into extra reloads.

export type UpdateAction = "reload" | "defer" | "none";

export function decideUpdateAction(opts: {
  /** Build id compiled into this page's bundle. */
  pageBuild: string | undefined;
  /** Build id of the controlling worker (null: none, or no reply). */
  controllerBuild: string | null;
  /** Build id from /api/version (null: not consulted, or unreachable). */
  serverBuild: string | null;
  /** Build id a previous reload already targeted (loop stop). */
  alreadyReloadedFor: string | null;
  /** True when a form field holds text the user has not submitted. */
  hasUnsavedInput: boolean;
}): UpdateAction {
  const { pageBuild, controllerBuild, serverBuild, alreadyReloadedFor, hasUnsavedInput } = opts;
  const target = controllerBuild ?? serverBuild;
  if (!pageBuild || !target) return "none";
  if (target === pageBuild) return "none";
  // The page can be AHEAD of its worker: a network-first cold start lands the
  // new build's document before the worker script updates. Reloading then
  // would be a wasted round trip — the worker converges by itself.
  if (serverBuild && serverBuild === pageBuild) return "none";
  // A reload that failed to land this build stops rather than looping.
  if (alreadyReloadedFor === target) return "none";
  // An update never discards a half-written expense or chat message.
  if (hasUnsavedInput) return "defer";
  return "reload";
}
