# QA Checklist

## Automated

- [x] `pnpm vitest run` — 24 tests covering money math and attachment filename/header safety
- [x] `pnpm tsc --noEmit`
- [x] `pnpm next build`
- [x] `pnpm verify:core` — API-level signup, groups, expenses, settlements, chat, nudges, recovery, auth boundaries
- [x] `pnpm verify:profiles` — private profile visibility, friend/shared/pending states, non-USD settlement history

## Adversarial review

Round 1 agents: money math, auth/security, DB integrity + realtime + chat, UX/frontend.

- Security: SQL injection — none (all tagged-template params); access control verified on every route; sessions/password handling clean.
- DB/realtime: atomicity of expense writes, recurring-expense races, chat pagination/dedup, sync cursor scope — found and fixed (see git history).
- Round 2: re-review found 1 blocking (CTE sibling-visibility breaking expense edits) + 2 important (recurrence anchor drift, over-eager deactivation) — all fixed and re-verified live against the API. Converged.
- 2026-06-11 criticality loop: structural audit cycles tightened profile privacy, direct settlements, settlement mutation authorization, relationship policy, activity visibility, account recovery atomicity, attachment header safety, QA harnesses, and group-page/balance data loading. Cycles 17 and 18 both returned APPROVE, satisfying the requested two-audit convergence gate.

## Browser verification (agent-browser)

| Viewport | Checked |
|---|---|
| Mobile portrait 375×667 | ✅ |
| Mobile landscape 740×360 | ✅ |
| Tablet 768×1024 | ✅ |
| Desktop 1280×720 | ✅ |
| Wide 2560×1200 | ✅ |

Flows exercised end-to-end (API + browser): signup ×2, login, create group, join via invite code, friend via personal code, equal/exact/percentage/shares/itemized expenses, multi-currency expense (EUR in USD group), edit expense, delete expense, balances zero-sum check, settlement suggestion math, record group settlement, direct friend settlement, group chat, DM chat, link rendering, realtime cross-user update (message appeared via polling without refresh), search/filter, CSV export, activity log, charts, custom category creation, attachment upload validation. No console errors.

## Production smoke test

- [x] Deployed to Vercel: https://splitwisest-kappa.vercel.app (2026-06-11)
- [x] Smoke flow against production + Neon: signup, login, create group, add expense, balances correct, group chat, CSV export, sync cursor — all passing. Test fixtures removed afterward.
- Note: the per-deployment `*-projects.vercel.app` URLs are behind Vercel deployment protection; the public app URL is the `splitwisest-kappa.vercel.app` alias.
