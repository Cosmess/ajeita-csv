import { afterEach, describe, expect, it } from "vitest";
import { createWorkerClient } from "../src/workers/client";
import { handleRequest } from "../src/workers/handlers";
import type { RequestMessage } from "../src/workers/protocol";
import { serveRequests } from "../src/workers/serve";

describe("comunicação UI ↔ worker", () => {
  const channels: MessageChannel[] = [];

  afterEach(() => {
    for (const channel of channels.splice(0)) {
      channel.port1.close();
      channel.port2.close();
    }
  });

  function connect() {
    const channel = new MessageChannel();
    channels.push(channel);
    serveRequests(channel.port2);
    channel.port2.start();
    const client = createWorkerClient(channel.port1);
    channel.port1.start();
    return client;
  }

  it("responde ao ping com o mesmo sentAt", async () => {
    const client = connect();
    const result = await client.request("ping", { sentAt: 123 });
    expect(result.sentAt).toBe(123);
    expect(result.handledAt).toBeGreaterThan(0);
  });

  it("associa respostas às requisições certas quando há várias em paralelo", async () => {
    const client = connect();
    const results = await Promise.all([1, 2, 3].map((sentAt) => client.request("ping", { sentAt })));
    expect(results.map((r) => r.sentAt)).toEqual([1, 2, 3]);
  });

  it("devolve erro para operação desconhecida", async () => {
    const response = await handleRequest({ id: 7, type: "inexistente", params: {} } as unknown as RequestMessage);
    expect(response).toEqual({ id: 7, ok: false, error: "Operação desconhecida: inexistente" });
  });
});
