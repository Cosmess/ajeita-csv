import type { MessageEndpoint, RequestParams, RequestResult, RequestType, ResponseMessage } from "./protocol";

export type WorkerClient = {
  request<T extends RequestType>(type: T, params: RequestParams<T>): Promise<RequestResult<T>>;
};

export function createWorkerClient(endpoint: MessageEndpoint): WorkerClient {
  let nextId = 1;
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (reason: Error) => void }>();

  endpoint.addEventListener("message", (event) => {
    const response = event.data as ResponseMessage;
    const entry = pending.get(response.id);
    if (!entry) return;
    pending.delete(response.id);
    if (response.ok) entry.resolve(response.result);
    else entry.reject(new Error(response.error));
  });

  return {
    request(type, params) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
        endpoint.postMessage({ id, type, params });
      });
    },
  };
}
