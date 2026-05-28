import { describe, expect, it } from "vitest";
import { buildMessages } from "../src/messages.js";

const baseOpts = {
  systemPrompt: "You are LemonWoo agent.",
  repoRules: "- Prefer TypeScript.\n- No console.log in production.",
  stableContext: "Project: LemonWoo IDE\nLang: TypeScript",
  userInput: "Refactor the router."
};

describe("buildMessages cache-friendly ordering", () => {
  it("places stable system content first, user input last", () => {
    const m = buildMessages({
      ...baseOpts,
      volatileContext: "file: src/router.ts diff: ..."
    });
    expect(m).toHaveLength(3);
    expect(m[0]?.role).toBe("system");
    expect(m[1]?.role).toBe("system");
    expect(m[2]?.role).toBe("user");
  });

  it("emits only one system message when there is no volatile context", () => {
    const m = buildMessages({ ...baseOpts });
    expect(m).toHaveLength(2);
    expect(m[0]?.role).toBe("system");
    expect(m[1]?.role).toBe("user");
  });

  it("treats whitespace-only fields as absent", () => {
    const m = buildMessages({
      systemPrompt: "stable",
      repoRules: "   ",
      stableContext: "\n",
      volatileContext: "   \n",
      userInput: "hi"
    });
    expect(m).toHaveLength(2);
    expect(m[0]?.content).toBe("stable");
  });

  it("keeps the stable system message byte-identical when only volatile or user input changes", () => {
    const a = buildMessages({ ...baseOpts, volatileContext: "diff A", userInput: "fix" });
    const b = buildMessages({ ...baseOpts, volatileContext: "diff B (different bytes!)", userInput: "fix differently" });
    expect(a[0]?.content).toBe(b[0]?.content);
  });

  it("differs in the stable prefix when repoRules change (cache invalidation is expected)", () => {
    const a = buildMessages({ ...baseOpts });
    const b = buildMessages({ ...baseOpts, repoRules: "different repo rules" });
    expect(a[0]?.content).not.toBe(b[0]?.content);
  });

  it("places volatile context in a separate trailing system message", () => {
    const m = buildMessages({
      ...baseOpts,
      volatileContext: "git diff @@ ..."
    });
    expect(m[1]?.role).toBe("system");
    const content = m[1]?.content;
    expect(typeof content).toBe("string");
    expect(content as string).toContain("# Volatile context");
    expect(content as string).toContain("git diff");
    // Stable header text must NOT leak into the volatile message.
    expect(content as string).not.toContain("# Repo rules");
  });
});
