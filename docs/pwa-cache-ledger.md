# PWA update/cache/performance ledger

The `.pwa-harness/` evidence artifacts cited below (run logs, Lighthouse reports, build slots)
were cleared after the fresh-eyes review approved. Reproduce any of them with
`node scripts/pwa-swap-harness.mjs all` (scenarios), `... migrate-test` (migration),
`... suite --mutate <name>` (negative controls), and `node scripts/perf-measure.mjs` (perf).

Working record for the update-cache-performance goal (2026-08-18).
One row per finding. Verdicts: open / fixed+verified / refuted / blocked.

PROGRESS 25/25

| id | area | hypothesis / requirement | verdict | evidence | date |
|----|------|--------------------------|---------|----------|------|
| H1 | worker | deploymentChanged() writes new version before fallible work; a throw disarms the detector | fixed+verified | Old detector removed entirely; the update mechanism is now the browser's byte-diff of /sw.js. No meta version write exists in src/sw/sw.template.js; update proven by newcode2/newcode4 suite passes | 2026-08-18 |
| H2 | client | dropStaleCaches() deletes pages cache before reload; a network drop strands user on offline page | fixed+verified | Confirmed on old code (baseline v1 offline-cold: offline.html served). New design never bulk-deletes the pages cache from the client; offline-cold + slow-network + flaky-network all PASS with provenance marker (newcode4) | 2026-08-18 |
| H3 | client | unguarded sessionStorage.setItem throws in Safari private mode, killing the update | fixed+verified | storageGet/Set wrap sessionStorage in try/catch with in-memory fallback (ServiceWorkerRegistration.tsx); decide() loop-guard also holds without storage. Private-mode WebKit itself not drivable headless — code-level close, behavior on target listed as residual | 2026-08-18 |
| H4 | client | empty NEXT_PUBLIC_BUILD_ID silently no-ops the update path | fixed+verified | deploymentId() throws on empty (src/lib/deployment-id.ts); local-hash fallback produced 3c1c79d8… in the gate build, so the id is never empty at build time; decide() still no-ops safely if it ever were | 2026-08-18 |
| H5 | worker | hand-versioned cache names strand entries on a forgotten bump | fixed+verified | Names no longer version per release: per-entry build tags + all-windows-current sweep replace bumps. Migration from real v6/v7 worker verified: migrate-test lands new build in 214 ms, 1 reload, old caches deleted, 0 stale (migrate1.log) | 2026-08-18 |
| H6 | latency | 60 s throttle + 5-min poll leave "instant" unmeasured | fixed+verified | Measured: cold swap 64–71 ms/0 reloads; resume 157 ms/1 reload after signal; in-session ~1 s after nav via history hook; signals throttled 5 s, interval 60 s backstop. Ceiling argument in Wave 3 log | 2026-08-18 |
| H7 | worker | RSC payloads cached in SWR branch; build-A payload served into build-B page | fixed+verified | Confirmed on old code (baseline v1: /?_rsc= cached with build-A content; soft nav injected new-build chunks into old document). New worker never caches RSC and refuses cross-build payloads (Response.error → hard nav); stale survivors 0 in all swap scenarios | 2026-08-18 |
| H8 | client | interval assumed to survive iOS suspend; visibilitychange assumed only resume signal | fixed+verified | Detection now on visibilitychange + pageshow(persisted) + online + history + interval backstop; resume scenario drives those signals and lands in 157 ms. iOS timer suspension itself unverifiable on desktop — listed as residual [device] | 2026-08-18 |
| S1 | update | byte-different /sw.js per deploy, one id source | fixed+verified | generate-sw embeds deploymentId; harness-sw.js differs per slot; worker GET_BUILD, meta build-id, /api/version and x-build-id all equal the slot id in suite probes | 2026-08-18 |
| S2 | update | /sw.js revalidation Cache-Control + per-deploy ETag | fixed+verified | curl: `cache-control: no-cache, must-revalidate`, ETag changes with bytes/mtime per build; updateViaCache:"none" kept as belt | 2026-08-18 |
| S3 | update | detection via pageshow(persisted)+visibilitychange+online, not interval alone | fixed+verified | Listeners in ServiceWorkerRegistration.tsx; resume scenario fires exactly these synthetic signals and lands | 2026-08-18 |
| S4 | update | exactly one code path decides | fixed+verified | decideUpdateAction() is the single decision (controllerchange, poll, resume all funnel to reconcile); in-flight latch prevents racing reconciles; unit-tested + mutation-checked | 2026-08-18 |
| S5 | update | ≤1 reload per version; failed landing stops; first install never reloads | fixed+verified | install-fresh 0 reloads; cold-swap 0; resume 1; stability 3 cycles 0 further; alreadyReloadedFor stop unit-tested; flap-sw controls show the checks go red | 2026-08-18 |
| S6 | update | update never discards unsaved input | fixed+verified | First harness run destroyed the draft (React syncs defaultValue → dirtiness check dead) — fixed via input-event tracking; rerun: draft survives swap+signals+worker takeover, 1 reload after clearing | 2026-08-18 |
| S7 | update | cold launch reaches current build or converges in one step [device] | fixed+verified (local) | Cold swap lands new build in 64–71 ms with 0 reloads (network-first). Real-iPhone confirmation remains [device] | 2026-08-18 |
| S8 | cache | named cache reads, Vary honoured, RSC/document never cross | fixed+verified | All reads name their cache (incl. offline fallback); RSC requests never enter caches and skewed payloads are refused; documents stored with their Vary intact; 0 cross-type entries in all cache dumps | 2026-08-18 |
| S9 | cache | navigation network-first with bounded timeout → page cache → offline page | fixed+verified | 3.5 s bound; slow-network (6 s delay) falls back to cached shell in 3.6 s; poison never served (network-first); first nav after deploy carries new build (cold-swap 0 reloads) | 2026-08-18 |
| S10 | cache | activation never deletes what a controlled page can request; hashed statics never version-purged | fixed+verified | Activate touches only page docs (re-precached at install); statics swept only when every window reports current build (CLIENT_READY gate); stale count 0 after sweep | 2026-08-18 |
| S11 | cache | only replayable responses cached | fixed+verified | replayableDocument() (ok, non-redirect, basic, non-206, no Vary:*, html) + static checks; /api/** untouched; install refuses non-cacheable start_url | 2026-08-18 |
| S12 | cache | background refresh does not mutate request URL | fixed+verified | fetch(request) untouched; cache-busting param removed; source-tested (mutation-checked) and network log shows clean keys | 2026-08-18 |
| S13 | cache | entry/age bounds + origin usage under written budget [device for usage] | fixed+verified (local) | PAGE 24 / STATIC 150 entry bounds with trim; RSC never cached (kills the leak class); after full browse usage 1.09 MB vs written 25 MB budget; on-device figure remains [device] | 2026-08-18 |
| S14 | cache | failed precache fails the install | fixed+verified | addAll + throwing shell precache inside install waitUntil; break-precache → worker never activates; swallow-precache variant → half-populated worker activates (the red) | 2026-08-18 |
| S15 | cache | one consumer per Response body; no swallowed lifecycle promise | fixed+verified | Clones taken before respondWith consumption; asserted by cache effect: static cache holds 23–29 build files, pages replaced, poison repaired — the old defect's symptom (empty caches) gone | 2026-08-18 |
| S16 | cache | survives eviction + lost registration; no undefined response; persistent storage requested [device] | fixed+verified (local) | evicted-storage scenario passes both halves; fetch handler structurally always responds or passes through; navigator.storage.persist() requested, persisted()=false recorded on desktop WebKit; iPhone outcome [device] | 2026-08-18 |
| S17 | perf | CWV good on mid-range phone; standing latency bar | closed with recorded miss | CLS 0.2244→0.0890 (good), FCP/SI 753 ms (good), TBT ≤4 ms (good); LCP 3.4–4.2 s misses "good" on first-ever visit — evidenced as architecture-bound (Wave 5); installed/repeat loads 52–157 ms, far inside the bar | 2026-08-18 |

## Wave log

### Wave 1 — harness and truth (in progress)
- Harness: `scripts/pwa-swap-harness.mjs` (build | suite | all). Two builds differing only in
  GITHUB_SHA, one origin (port 3311), Playwright WebKit persistent context, iPhone 16 Pro profile,
  `navigator.standalone === true`, display-mode standalone shim, launch at manifest start_url `/`.
- Spike proved WebKit persists SW registration + Cache Storage across cold relaunches
  (controller present before first network on relaunch).
- Baseline suite v1 against unmodified `main` (7201b9f), WebKit standalone, launched at `/`
  (logged out — WebKit drops the Secure session cookie on http://localhost; rerun v2 adds a local
  TLS proxy so the installed app is logged in). Results (.pwa-harness/baseline-suite.log):
  - manifest-agreement: PASS (start_url=scope=id="/", display=standalone, worker precaches "/").
  - install-fresh: PASS — SW controls page, 0 reloads on first install.
  - cold-same-build: PASS — settled in 91 ms, 0 reloads (cache-first serving).
  - cold-swap A→B: FAIL — TWO reloads (each open document reloaded once), and 1 stale survivor:
    an RSC payload `/?_rsc=…` cached in splitwisest-static-v7 with build-A content (H7 confirmed).
  - foreground-stability: PASS — 3 cycles, 0 further loads.
  - insession-nav-swap: recorded landed=true in ~30 s, but instrumentation raced its own reset;
    rerun v2 uses an append-only time-sliced load log.
  - resume-swap A→B: FAIL — never landed within 90 s of resume signals (0 reloads), despite the
    documented poll path; PWA.md's "verified working" claim does not reproduce under standalone
    WebKit conditions.
  - offline-cold: FAIL — offline.html served instead of the app shell (H2/S9 confirmed: the page
    cache had been dropped by the client's dropStaleCaches and never repopulated).
  - poison-repair: FAIL — poisoned "/" entry SERVED on cold launch (cache-first), repair happened
    in background but landing never confirmed.
  - Summary: 5/9 passed; failed: cold-swap, resume-swap, offline-cold, poison-repair.

- Baseline suite v2 (same old code, logged in through the TLS proxy, append-only load log)
  (.pwa-harness/baseline2.log): install-fresh PASS (0 reloads, controller true, 6.4 s incl. login
  + seed); cold-same-build PASS (65 ms, 0 reloads); cold-swap FAIL (1 reload but never confirmed
  on B, 19 stale survivors incl. cross-build RSC payloads); foreground-stability PASS;
  insession-nav-swap recorded a FALSE landing — the soft navigation injected the NEW build's chunk
  scripts into the OLD document (a real cross-build mixing event; probe now reports "mixed");
  resume-swap FAIL (0 reloads in 90 s of resume signals, 13 stale survivors); offline-cold PASS
  this run — offline shell survives only when no version purge preceded it (v1 showed the purge
  case failing, H2); poison-repair FAIL (sentinel HTML served on cold launch). Summary 6/9.
- Wave-1 truth: the old update path converges only via its cold-start version poll, needs 1–2
  reloads, strands 13–19 stale entries per swap, mixes builds on soft navigation, serves poisoned
  cache entries, and loses the offline shell after any version purge.

### Wave 2 — update correctness (new design, measured)
Design shipped: per-deploy generated worker (scripts/generate-sw.ts + src/sw/sw.template.js),
single deployment id source (src/lib/deployment-id.ts) reaching worker/client//api/version/
x-build-id header, network-first navigations (3.5 s bound) with page-cache→shell→offline fallback,
cache-first bounded immutable statics with build tags and all-windows-current sweep, RSC payloads
never cached + cross-build payloads refused, single decide function (src/lib/update-policy.ts),
resume/connectivity/history signals + 60 s backstop, /sw.js served no-cache with per-deploy ETag.

Suite on the new build pair (.pwa-harness/newcode2.log), WebKit standalone installed profile,
logged in, launched at "/": 9/9 PASS.
- install-fresh: 0 reloads, controller true.
- cold-same-build: 52 ms, 0 reloads.
- cold-swap A→B: lands B in 71 ms with ZERO reloads (network-first), 0 stale survivors.
- foreground-stability: 3 cycles, 0 further loads.
- insession-nav-swap B→A: precondition verified, lands with exactly 1 reload; 30 s latency —
  Wave-3 target.
- resume-swap A→B: lands 157 ms after the resume signal, exactly 1 reload, 0 stale survivors.
- offline-cold: app shell (title "SplitWisest | Split smarter", .app-frame present) on last-good
  build, 2.6 s; NOT offline.html.
- poison-repair: sentinel never served (network-first), cache entry replaced, landed 1.06 s.

Negative controls (each check shown red once; every run retained under .pwa-harness/neg-*.log):
- neg-break-manifest.log: manifest-agreement FAIL (start_url "/dashboard", workerPrecachesStartUrl
  false) — the agreement assertion fails when one side changes alone.
- neg-no-swap.log: cold-swap, insession-nav-swap and resume-swap all FAIL when a deploy is claimed
  but the server never swaps — the landing checks can go red.
- neg-no-sw.log: install-fresh (controller false), offline-cold (no provenance marker, controller
  false), slow-network (no worker fallback inside the 6 s bound), evicted-storage FAIL. This
  control originally exposed WebKit's HTTP disk cache faking an offline pass; the offline check now
  requires a marker stamped into the worker's cached "/" to appear in the served DOM.
- neg-flaky-no-sw.log: flaky-network FAIL with every request dropped and no worker (the landed
  path stays on the previous page). WebKit retries dropped requests on kept-alive connections, so
  the check also gained a landed-path assertion.
- neg-flap-sw.log: install-fresh FAIL with 2 reloads and cold-same-build FAIL under a worker whose
  embedded build id alternates per fetch — the reload-count checks can go red.
- neg-stability-loop.log: foreground-stability FAIL (3 reloads, one per cycle) under
  flap-version-no-sw (no worker + alternating /api/version) — the at-most-one-reload check
  catches a loop.
- neg-break-precache.log: install-fresh FAIL — a 404'd precache icon means no worker ever
  activates (S14 held). neg-swallow-precache.log: the same 404 with a worker mutated to swallow
  the failure ACTIVATES half-populated (controller true, icon missing) — the red S14 prevents.
- neg-bloat-storage.log: storage-budget FAIL with a 30 MB entry stuffed into the cache — the
  budget assertion can go red.
- Mutation checks on unit tests retained in .pwa-harness/mutation-checks.log: policy-guard
  removal → 1 failed; cache-busting URL reintroduced → 1 failed; manifest start_url changed →
  2 failed; restored → 83/83.
- Old-code baselines serve as the broken variant for the remaining checks: reload counts (2 reloads),
  stale survivors (13–19), resume landing (never), poison serving (sentinel shown) all printed red
  in .pwa-harness/baseline-suite.log and baseline2.log.

### Wave 3 — instant
- In-session "30 s" latency was harness dead time: the click locator matched the hidden desktop
  sidebar link and burned Playwright's 30 s visibility timeout before the fallback clicked the
  mobile nav; the app's own landing takes ~1 s once a signal fires. Locator fixed to :visible.
- Measured floors (newcode2/newcode4 logs): cold start across a swap lands the new build in
  64–71 ms (network-first document; zero reloads). Foreground-resume lands 157 ms after the resume
  signal (worker refetch + install + claim + one reload). Detection cadence: visibilitychange /
  pageshow / online / history change, 5 s signal throttle, 60 s interval backstop.
- Ceiling argument: cold start cannot go below one network round trip for the document (that IS
  the update). Resume = one /sw.js revalidation + worker install/activate + one reload + one
  document fetch (~150 ms locally; network-bound in production). In-session navigation converges
  ≤1 s after the click via the history hook, bounded by the same worker-update path.

### Wave 4 — cache and offline integrity (newcode4.log, 13/14 → unsaved-input fixed after)
- offline-cold: hardened to require provenance — a marker stamped into the worker's cached "/"
  must appear in the served DOM (the no-sw control exposed WebKit's HTTP disk cache faking a
  pass). PASS: marker served, controller true, last-good build, not offline.html.
- slow-network (6 s/request injected, beyond the 3.5 s nav bound): cold start fell back to the
  cached shell in 3.6 s, controller true, no offline page. PASS.
- flaky-network (every 2nd request dropped): "/", /balances, /groups all rendered the app frame,
  never offline.html. PASS.
- evicted-storage: all caches deleted → next cold start usable in 72 ms and caches repopulated
  (3 caches); registration unregistered + caches deleted → app recovers from network, worker
  reinstalls, caches repopulate, no reinstall of the app. PASS.
- storage-budget: after browsing all 7 routes, origin usage 1.09 MB against a written 25 MB
  budget (quota 20.6 GB); persisted() = false on desktop WebKit — recorded, [device] on iPhone.
- unsaved-input: FIRST RUN RED — the draft was destroyed: React syncs defaultValue on controlled
  inputs, so the value-vs-defaultValue dirtiness check never detected typing (the check caught a
  real S6 violation and serves as its own negative control). Fixed by tracking real input events;
  rerun PASS: draft survives swap + resume signals + worker takeover (0 loads while dirty, value
  intact), and after the field clears exactly one reload lands the new build in 7.7 s
  (defer-retry cadence).
- Precache gate (S14): break-precache (icon 404) → worker never activates (controller false).
  swallow-precache (same 404, worker mutated to swallow the failure) → half-populated worker
  ACTIVATES (controller true, icon missing from cache) — the red that shows what the strict
  install gate prevents. Mutation initially no-opped on gzip bodies; proxy now forwards /sw.js
  identity-encoded for rewriting mutations.
- flap-sw reruns: stability-check red shown in run 1 (3 reloads, one per cycle, poll path);
  reload-count red shown in run 2 (2 reloads on fresh install, worker path).

### Wave 5 — performance ceiling
Tool: Lighthouse 12.8.2 (npx), mobile form factor + screen emulation (moto-g-class profile,
simulated 4x CPU / 150 ms RTT / 1.6 Mbps), Chrome for Testing via the Playwright cache, headless,
3 runs per page, medians reported; authenticated via injected session cookie; pages "/", "/groups",
"/chat" against a local production build (next start). Raw reports in .pwa-harness/perf-*/.

Baseline (old build 7201b9f, .pwa-harness/perf-old-baseline/summary.json) vs final
(.pwa-harness/perf-final/summary.json), medians of 3 runs, quoted from the recorded files:
- "/"      score 0.77 → 0.84 | FCP 752.6 → 753.0 ms | LCP 3944.1 → 4216.7 ms (spread ±300 ms) |
  TBT 2 → 1 ms | CLS 0.2244 → 0.0890 | SI 752.6 → 753.0 ms
- "/groups" 0.90 → 0.90 | LCP 3616.4 → 3617.5 ms | CLS 0 → 0
- "/chat"   0.91 → 0.91 | LCP 3461.6 → 3461.2 ms | CLS 0 → 0
- Bundle: JS 1174 KB → 1175 KB raw (framework-dominated), CSS 43 KB.

Ranked cost centres and outcomes:
1. CLS 0.2244 on "/" (grid pushed down when hero balance data replaced a thin skeleton) —
   IMPROVED to 0.0890 (good band) by reserving the hero's typical footprint in the loading state
   (src/app/page.tsx skeletons). Before/after above.
2. LCP 3.4–4.2 s on all routes (element: data-dependent list text; phases: TTFB 453 ms, render
   delay ~3.2 s) — NOT IMPROVABLE IN SCOPE, with the attempt measured: the render delay is the
   framework JS chain (react-dom 222 KB + Next runtime ~300 KB raw; app route chunks only ~33 KB)
   plus post-hydration data fetch, under simulated 3G/4x-CPU. The one in-scope lever — preloading
   the dashboard's API data via an HTTP Link header — was implemented and measured: without
   `crossorigin` the preload is mode-mismatched and double-fetches (no LCP change, 4 wasted
   requests); with `crossorigin` the anonymous-mode preload broke session auth (401s bounced the
   app to /login mid-trace). Reverted with evidence in .pwa-harness/perf-preload-probe/.
   Moving data fetching into server rendering would fix it but changes the documented
   client-rendered architecture (out of scope). TBT ≈ 0 ms shows the main thread is idle: this is
   a network-shape property of a client-rendered app, not code waste.
3. Bundle JS 1.17 MB raw: react-dom + Next runtime ≈ 520 KB of it; per-route app chunks ~33 KB;
   no chart/date/heavy libraries present (charts are hand-rolled). No entry both removable and
   user-visible; not pursued further (rule: no change whose only justification is a benchmark).
4. FCP/SI 753 ms and TBT ≤ 4 ms on every route: already inside "good"; left alone.

Standing latency bar (installed app, measured in the WebKit harness):
- sub-100 ms direct feedback: TBT ≤ 4 ms, main thread idle; interactions are local state.
- sub-300 ms common cached requests: cache-first statics and meta reads are local; cold start on
  current build settles in 52–65 ms.
- sub-1 s common page loads: installed cold start 52–71 ms; resume landing 157 ms. MISS on the
  first-ever visit under throttled mobile lab (LCP 3.4–4.2 s) — recorded with the reason above;
  installed/repeat experience, which is this goal's target, is far inside the bar.

### Wave 6 — consolidation and close
- Mutation checks: update-policy guard removal → its test fails; cache-busting URL reintroduced in
  the worker template → its test fails; manifest start_url changed alone → two tests fail. All
  restored green (83/83).
- Full gate: pnpm vitest run (83 passed), pnpm exec tsc --noEmit, pnpm lint, pnpm verify:ui-tokens,
  pnpm build, pnpm verify:core, pnpm verify:profiles — all green.
- Two consecutive full suite passes, 14/14 each (final-suite-1.log, final-suite-2.log). Run 1 key
  numbers: cold-swap 70 ms / 0 reloads / 0 stale; in-session 1110 ms / 1 reload; resume 159 ms /
  1 reload / 0 stale; unsaved input survives, lands 7.7 s after clearing. Run 2 matches.
- Migration from the deployed production worker (7201b9f, v6/v7 caches) verified separately:
  lands the new build in 214 ms with 1 reload, old cache names deleted, 0 stale survivors.
- Docs updated: docs/PWA.md (update/cache contract + two-build verification), docs/ARCHITECTURE.md
  (worker/update section). Harness hardened along the way: append-only load log, meta-marker
  build probe (soft-nav chunk mixing detection), offline provenance marker, precondition capture,
  identity-encoding for body-rewriting mutations, symlink guards, explicit exit.

### Fresh-eyes review (blind reviewer: criteria + diff + recorded evidence only)
- Round 1: BLOCK with four gaps — negative-control runs not retained as files, nine checks never
  shown red, ledger perf figures not matching the recorded medians, mutation checks without an
  artifact. All four were real.
- Fixes: every mutation run retained (.pwa-harness/neg-*.log); reds added for every scenario check
  (including a deterministic reload-loop via flap-version-no-sw and a landed-path assertion that
  flaky-network was missing); perf figures corrected to the recorded medians; mutation output
  retained (.pwa-harness/mutation-checks.log). Two checks were tightened, then re-proven with two
  consecutive 14/14 suite passes.
- Round 2: APPROVE — every gap confirmed closed by citation; no remaining correctness gaps.

DONE 25/25 — no open rows.

### Engine truth
Release target is the iPhone Home Screen app on WebKit. Harness runs real WebKit (Playwright
webkit-2336, iOS 18.7 UA) — the right engine — but a desktop WebKit build in standalone
simulation is still not an iPhone: iOS timer suspension, jetsam eviction, and Add-to-Home-Screen
storage partitioning remain unverifiable locally and are listed as such in the final report.
