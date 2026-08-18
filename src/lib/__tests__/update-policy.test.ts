import { describe, expect, it } from "vitest";
import { decideUpdateAction } from "../update-policy";

const base = {
  pageBuild: "aaa",
  controllerBuild: "bbb",
  serverBuild: "bbb",
  alreadyReloadedFor: null,
  hasUnsavedInput: false,
};

describe("decideUpdateAction — the single reload decision", () => {
  it("reloads when the worker has a newer build than the page", () => {
    expect(decideUpdateAction(base)).toBe("reload");
  });

  it("does nothing when everything agrees (first install never reloads)", () => {
    expect(decideUpdateAction({ ...base, controllerBuild: "aaa", serverBuild: null })).toBe("none");
  });

  it("does nothing when no authority is reachable", () => {
    expect(decideUpdateAction({ ...base, controllerBuild: null, serverBuild: null })).toBe("none");
  });

  it("never reloads a page that is already on the server's build (worker merely lagging)", () => {
    // Network-first cold start: the document lands the new build before the
    // worker script updates. The stale worker must not bounce the fresh page.
    expect(decideUpdateAction({ ...base, pageBuild: "bbb", controllerBuild: "aaa" })).toBe("none");
  });

  it("no-ops rather than guessing when the page build is missing", () => {
    expect(decideUpdateAction({ ...base, pageBuild: undefined })).toBe("none");
  });

  it("stops after one reload per version instead of looping", () => {
    expect(decideUpdateAction({ ...base, alreadyReloadedFor: "bbb" })).toBe("none");
  });

  it("allows a reload for a NEWER version after a failed landing", () => {
    expect(decideUpdateAction({ ...base, controllerBuild: "ccc", serverBuild: "ccc", alreadyReloadedFor: "bbb" })).toBe("reload");
  });

  it("reloads on worker mismatch even when the server is unreachable (guarded once)", () => {
    expect(decideUpdateAction({ ...base, serverBuild: null })).toBe("reload");
  });

  it("falls back to the server build when no worker controls the page", () => {
    expect(decideUpdateAction({ ...base, controllerBuild: null })).toBe("reload");
  });

  it("defers, never discards, while the user has unsaved input", () => {
    expect(decideUpdateAction({ ...base, hasUnsavedInput: true })).toBe("defer");
  });
});
