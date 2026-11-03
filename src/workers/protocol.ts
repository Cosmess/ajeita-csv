// Contrato das mensagens trocadas entre a UI e o worker.
// Cada operação declara seus parâmetros, seu resultado e, se tiver, seu progresso.
import type { Column, ParseMeta } from "../core/dataset";
import type { CsvExportOptions } from "../core/export/csv";
import type { UnencodablePolicy } from "../core/export/windows1252";
import type { ColumnSummary } from "../core/inspect/summary";
import type { ViewSpec } from "../core/inspect/view";
import type { ParseOverrides } from "../core/parse";

export type DatasetInfo = {
  fileName: string;
  columns: Column[];
  rowCount: number;
  meta: ParseMeta;
  // Abas do .xlsx aberto; vazio para CSV.
  sheets: string[];
  // Muda a cada novo arquivo ou visualização; a UI descarta linhas de versões antigas.
  viewVersion: number;
};

export type OpenProgress = {
  fraction: number;
  // Primeiras linhas, enviadas uma vez, para mostrar a grade antes do fim da leitura.
  preview?: { columns: string[]; rows: string[][] };
};

export type OpenResult = { status: "opened"; info: DatasetInfo } | { status: "choose-sheet"; sheets: string[] };

export type ExportScope = "all" | "view";

type Op<P, R, G = never> = { params: P; result: R; progress: G };

export type RequestMap = {
  ping: Op<{ sentAt: number }, { sentAt: number; handledAt: number }>;
  openFile: Op<{ file: File; sheet?: string }, OpenResult, OpenProgress>;
  // Lê de novo o arquivo atual com encoding, delimitador, cabeçalho ou aba escolhidos pelo usuário.
  reopen: Op<{ overrides: ParseOverrides; sheet?: string }, DatasetInfo, OpenProgress>;
  setView: Op<ViewSpec, { viewCount: number; viewVersion: number }>;
  getRows: Op<{ start: number; count: number }, { viewVersion: number; start: number; indices: number[]; rows: string[][] }>;
  search: Op<{ query: string }, { total: number; stored: number }>;
  getMatch: Op<{ index: number }, { position: number; column: number } | null>;
  summarize: Op<{ column: number; scope: ExportScope }, ColumnSummary>;
  checkExport: Op<{ options: CsvExportOptions; scope: ExportScope }, { unencodable: { char: string; count: number }[] }>;
  exportFile: Op<{ options: CsvExportOptions; scope: ExportScope; policy: UnencodablePolicy }, { bytes: Uint8Array }>;
};

export type RequestType = keyof RequestMap;
export type RequestParams<T extends RequestType> = RequestMap[T]["params"];
export type RequestResult<T extends RequestType> = RequestMap[T]["result"];
export type RequestProgress<T extends RequestType> = RequestMap[T]["progress"];

export type RequestMessage<T extends RequestType = RequestType> = {
  id: number;
  type: T;
  params: RequestParams<T>;
};

export type WorkerMessage =
  | { kind: "response"; id: number; ok: true; result: unknown }
  | { kind: "response"; id: number; ok: false; error: string }
  | { kind: "progress"; id: number; progress: unknown };

// Interface mínima comum a Worker, DedicatedWorkerGlobalScope e MessagePort.
export type MessageEndpoint = {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  addEventListener(type: "message", listener: (event: MessageEvent) => void): void;
};
