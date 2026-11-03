import type { RequestMessage, RequestParams, RequestResult, RequestType, ResponseMessage } from "./protocol";

type Handlers = {
  [T in RequestType]: (params: RequestParams<T>) => RequestResult<T> | Promise<RequestResult<T>>;
};

const handlers: Handlers = {
  ping: ({ sentAt }) => ({ sentAt, handledAt: Date.now() }),
};

export async function handleRequest(message: RequestMessage): Promise<ResponseMessage> {
  const handler = handlers[message.type];
  if (!handler) {
    return { id: message.id, ok: false, error: `Operação desconhecida: ${String(message.type)}` };
  }
  try {
    const result = await handler(message.params);
    return { id: message.id, ok: true, result };
  } catch (error) {
    return { id: message.id, ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
