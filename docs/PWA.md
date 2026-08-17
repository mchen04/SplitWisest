# iPhone PWA verification

SplitWisest supports Safari and an installed iPhone Home Screen app. The installed app is the release target for safe areas and keyboard layout.

## Layout contract

- The viewport uses `viewport-fit=cover`.
- Bottom navigation includes the iPhone bottom inset and a small lift.
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
