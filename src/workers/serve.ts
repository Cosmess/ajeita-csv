import { handleRequest } from "./handlers";
import type { MessageEndpoint, RequestMessage } from "./protocol";

// Responde às requisições que chegam no endpoint (o próprio worker ou, nos testes, um MessagePort).
export function serveRequests(endpoint: MessageEndpoint): void {
  endpoint.addEventListener("message", async (event) => {
    const message = event.data as RequestMessage;
    let transfer: Transferable[] = [];
    const response = await handleRequest(message, {
      progress: (progress) => endpoint.postMessage({ kind: "progress", id: message.id, progress }),
      transfer: (list) => {
        transfer = list;
      },
    });
    endpoint.postMessage(response, transfer);
  });
}
