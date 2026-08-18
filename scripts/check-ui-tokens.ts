import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export interface UiTokenViolation {
  file: string;
  line: number;
  rule: string;
  match: string;
}

const RULES: { name: string; pattern: RegExp; componentsOnly?: boolean }[] = [
  {
    name: "arbitrary pixel class",
    pattern: /\b[a-z-]+-\[[^\]]*\d+(?:\.\d+)?px[^\]]*\]/g,
  },
  {
    name: "arbitrary text size",
    pattern: /\btext-\[(?:\d|\.\d)[^\]]*\]/g,
  },
  {
    name: "arbitrary radius",
    pattern: /\brounded(?:-[trbl]{1,2})?-\[(?:\d|\.\d)[^\]]*\]/g,
  },
  {
    name: "hard-coded component color",
    pattern: /#[0-9a-fA-F]{3,8}\b/g,
    componentsOnly: true,
  },
  {
    // 18px sits a 1.11 step under 20px, too close to read as its own level.
    // The ramp runs 12 / 14 / 16 / 20 / 24 / 32 / 40 and `--text-lg` is unset,
    // so this class would silently render at the browser default.
    name: "off-ramp text size (text-lg)",
    pattern: /\btext-lg\b/g,
    componentsOnly: true,
  },
];

export function findUiTokenViolations(source: string, file = "component.tsx"): UiTokenViolation[] {
  const isComponent = file.endsWith(".tsx") || file.endsWith(".ts");
  const violations: UiTokenViolation[] = [];
  for (const rule of RULES) {
    if (rule.componentsOnly && !isComponent) continue;
    for (const match of source.matchAll(rule.pattern)) {
      const index = match.index ?? 0;
      const lineStart = source.lastIndexOf("\n", index) + 1;
      const lineEnd = source.indexOf("\n", index);
      const line = source.slice(lineStart, lineEnd === -1 ? source.length : lineEnd);
      if (line.includes("ui-token-allow")) continue;
      violations.push({
        file,
        line: source.slice(0, index).split("\n").length,
        rule: rule.name,
        match: match[0],
      });
    }
  }
  return violations;
}

function sourceFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root)) {
    if (entry === "__tests__") continue;
    const path = join(root, entry);
    if (statSync(path).isDirectory()) files.push(...sourceFiles(path));
    else if (/\.(?:tsx|ts|css)$/.test(entry)) files.push(path);
  }
  return files;
}

export function scanUiTokens(root = join(process.cwd(), "src")): UiTokenViolation[] {
  return sourceFiles(root).flatMap((file) =>
    findUiTokenViolations(readFileSync(file, "utf8"), relative(process.cwd(), file))
  );
}

if (process.argv[1]?.endsWith("check-ui-tokens.ts")) {
  const violations = scanUiTokens();
  if (violations.length > 0) {
    for (const violation of violations) {
      console.error(`${violation.file}:${violation.line} ${violation.rule}: ${violation.match}`);
    }
    process.exitCode = 1;
  } else {
    console.log("UI token check passed");
  }
}
