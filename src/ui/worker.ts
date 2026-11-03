import { createWorkerClient, type WorkerClient } from "../workers/client";

let worker: Worker | undefined;
let client: WorkerClient | undefined;

// Um único worker por side panel, criado sob demanda.
export function getWorkerClient(): WorkerClient {
  if (!client) {
    worker = new Worker(new URL("../workers/csv.worker.ts", import.meta.url), { type: "module" });
    client = createWorkerClient(worker);
  }
  return client;
}

// Encerra o worker (ex.: expressão regular que não termina) e cria outro, vazio.
export function restartWorker(reason: string): WorkerClient {
  worker?.terminate();
  client?.dispose(reason);
  worker = undefined;
  client = undefined;
  return getWorkerClient();
}
