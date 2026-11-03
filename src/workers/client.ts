import type {
  MessageEndpoint,
  RequestParams,
  RequestProgress,
  RequestResult,
  RequestType,
  WorkerMessage,
} from "./protocol";

export type WorkerClient = {
  request<T extends RequestType>(
    type: T,
    params: RequestParams<T>,
    onProgress?: (progress: RequestProgress<T>) => void,
  ): Promise<RequestResult<T>>;
};

type Pending = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  onProgress?: (progress: unknown) => void;
};

export function createWorkerClient(endpoint: MessageEndpoint): WorkerClient {
  let nextId = 1;
  const pending = new Map<number, Pending>();

  endpoint.addEventListener("message", (event) => {
    const message = event.data as WorkerMessage;
    const entry = pending.get(message.id);
    if (!entry) return;
    if (message.kind === "progress") {
      entry.onProgress?.(message.progress);
      return;
    }
    pending.delete(message.id);
    if (message.ok) entry.resolve(message.result);
    else entry.reject(new Error(message.error));
  });

  return {
    request(type, params, onProgress) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, {
          resolve: resolve as (value: unknown) => void,
          reject,
          onProgress: onProgress as ((progress: unknown) => void) | undefined,
        });
        endpoint.postMessage({ id, type, params });
      });
    },
  };
}
