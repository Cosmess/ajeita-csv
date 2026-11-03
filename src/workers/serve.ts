import { handleRequest } from "./handlers";
import type { MessageEndpoint, RequestMessage } from "./protocol";

// Responde às requisições que chegam no endpoint (o próprio worker ou, nos testes, um MessagePort).
export function serveRequests(endpoint: MessageEndpoint): void {
  endpoint.addEventListener("message", async (event) => {
    endpoint.postMessage(await handleRequest(event.data as RequestMessage));
  });
}
