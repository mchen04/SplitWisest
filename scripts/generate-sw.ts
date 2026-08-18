// Writes public/sw.js from src/sw/sw.template.js with the deployment id
// embedded, so every deploy ships a byte-different worker script. Runs as part
// of `pnpm build`; public/sw.js is gitignored build output.
import { lstatSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";
import { deploymentId } from "../src/lib/deployment-id";

const root = process.cwd();
// The swap harness leaves .next as a symlink into one of its build slots; a
// bare `pnpm build` would write through it and silently destroy that slot.
try {
  if (lstatSync(join(root, ".next")).isSymbolicLink()) unlinkSync(join(root, ".next"));
} catch {}
const template = readFileSync(join(root, "src/sw/sw.template.js"), "utf8");
if (!template.includes('"__BUILD_ID__"')) {
  throw new Error("sw.template.js lost its __BUILD_ID__ placeholder");
}
const id = deploymentId();
const output = template
  .replace(/^\/\* eslint-disable \*\/\n/, "")
  .replace(/__BUILD_ID__/g, id);
writeFileSync(join(root, "public/sw.js"), output);
console.log(`generated public/sw.js for build ${id}`);
