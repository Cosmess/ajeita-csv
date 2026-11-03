import { createWorkerClient, type WorkerClient } from "../workers/client";

let client: WorkerClient | undefined;

// Um único worker por side panel, criado sob demanda.
export function getWorkerClient(): WorkerClient {
  if (!client) {
    const worker = new Worker(new URL("../workers/csv.worker.ts", import.meta.url), { type: "module" });
    client = createWorkerClient(worker);
  }
  return client;
}
