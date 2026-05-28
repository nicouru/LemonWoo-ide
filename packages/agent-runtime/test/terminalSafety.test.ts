import { describe, expect, it } from "vitest";
import { classifyTerminalCommand, parseTerminalTimeoutMs } from "../src/terminalSafety.js";

describe("classifyTerminalCommand", () => {
  it("allows npm test and rg", () => {
    expect(classifyTerminalCommand("npm test").policy).toBe("allow");
    expect(classifyTerminalCommand("pnpm run test").policy).toBe("allow");
    expect(classifyTerminalCommand("rg foo").policy).toBe("allow");
  });

  it("requires confirmation for install commands", () => {
    expect(classifyTerminalCommand("pnpm install").policy).toBe("confirm");
    expect(classifyTerminalCommand("npm install lodash").policy).toBe("confirm");
  });

  it("blocks destructive commands", () => {
    expect(classifyTerminalCommand("rm -rf node_modules").policy).toBe("block");
    expect(classifyTerminalCommand("sudo npm test").policy).toBe("block");
    expect(classifyTerminalCommand("git push origin main").policy).toBe("block");
    expect(classifyTerminalCommand("git reset --hard").policy).toBe("block");
  });

  it("requires confirmation for unlisted commands", () => {
    expect(classifyTerminalCommand("make all").policy).toBe("confirm");
  });

  it("caps timeout parsing", () => {
    expect(parseTerminalTimeoutMs(undefined)).toBe(30_000);
    expect(parseTerminalTimeoutMs("5000")).toBe(5000);
    expect(parseTerminalTimeoutMs("999999")).toBe(120_000);
  });
});
