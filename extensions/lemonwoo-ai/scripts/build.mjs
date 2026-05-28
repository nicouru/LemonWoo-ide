import * as esbuild from "esbuild";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const extRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

for (const pkg of ["@lemonwoo/deepseek", "@lemonwoo/test-gate", "@lemonwoo/agent-runtime"]) {
  const r = spawnSync("pnpm", ["--filter", pkg, "build"], { cwd: root, stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

await esbuild.build({
  entryPoints: [resolve(extRoot, "src/extension.ts")],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  outfile: resolve(extRoot, "dist/extension.cjs"),
  external: ["vscode"],
  sourcemap: true,
  logLevel: "info"
});

console.log("Bundled extension -> dist/extension.cjs");
