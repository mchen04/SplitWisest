# Criticality Loop — main (2026-06-11)

base: full codebase (src/)  •  aggressiveness: aggressive (no defer)  •  test: `vitest run` + `tsc --noEmit`  •  converge: 2

baseline: 21 tests pass, typecheck clean

| # | verdict | findings (C/I/O) | commits | LOC Δ | tests | notes |
|---|---|---|---|---|---|---|

**Summary** — Exit: CONVERGED (2 consecutive APPROVE, cycles 5–6). 6 cycles, 4 fix commits. Net src/ delta vs start: +134 LOC (635 ins / 501 del across 27 files) — net-positive because duplication was lifted into 7 new focused shared modules (currencies, messages, settlements libs; settle-fields, recurring-modal, spend-charts, expense-splits components) totalling 395 LOC, while call sites shrank. Structural wins: group page 664→554, expense-form 524→404; 8 new canonical helpers/hooks (useApiData, useFormState, useFilters, fmtMoney unified, settlementFields/Summary, loadGroupMemberIds, mapMessages, SettleFields). Tests green throughout (21/21), tsc clean, build passes. Lint errors flat at baseline (8, all pre-existing react-hooks/refs + reset-on-open idioms; no regression).

| 1 | BLOCK | 1/6/2 | 1 | +40* | ✅ | added useApiData+useFormState hooks; extracted RecurringModal & SettleFields to own files; filter-object in group+expenses pages; deduped settle forms; removed unused meId/void; narrowed openEdit catch; eslint-disable justifications. *net +40 LOC but duplication consolidated into 2 shared modules; group page 664→586. Rejected: moving parseAmountToCents into "use client" file (regression — pure tested logic stays in money.ts). Pre-existing react-hooks/refs lint (baseline 2 errs) +1 same-idiom instance. |
| 6 | APPROVE | 0/0/0 | 0 | 0 | ✅ | converged (2 consecutive APPROVE) — thorough route-by-route + lib sweep, no dup/dead-code/over-abstraction found. |
| 5 | APPROVE | 0/0/0 | 0 | 0 | ✅ | clean — new modules confirmed genuinely reused, no over-abstraction, casts justified, no dead exports, error handling centralized. |
| 4 | BLOCK | 0/3/0 | 1 | -22 | ✅ | fresh context caught 3 dups cycle 3 missed: single-source CURRENCIES (lib/currencies.ts, fx+client re-export), loadGroupMemberIds helper (dedup member-validation in expenses.ts + recurring route), mapMessages helper (dedup chat DTO mapping in group+dm routes). Scoped: message QUERY not extracted — neon http tag can't compose SQL WHERE fragments safely; only the identical post-processing was shared. |
| 3 | APPROVE | 0/0/0 | 0 | 0 | ✅ | first clean — shared hooks confirmed genuinely reused, no over-abstraction, api routes compact, no dup. |
| 2 | BLOCK | 3/4/1 | 2 | -10 | ✅ | 2a: deduped settlement routes (shared settlementFields schema + settlementSummary helper, killed nameOf dup), unified fmtMoney across client/server (money.ts canonical), useFilters hook (group+expenses), surfaced recurring-delete errors. 2b: extracted SpendCharts + ParticipantSplit/ItemizedSplit (expense-form 524→404, group page 586→554). Rejected: memberName useMemo (cheap find, no real win); 500+line group page further tab-split (would be prop-drill regression — 554<1k hard limit). Lint errors 8→8 (no regression). |
