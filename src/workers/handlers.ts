import type {
  RequestMessage,
  RequestParams,
  RequestProgress,
  RequestResult,
  RequestType,
  WorkerMessage,
} from "./protocol";
import { WorkerSession } from "./session";

export type HandlerContext<T extends RequestType = RequestType> = {
  progress: (progress: RequestProgress<T>) => void;
  // Objetos transferidos para a UI sem cópia (ex.: bytes do arquivo exportado).
  transfer: (list: Transferable[]) => void;
};

type Handlers = {
  [T in RequestType]: (params: RequestParams<T>, ctx: HandlerContext<T>) => RequestResult<T> | Promise<RequestResult<T>>;
};

export function createHandlers(session = new WorkerSession()): Handlers {
  return {
    ping: ({ sentAt }) => ({ sentAt, handledAt: Date.now() }),
    openFile: ({ file, sheet }, ctx) => session.open(file, sheet, ctx.progress),
    reopen: ({ overrides, sheet }, ctx) => session.reopen(overrides, sheet, ctx.progress),
    setView: (spec) => session.setView(spec),
    getRows: ({ start, count }) => session.getRows(start, count),
    search: ({ query }) => session.search(query),
    getMatch: ({ index }) => session.getMatch(index),
    summarize: ({ column, scope }) => session.summarize(column, scope),
    checkExport: ({ options, scope }) => session.checkExport(options, scope),
    exportFile: ({ options, scope, policy }, ctx) => {
      const bytes = session.exportFile(options, scope, policy);
      ctx.transfer([bytes.buffer]);
      return { bytes };
    },
  };
}

const defaultHandlers = createHandlers();

const noopContext: HandlerContext = { progress: () => {}, transfer: () => {} };

export async function handleRequest(
  message: RequestMessage,
  ctx: HandlerContext = noopContext,
  handlers: Handlers = defaultHandlers,
): Promise<WorkerMessage> {
  const handler = handlers[message.type] as
    | ((params: unknown, ctx: HandlerContext) => unknown)
    | undefined;
  if (!handler) {
    return { kind: "response", id: message.id, ok: false, error: `Operação desconhecida: ${String(message.type)}` };
  }
  try {
    const result = await handler(message.params, ctx);
    return { kind: "response", id: message.id, ok: true, result };
  } catch (error) {
    return { kind: "response", id: message.id, ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
