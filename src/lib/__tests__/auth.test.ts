import { describe, expect, it } from "vitest";

process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/test";

async function auth() {
  return import("../auth");
}

describe("auth timing helpers", () => {
  it("rejects missing login hashes after doing fallback verification", async () => {
    const { verifyPasswordForLogin } = await auth();
    expect(verifyPasswordForLogin("password", null)).toBe(false);
  });

  it("finds a matching recovery code without depending on candidate order", async () => {
    const { hashRecoveryCode, matchingRecoveryCodeId } = await auth();
    const match = matchingRecoveryCodeId("AB123-456CD", [
      { id: 1, codeHash: hashRecoveryCode("ZZZZZ-ZZZZZ") },
      { id: 2, codeHash: hashRecoveryCode("AB123-456CD") },
      { id: 3, codeHash: hashRecoveryCode("YYYYY-YYYYY") },
    ]);
    expect(match).toBe(2);
  });

  it("rejects recovery codes when there are no candidates", async () => {
    const { matchingRecoveryCodeId } = await auth();
    expect(matchingRecoveryCodeId("AB123-456CD", [])).toBeNull();
  });

  it("accepts a real login hash", async () => {
    const { hashPassword, verifyPasswordForLogin } = await auth();
    expect(verifyPasswordForLogin("password", hashPassword("password"))).toBe(true);
  });
});
