import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sw = readFileSync(join(process.cwd(), "public/sw.js"), "utf8");

/**
 * A Response body can be read once. `event.respondWith(r)` consumes `r`, so any
 * copy the worker also wants to cache or compare must be cloned *before* that —
 * and synchronously, since anything awaited first runs too late.
 *
 * Getting this wrong fails silently and completely: the clone throws, the
 * rejection lands in a `.catch(() => undefined)`, and every line after it in the
 * refresh becomes dead code. The installed app then serves its cached page
 * forever, and no amount of relaunching helps, because the code that would
 * replace that page never runs. Measured on the broken worker: the page cache
 * kept a stale entry across ten cold starts, and the static cache never held a
 * single build chunk.
 */
describe("service worker response handling", () => {
  it("hands the background page refresh its own copy of the cached response", () => {
    // The same object went to respondWith and to refreshPage. respondWith won,
    // refreshPage threw on a used body, and the stale page was never replaced.
    expect(sw).toContain("network(cached.clone())");
    expect(sw).not.toMatch(/network\(cached\)\.catch/);
  });

  it("clones asset responses before returning them, not inside a later await", () => {
    // `caches.open(...).then(cache => cache.put(request, response.clone()))`
    // evaluates the clone after `return response` has already handed the body to
    // respondWith, so every build chunk failed to cache.
    expect(sw).not.toMatch(/caches\.open\([A-Z_]+\)\.then\(\(cache\) => cache\.put\(request, response\.clone\(\)\)\)/);
    expect(sw.match(/const copy = response\.clone\(\);/g) ?? []).toHaveLength(2);
    expect(sw).toMatch(/cache\.put\(request, copy\)/);
  });

  it("still compares the two page bodies so a new shell is detected", () => {
    // refreshPage owns its copy now, so it reads it directly; the network
    // response is cloned because it is returned to the caller afterwards.
    expect(sw).toContain("await Promise.all([cached.text(), response.clone().text()])");
    expect(sw).toContain("notifyShellUpdate()");
  });
});
