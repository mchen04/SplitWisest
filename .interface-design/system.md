# SplitWisest Interface Design System

Direction: **Warmth & Trust** — a calm, finance-adjacent social utility. Warm paper
neutrals + deep green accent, serif display type for headings/money, quiet metadata.
Consistency beats perfection; these decisions compound — follow them, don't rediscover.

## Foundation

- Light: paper `#faf9f5`, card `#ffffff`, ink `#21302a` (greenish-black), line `#e6e3da`.
- Dark: paper `#131714`, card `#1c211d`; same token names flip via `[data-theme="dark"]`.
- Accent: green `#16735a` (light) / `#5cb494` (dark). Money semantics: `owed` = green
  (positive, you are owed), `owe` = warm orange `#b4540a` (negative), `danger` = red.
- All colors are Tailwind theme tokens in `src/app/globals.css` (`--color-*`). Never
  hard-code hex in components; the only exception is the deterministic Avatar hue.
- Depth: 1px `border-line` + `shadow-card` on cards; `shadow-pop` reserved for modals
  and floating menus. No other shadows.
- Texture: `.paper-grain` dotted background on the app shell only.

## Typography

- Display: Fraunces (`font-display`) — page titles, card headers, money amounts.
- Body: Instrument Sans — everything else.
- Dense type ramp — the `text-*` utilities are overridden in `globals.css`:
  `xs` 11px, `sm` 13px (body), `base` 14px, `lg` 16px, `xl` 18px, `2xl` 22px, `3xl` 26px.
- Roles: page title `text-xl/2xl font-bold`; card header `text-base font-semibold`;
  row title `text-sm font-medium` (bold when unread); metadata `text-xs text-ink-faint`;
  KPI money `text-xl font-display`; form label
  `text-[11.5px] font-semibold uppercase tracking-wider text-ink-soft`.
- Numbers in money contexts use `.tnum` (tabular-nums).

## Spacing & density

4px base, dense-product scale. Control metrics live in `globals.css` as tokens:
`--control-h` 34px (all buttons/inputs), `--control-h-sm` 28px (compact/inline),
`--row-h` 44px (two-line list rows, `min-h-[var(--row-h)]`).
Common roles: row padding `px-3.5 py-1.5`, card section padding `px-3.5`,
modal padding `px-4 py-3`, page section gap `mb-2.5/3`, grid gaps `gap-2.5`,
list rows divided by `divide-line` (no gaps between rows inside a card).
Rule of thumb: 4–8px between related items, 8–12px between groups; never reintroduce
the old 16–24px consumer paddings.

## Radius scale

- `rounded-[10px]` — interactive controls: Button, Input, Select, Textarea.
- `rounded-lg` (8px) — small/icon buttons, nav rows, inline chips.
- `rounded-xl` (12px) — Cards and tab strips.
- `rounded-2xl` (16px) — Modal panels (and chat bubbles).
- `rounded-full` — avatars, badges, pills.
Never introduce other radius values. (One sanctioned exception: the auth hero card
uses `rounded-[18px]` per the design handoff.)

## Component patterns (`src/components/ui.tsx` is the source of truth)

- **Button**: `min-h-[var(--control-h)]` (34px), `px-3 py-1.5`, `text-sm font-semibold`,
  variants primary/secondary/ghost/danger. Destructive actions use the `danger` variant
  and are never visually dominant.
- **Input/Select/Textarea**: same 34px control height; focus = `border-accent` +
  3px `ring-accent-soft`. Compact variant (search-in-pane) overrides with
  `!min-h-9 !py-1.5` and a leading `Search` icon at `left-2.5`.
- **Card**: `border-line` + `shadow-card`, header `CardHeader` with `min-h-10`.
- **Modal**: bottom-sheet on mobile (`rounded-t-2xl items-end`), centered on `sm+`;
  focus-trapped; Escape closes.
- **Avatar**: deterministic `hsl(hash 34% 42%)`, initials, sizes sm 24 / md 32 / lg 40.
- **Unread**: `bg-accent` dot (or count badge in nav); bold row title. **Selected**:
  `bg-accent-soft` (+ `text-accent-dark` for nav). **Pinned**: small `Pin` glyph.
- **Empty/loading/error**: `EmptyState`, `.skeleton` shimmer blocks, `ErrorNote`.

## Interaction states

- Hover: `hover:bg-paper` on rows, `hover:bg-accent-dark` on primary.
- Focus: every interactive element must show a visible ring —
  `focus-visible:ring-[3px] focus-visible:ring-accent-soft` (built into Button/inputs).
- Disabled: `opacity-50 pointer-events-none`. Busy buttons show a spinner and disable.

## Layout shell

- Desktop/tablet (`md+`): fixed 208px sidebar (logo, Add expense CTA, nav with unread
  badges, theme toggle, profile) + `max-w-6xl` main column; main is `h-dvh` with panes
  scrolling internally (no-scroll bias: summary screens must fit 1366×768 with zero
  document scroll — verify with a screenshot before shipping layout changes).
- Home is a three-column glance surface (Groups / Friends / Activity) over a KPI strip;
  friend balances are visible without navigating to Balances.
- Mobile: sticky top bar + 6-item bottom nav with safe-area padding; full-page flows.
- Master-detail surfaces (Messages) use a left list pane (`md:w-80`) + detail pane
  inside one Card; mobile shows list first, conversation full-screen with back arrow.
- Switchers, not back-outs: group page title is a group-switcher dropdown; chat rows
  switch in place.

## Non-goals

No decorative hero sections, no marketing styling, no novel one-off controls — reuse
the patterns above or extend this file deliberately when a new pattern is needed.
