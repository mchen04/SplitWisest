# Criticality Loop — main (2026-06-11)

base: full codebase (src/)  •  aggressiveness: aggressive (no defer)  •  test: `vitest run` + `tsc --noEmit`  •  converge: 2

baseline: 21 tests pass, typecheck clean

| # | verdict | findings (C/I/O) | commits | LOC Δ | tests | notes |
|---|---|---|---|---|---|---|
| 1 | BLOCK | 1/6/2 | 1 | +40* | ✅ | added useApiData+useFormState hooks; extracted RecurringModal & SettleFields to own files; filter-object in group+expenses pages; deduped settle forms; removed unused meId/void; narrowed openEdit catch; eslint-disable justifications. *net +40 LOC but duplication consolidated into 2 shared modules; group page 664→586. Rejected: moving parseAmountToCents into "use client" file (regression — pure tested logic stays in money.ts). Pre-existing react-hooks/refs lint (baseline 2 errs) +1 same-idiom instance. |
| 3 | APPROVE | 0/0/0 | 0 | 0 | ✅ | first clean — shared hooks confirmed genuinely reused, no over-abstraction, api routes compact, no dup. |
| 2 | BLOCK | 3/4/1 | 2 | -10 | ✅ | 2a: deduped settlement routes (shared settlementFields schema + settlementSummary helper, killed nameOf dup), unified fmtMoney across client/server (money.ts canonical), useFilters hook (group+expenses), surfaced recurring-delete errors. 2b: extracted SpendCharts + ParticipantSplit/ItemizedSplit (expense-form 524→404, group page 586→554). Rejected: memberName useMemo (cheap find, no real win); 500+line group page further tab-split (would be prop-drill regression — 554<1k hard limit). Lint errors 8→8 (no regression). |
