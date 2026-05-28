import { runOpenCodeSpike } from "../packages/agent-runtime/dist/index.js";

const result = await runOpenCodeSpike();
if (!result.ok) {
  console.error(result.detail);
  process.exit(1);
}
console.log(result.detail);
