import type { NextConfig } from "next";
import { createHash } from "crypto";
import { execFileSync } from "child_process";
import { readFileSync } from "fs";

function localSourceId() {
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

const deploymentId = process.env.VERCEL_GIT_COMMIT_SHA
  ?? process.env.GITHUB_SHA
  ?? localSourceId();

const nextConfig: NextConfig = {
  // Hide the floating dev-tools indicator so it never overlaps the app chrome
  // (it was being mistaken for the user avatar in design review captures).
  devIndicators: false,
  generateBuildId: async () => deploymentId,
  env: {
    NEXT_PUBLIC_BUILD_ID: deploymentId,
  },
};

export default nextConfig;
