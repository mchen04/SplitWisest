import { createHash } from "crypto";
import { execFileSync } from "child_process";
import { readFileSync } from "fs";

// Hash of every tracked (and untracked-but-not-ignored) source file. public/sw.js
// is gitignored build output, so generating it never changes this id.
function localSourceId(): string {
  const files = execFileSync(
    "git",
    ["ls-files", "-co", "--exclude-standard", "src", "public", "next.config.ts", "package.json"],
    { encoding: "utf8" }
  ).trim().split("\n").filter(Boolean).sort();
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(file);
    hash.update(readFileSync(file));
  }
  return hash.digest("hex").slice(0, 20);
}

// One id per deploy, from one source. The worker source, the client bundle
// (NEXT_PUBLIC_BUILD_ID), and /api/version all derive from this value; if it
// ever came out empty the whole update path would no-op in silence, so an
// empty id fails the build instead.
export function deploymentId(): string {
  const id = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || localSourceId();
  if (!id || typeof id !== "string") throw new Error("deploymentId resolved empty; refusing to build");
  return id;
}
