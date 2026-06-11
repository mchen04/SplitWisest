# QA Checklist

## Automated

- [x] `pnpm vitest run` — 21 money-math tests (split sums, remainder distribution, debt simplification, parsing)
- [x] `pnpm tsc --noEmit`
- [x] `pnpm next build`

## Adversarial review (2 convergence rounds)

Round 1 agents: money math, auth/security, DB integrity + realtime + chat, UX/frontend.

- Security: SQL injection — none (all tagged-template params); access control verified on every route; sessions/password handling clean.
- DB/realtime: atomicity of expense writes, recurring-expense races, chat pagination/dedup, sync cursor scope — found and fixed (see git history).
- Round 2: re-review after fixes until no blocking/important findings remain.

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

- [ ] Filled in after Vercel deployment (see README).
