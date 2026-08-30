import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { resolveThemePreference, themeInitScript } from "../theme";

function runThemeInit({
  saved,
  prefersDark,
  storageThrows = false,
}: {
  saved?: string | null;
  prefersDark: boolean;
  storageThrows?: boolean;
}) {
  let applied: string | null = null;
  runInNewContext(themeInitScript, {
    localStorage: {
      getItem: () => {
        if (storageThrows) throw new Error("storage unavailable");
        return saved ?? null;
      },
    },
    matchMedia: () => ({ matches: prefersDark }),
    document: {
      documentElement: {
        setAttribute: (_name: string, value: string) => { applied = value; },
      },
    },
  });
  return applied;
}

describe("theme preference", () => {
  it("uses an explicit saved theme before the system preference", () => {
    expect(resolveThemePreference("light", true)).toBe("light");
    expect(runThemeInit({ saved: "dark", prefersDark: false })).toBe("dark");
  });

  it("uses the system preference on a first visit", () => {
    expect(resolveThemePreference(null, true)).toBe("dark");
    expect(runThemeInit({ prefersDark: true })).toBe("dark");
  });

  it("still applies the system theme when storage is unavailable", () => {
    expect(runThemeInit({ prefersDark: true, storageThrows: true })).toBe("dark");
  });

  it("ignores an invalid saved value", () => {
    expect(runThemeInit({ saved: "sepia", prefersDark: false })).toBe("light");
  });
});
