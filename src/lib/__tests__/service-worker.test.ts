import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Source-shape tripwires only. The behavioral proof lives in
// scripts/pwa-swap-harness.mjs, which drives two real builds through a real
// WebKit installed-app profile — a worker that LOOKS right has been broken
// here twice, so nothing below claims runtime behavior on its own.

const template = readFileSync(join(process.cwd(), "src/sw/sw.template.js"), "utf8");
const manifest = JSON.parse(readFileSync(join(process.cwd(), "public/manifest.json"), "utf8"));
const layout = readFileSync(join(process.cwd(), "src/app/layout.tsx"), "utf8");
const client = readFileSync(join(process.cwd(), "src/components/ServiceWorkerRegistration.tsx"), "utf8");

describe("worker template", () => {
  it("embeds the build id so every deploy ships byte-different worker code", () => {
    expect(template).toContain('const BUILD_ID = "__BUILD_ID__"');
  });

  it("never lets an RSC payload into any cache branch", () => {
    expect(template).toMatch(/request\.headers\.get\("RSC"\) === "1" \|\| url\.searchParams\.has\("_rsc"\)/);
  });

  it("does not mutate the request URL for the network fetch", () => {
    expect(template).not.toContain("searchParams.set");
    expect(template).not.toContain("__sw_refresh");
  });

  it("keeps user-scoped API traffic out of the worker entirely", () => {
    expect(template).toContain('url.pathname.startsWith("/api/")');
  });

  it("bounds both runtime caches", () => {
    expect(template).toContain("PAGE_MAX_ENTRIES");
    expect(template).toContain("STATIC_MAX_ENTRIES");
  });

  it("refuses to cache a non-replayable document", () => {
    expect(template).toContain("!response.redirected");
    expect(template).toContain('response.type === "basic"');
  });
});

describe("manifest ↔ worker ↔ client agreement", () => {
  it("start_url, scope, id and display agree", () => {
    expect(manifest.start_url).toBe("/");
    expect(manifest.scope).toBe("/");
    expect(manifest.id).toBe("/");
    expect(manifest.display).toBe("standalone");
  });

  it("the worker precaches and repairs exactly the launched start_url", () => {
    expect(template).toContain(`const START_URL = "${manifest.start_url}"`);
  });

  it("the layout exposes the build id as a DOM marker", () => {
    expect(layout).toContain('meta name="build-id"');
  });

  it("the client registers the worker at the scope root", () => {
    expect(client).toContain('navigator.serviceWorker.register("/sw.js"');
  });
});
