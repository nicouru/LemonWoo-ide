import { describe, expect, it } from "vitest";
import { redactSecrets } from "../src/redact.js";

describe("redactSecrets", () => {
  it("redacts well-known OpenAI/DeepSeek sk- keys", () => {
    const out = redactSecrets("Authorization: Bearer sk-abc123def456ghi789");
    expect(out).toContain("[REDACTED]");
    expect(out).not.toContain("sk-abc123def456ghi789");
  });

  it("redacts GitHub personal access tokens", () => {
    const out = redactSecrets(
      "ghp_0123456789ABCDEFGHIJ github_pat_abcdefABCDEF0123456789"
    );
    expect(out).not.toContain("ghp_0123456789ABCDEFGHIJ");
    expect(out).not.toContain("github_pat_abcdefABCDEF0123456789");
  });

  it("redacts caller-supplied secrets verbatim", () => {
    const key = "sk-veryRealKey_with-special.chars+1";
    const message = `Failed to authenticate using ${key}, please retry.`;
    const out = redactSecrets(message, [key]);
    expect(out).not.toContain(key);
    expect(out).toContain("[REDACTED]");
  });

  it("does not blow up on empty input", () => {
    expect(redactSecrets("")).toBe("");
    expect(redactSecrets("nothing to redact here")).toBe(
      "nothing to redact here"
    );
  });

  it("ignores very short extra secrets to avoid mangling normal text", () => {
    const out = redactSecrets("ok", ["ok"]);
    expect(out).toBe("ok");
  });

  it("escapes regex metacharacters in extra secrets", () => {
    const key = "abc.def*ghi+jkl?";
    const out = redactSecrets(`leak: ${key}`, [key]);
    expect(out).toContain("leak: [REDACTED]");
    // The escaping must not match other strings.
    expect(redactSecrets("abc-def-ghi-jkl-", [key])).toBe("abc-def-ghi-jkl-");
  });

  it("redacts multiple occurrences of the same secret", () => {
    const key = "sk-aaaaaaaaaaaa";
    const out = redactSecrets(`${key} appears twice: ${key}`, [key]);
    expect(out.match(/\[REDACTED\]/g)?.length).toBeGreaterThanOrEqual(2);
    expect(out).not.toContain(key);
  });
});
