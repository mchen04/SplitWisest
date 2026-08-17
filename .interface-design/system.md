# SplitWisest Interface Design System

Direction: **modern · clean · minimal** — the register of Linear / Stripe / Mercury /
Things. Flat near-neutral surfaces, one sans typeface with tabular figures for money,
a restrained green accent used as *signal* (not decoration), and generous, consistent
space. Personality comes from sharp typography and the green — not from texture or
ornament. Consistency beats novelty; these decisions compound — follow them.

> Pivoted from the earlier "warm paper + serif" direction after a four-judge design
> review: serif-everywhere + dotted grain + warm cream read editorial/cozy, not modern.
> We kept the bones (layout, green brand, logo, icon set, nav) and replaced the three
> foundational choices: **serif → sans, texture → flat, warm cream → cool neutral.**

## Foundation

- All color, type, spacing, elevation are tokens in `src/app/globals.css` (`@theme`).
  **Never hard-code hex in components** — the only exception is the deterministic
  Avatar hue.
- Light: canvas `paper #f5f6f7`, `card #ffffff`, `subtle #eef0f2` (fills/hover),
  `ink #181b1f`, `ink-soft #545b63`, `ink-faint #6c747d`, `line #e5e7ea`.
- Dark: `[data-theme="dark"]` flips the same token names. Cards **lift** above the
  canvas (`paper #131619` → `card #1c2024`) — depth is a surface-lightness step, not a
  shadow (shadows are invisible in dark UIs).
- Accent: green `#15795f` (light) / `#3fb488` (dark) — brand, primary buttons, active
  nav, links. `accent-soft` is the active-nav pill / subtle fill.
- **Money semantics are distinct from the brand:** `owed` green `#0e8a63` (you're
  owed / +), `owe` warm `#c2540f` (you owe / −), `danger` red `#d4342a` (destructive
  only). Never let "you owe" and "delete" share a color.
- Depth: 1px `border-line` is the primary separator; cards carry a near-invisible
  `shadow-card`. `shadow-pop` is reserved for modals / floating menus. No other shadows.
- **No texture.** The dotted grain is gone; surfaces are flat.

## Typography

- One typeface: **Instrument Sans** (`--font-body`) for *everything* — body, headings,
  labels, and money. `.font-display` maps to the same sans; hierarchy comes from
  **size + weight + color**, never from a second typeface.
- The serif (**Fraunces**) survives **only** in the wordmark via `.font-wordmark`.
  Do not reintroduce it anywhere else.
- Money & aligned figures use `.tnum` (tabular figures) so columns line up and digits
  don't reflow as values change.
- Ramp (overridden in `globals.css`): `xs` 12/16, `sm` 14/20, `base` 16/24,
  `lg` 18/24, `xl` 20/28, `2xl` 24/28, `3xl` 32/36, `4xl` 40/44.
- Roles: page title `text-2xl font-semibold tracking-tight`; card header
  `text-lg font-semibold`; row title `text-sm/base font-medium` (semibold when
  unread); metadata `text-xs text-ink-faint`; balance money `text-3xl/4xl font-semibold
  tnum`; form label `text-xs font-medium text-ink-soft` (**sentence case**, not
  uppercase — reserve uppercase only for true section dividers).

## Spacing & density

4px base; a calm-but-efficient scale: **4 · 8 · 12 · 16 · 24 · 32 · 48**.
Control metrics are tokens: `--control-h` 40px desktop / 44px mobile,
`--control-h-sm` 32px (compact desktop), `--row-h` 48px desktop / 52px mobile.
Common roles: card padding `p-4`/`px-4 py-3`, row padding `px-4 py-2.5`, section gap
`gap-4`/`space-y-4`, grid gaps `gap-4`. 8–12px between related items, 16–24px between
groups. **No "no-scroll" mandate** — let content size to content and pages scroll;
never stretch a card to viewport height around a few rows (that produces the dead-space
voids the review flagged).

## Radius scale

- `rounded-lg` (8px) — controls, icon buttons, nav rows, inline chips.
- `rounded-xl` (12px) — Cards, tab strips.
- `rounded-2xl` (16px) — Modal panels, auth card, chat bubbles.
- `rounded-full` — avatars, badges, pills.
Never introduce other radius values.

## Component patterns (`src/components/ui.tsx` is the source of truth)

- **Button**: `min-h-[var(--control-h)]`, `px-3.5`, `text-sm font-semibold`, variants
  primary / secondary / ghost / danger. **One primary per surface** — destructive uses
  `danger` and is never visually dominant. Secondary actions collapse into an
  `IconButton` group or a `Menu` (overflow `⋯`), never a row of 4–5 equal buttons.
- **IconButton / Menu**: icon-only actions carry an `aria-label` + tooltip and a
  ≥38px hit area. Use `Menu` for secondary/overflow actions.
- **Input / Select / Textarea**: 38px height; `bg-subtle`; focus = `border-accent` +
  3px `ring-accent-soft`. `Select` renders a custom chevron (no raw native arrow).
- **Card**: `border-line` + `shadow-card`, content-sized (never full-height filler).
  `CardHeader` `min-h-11`, sentence-case header, optional single action link.
- **Modal**: bottom-sheet on mobile (`rounded-t-2xl items-end`), centered on `sm+`;
  focus-trapped; Escape closes; primary action in a sticky footer.
- **Avatar**: deterministic `hsl(hash 52% 45%)`, initials, sizes sm 24 / md 32 / lg 40.
  The current user is colored like everyone else (never a black/empty circle).
- **Money**: `tnum`; when signed, pair color **and** an explicit `+ / −` and, in
  balances, the word ("you're owed" / "you owe") — never color alone.
- **Empty / loading / error**: `EmptyState`, `.skeleton` shimmer, `ErrorNote`.

## Interaction states

- Hover: `hover:bg-subtle` on rows, `hover:bg-accent-dark` on primary.
- Focus: every interactive element shows a visible ring —
  `focus-visible:ring-[3px] focus-visible:ring-accent-soft` (built into Button/inputs).
- Disabled: `opacity-50 pointer-events-none`. Busy buttons show a spinner and disable.

## Layout shell

- Desktop/tablet (`md+`): fixed 224px sidebar (wordmark, single Add-expense CTA, nav
  with unread badges, theme toggle, profile) + `max-w-5xl/6xl` main column. The sidebar
  owns the persistent "Add expense" — pages don't duplicate a second primary of equal
  weight.
- Home is a glance surface: **one** hero net-balance number + a contextual next step,
  then groups / friends / a short activity peek.
- Mobile: sticky top bar + bottom nav with safe-area padding; full-page flows; primary
  actions thumb-reachable. Headers never expose raw invite hashes or clip the title.
- Master-detail (Messages): left list pane (`md:w-80`) + detail in one Card; desktop
  auto-selects the most recent conversation; mobile shows list, then full-screen thread.
- Switchers, not back-outs: group title is a switcher dropdown.

## Content & copy rules

- **Never show raw invite hashes.** Invites are a "Share invite" action (link + QR +
  short human code). The 32-char token lives in the URL, never in the UI.
- Omit empty filler: no "Uncategorized" segment when there's no category; no repeated
  "USD" when everything is one currency.
- One verb per concept: **"Settle up"** (not Settle/Payments mixed); nav "Chat",
  scoped group tab "Group chat".

## Non-goals

No texture, no serif in the UI, no decorative hero sections, no marketing styling, no
row of competing CTAs, no novel one-off controls. Reuse the patterns above or extend
this file deliberately when a new pattern is genuinely needed.

## Enforcement

Run `pnpm verify:ui-tokens` before each UI commit. Components cannot use arbitrary
pixel classes, numeric text or radius classes, or hard-coded hex colors. Structural
viewport, percentage, `calc()`, and CSS-variable values remain valid.
