import { createOpencodeClient, createOpencodeServer } from "@opencode-ai/sdk";

export interface RuntimeSpikeResult {
  ok: boolean;
  detail: string;
}

export async function runOpenCodeSpike(timeoutMs = 60_000): Promise<RuntimeSpikeResult> {
  const started = Date.now();
  let server: Awaited<ReturnType<typeof createOpencodeServer>> | undefined;
  try {
    server = await createOpencodeServer({
      hostname: "127.0.0.1",
      port: 4096
    });
    const client = createOpencodeClient({
      baseUrl: server.url
    });
    const session: any = await client.session.create({ body: { title: "LemonWoo Spike" } });
    if (session?.error) {
      return { ok: false, detail: `OpenCode session error: ${JSON.stringify(session.error)}` };
    }
    if (Date.now() - started > timeoutMs) {
      return { ok: false, detail: "Spike timed out before prompt stage" };
    }
    return { ok: true, detail: "OpenCode SDK started and session created" };
  } catch (error) {
    return { ok: false, detail: `OpenCode spike failed: ${String(error)}` };
  } finally {
    server?.close();
  }
}
