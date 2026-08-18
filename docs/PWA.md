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

## Update check

An installed app must pick up a new deploy on its own. `sw.js` is byte-identical
between deploys, so `registration.update()` never installs a new worker, and the
worker's HTML diff needs a navigation that an app restored from memory never
makes. The client therefore polls `/api/version` and compares it with the
`NEXT_PUBLIC_BUILD_ID` its own bundle was compiled from.

To verify against two real builds:

1. `pnpm build && PORT=3100 pnpm start`, then open the app and let it settle.
2. `GITHUB_SHA=<a-different-value> pnpm build`, then restart on the same port.
3. Bring the app to the foreground, or wait for the five-minute poll.
4. The page reloads once. `performance.getEntriesByType('navigation')[0].type`
   reads `reload`, and the served HTML carries the new build id.
5. Bring it to the foreground again. It must not reload a second time.
