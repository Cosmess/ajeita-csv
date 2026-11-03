// Contrato das mensagens trocadas entre a UI e o worker.
// Cada operação declara seus parâmetros e seu resultado.
export type RequestMap = {
  ping: {
    params: { sentAt: number };
    result: { sentAt: number; handledAt: number };
  };
};

export type RequestType = keyof RequestMap;
export type RequestParams<T extends RequestType> = RequestMap[T]["params"];
export type RequestResult<T extends RequestType> = RequestMap[T]["result"];

export type RequestMessage<T extends RequestType = RequestType> = {
  id: number;
  type: T;
  params: RequestParams<T>;
};

export type ResponseMessage =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string };

// Interface mínima comum a Worker, DedicatedWorkerGlobalScope e MessagePort.
export type MessageEndpoint = {
  postMessage(message: unknown): void;
  addEventListener(type: "message", listener: (event: MessageEvent) => void): void;
};
