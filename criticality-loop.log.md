# Criticality Loop — main (2026-06-11)

base: full codebase (src/)  •  aggressiveness: aggressive (no defer)  •  test: `vitest run` + `tsc --noEmit`  •  converge: 2

baseline: 21 tests pass, typecheck clean

| # | verdict | findings (C/I/O) | commits | LOC Δ | tests | notes |
|---|---|---|---|---|---|---|
| 1 | BLOCK | 1/6/2 | 1 | +40* | ✅ | added useApiData+useFormState hooks; extracted RecurringModal & SettleFields to own files; filter-object in group+expenses pages; deduped settle forms; removed unused meId/void; narrowed openEdit catch; eslint-disable justifications. *net +40 LOC but duplication consolidated into 2 shared modules; group page 664→586. Rejected: moving parseAmountToCents into "use client" file (regression — pure tested logic stays in money.ts). Pre-existing react-hooks/refs lint (baseline 2 errs) +1 same-idiom instance. |
