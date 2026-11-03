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
    preview: ({ op }) => session.preview(op),
    execute: ({ op }) => session.execute(op),
    undo: () => session.undo(),
    redo: () => session.redo(),
    getProblems: ({ offset, limit }) => session.getProblems(offset, limit),
    locateRow: ({ row }) => session.locateRow(row),
    savedSession: async () => (await session.savedSession()) ?? null,
    restore: () => session.restore(),
    discardSaved: () => session.discardSaved(),
    setView: (spec) => session.setView(spec),
    getRows: ({ start, count }) => session.getRows(start, count),
    search: ({ query }) => session.search(query),
    getMatch: ({ index }) => session.getMatch(index),
    summarize: ({ column, scope, rule }) => session.summarize(column, scope, rule),
    countInvalid: ({ column, rule }) => session.countInvalid(column, rule),
    flush: () => session.flush(),
    createBlank: ({ columns, rows }) => session.createBlank(columns, rows),
    createFromRows: ({ name, rows, hasHeader }) => session.createFromRows(name, rows, hasHeader),
    createFromJson: ({ name, text }) => session.createFromJson(name, text),
    previewSql: ({ options, scope }) => session.previewSql(options, scope),
    exportSql: ({ options, scope }, ctx) => {
      const bytes = session.exportSql(options, scope);
      ctx.transfer([bytes.buffer]);
      return { bytes };
    },
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
