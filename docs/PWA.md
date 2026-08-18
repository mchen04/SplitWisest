# iPhone PWA verification

SplitWisest supports Safari and an installed iPhone Home Screen app. The installed app is the release target for safe areas and keyboard layout.

## Layout contract

The app is a locked frame, not a scrolling document. `.app-frame` covers the
visible viewport, `.app-scroll` is the only region that scrolls, and the bottom
navigation is the frame's last row. Navigation is therefore in normal flow. It
was `position: fixed` before, which let iOS place it differently on routes that
scroll than on routes that fit in one screen.

- The viewport uses `viewport-fit=cover`.
- The document never scrolls. `document.scrollHeight` equals `window.innerHeight`.
- Bottom navigation includes the iPhone bottom inset and a small lift.
- Bottom navigation sits at the same y on every route.
- No route carries a page title row.
- Chat fills the visible viewport without page scrolling.
- The message list keeps its own vertical scroll.
- Search, the composer, Send, and navigation stay visible.
- Sending clears the draft without moving the page.

## Local checks

Run the permanent source checks first:

```bash
pnpm vitest run src/lib/__tests__/mobile-shell.test.ts
pnpm exec tsc --noEmit
pnpm lint
pnpm build
```

Use an iPhone WebKit profile for browser verification. Set `navigator.standalone` to `true` before navigation. Use a long conversation, then verify these values in the page:

- The user agent contains `iPhone`.
- The viewport meta tag contains `viewport-fit=cover`.
- Document and body heights equal `window.innerHeight`.
- `document.scrollHeight` equals `window.innerHeight` on every route.
- The bottom navigation's top edge is the same value on every route.
- `window.scrollY` stays at zero.
- The message list uses `overflow-y: auto` and has overflow content.
- The composer and Send bottom edges stay above the navigation top edge.
- A 34 px test inset produces 38 px bottom navigation padding.

Take a viewport screenshot before the browser closes. Keep screenshots outside the repository.

## Physical iPhone release gate

Use the deployed HTTPS URL.

1. Open the site in Safari.
2. Use **Share → Add to Home Screen**.
3. Close Safari.
4. Launch SplitWisest from the Home Screen icon.
5. Open a long direct or group conversation.
6. Scroll message history to both ends.
7. Focus the message field and show the keyboard.
8. Confirm the message field and Send stay visible, and the bottom navigation hides.
9. Send a message without scrolling the page.
10. Confirm bottom navigation stays above the Home indicator.

Test portrait and landscape. Repeat once with increased text size if the release changes mobile spacing.

## Update and cache contract

Every deploy ships a byte-different `/sw.js`: `pnpm build` runs
`scripts/generate-sw.ts`, which writes `public/sw.js` (gitignored) from
`src/sw/sw.template.js` with the deployment id embedded. The worker script, the
client bundle (`NEXT_PUBLIC_BUILD_ID`), `/api/version`, and the `x-build-id`
response header all derive from one id in `src/lib/deployment-id.ts`.

The browser's own service-worker update algorithm is the update mechanism:
`registration.update()` fetches `/sw.js` (served `Cache-Control: no-cache`),
new bytes install, `skipWaiting` + `clients.claim` fire `controllerchange`, and
the client reconciles. Detection runs on resume and connectivity signals —
`visibilitychange`, `pageshow` (including back/forward-cache restores),
`online`, history changes (soft navigations), and a 60 s interval as backstop.

One function decides what happens: `decideUpdateAction` in
`src/lib/update-policy.ts`. It reloads at most once per detected version,
never reloads a first install, never reloads a page already on the server's
build, stops instead of looping when a reload fails to land, and defers (never
discards) while a form field holds unsubmitted text.

Caching (`src/sw/sw.template.js`):

- Navigations are network-first with a 3.5 s timeout, falling back to the page
  cache, then the cached start_url shell, then `offline.html`. The first
  navigation after a deploy therefore carries the new build.
- `/_next/static/` files are cache-first (content-hashed, immutable). They are
  never purged by a version bump; stale-build files are swept only once every
  open window reports it runs the current build.
- RSC payloads (`?_rsc=`) are never cached, and a payload the server minted
  for a different build is refused so the router hard-navigates instead of
  mixing builds.
- `/api/**` is never touched by the worker.
- Both runtime caches are entry-bounded; cached entries carry build tags in
  the meta cache.

## Two-build verification

`node scripts/pwa-swap-harness.mjs all` (or `build` then `suite`) runs the
whole contract against two local production builds differing only in
GITHUB_SHA, swapped on one origin behind a local TLS proxy, driven as an
INSTALLED app: Playwright WebKit, iPhone profile, `navigator.standalone`,
display-mode standalone, launched at the manifest start_url, logged in.
Scenarios cover first install, cold start, cold start across a swap,
foreground-resume across a swap, in-session navigation across a swap,
three-cycle reload stability, offline cold start, and poisoned-cache repair.
Negative controls — `--mutate no-swap | break-manifest | no-sw | flap-sw |
flap-version-no-sw | break-precache | swallow-precache | bloat-storage` — each
force a named check red; runs are retained as `.pwa-harness/neg-*.log`. See
docs/pwa-cache-ledger.md for measured results.
