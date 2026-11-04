// Contrato das mensagens trocadas entre a UI e o worker.
// Cada operação declara seus parâmetros, seu resultado e, se tiver, seu progresso.
import type { Column, ParseMeta } from "../core/dataset";
import type { CsvExportOptions } from "../core/export/csv";
import type { UnencodablePolicy } from "../core/export/windows1252";
import type { Problem, ProblemKind } from "../core/fix/problems";
import type { ColumnSummary } from "../core/inspect/summary";
import type { ViewSpec } from "../core/inspect/view";
import type { Op as DataOp } from "../core/ops";
import type { ParseOverrides } from "../core/parse";
import type { Preview } from "../core/preview";
import type { SessionSummary } from "../storage/session";
import type { ValidationRule } from "../core/validate";
import type { SqlOptions } from "../core/create/sql";
import type { MergeFileSummary } from "../core/files/merge";
import type { SplitMode } from "../core/files/split";
import type { ColumnSuggestion } from "../core/transform/anonymize";

export type DatasetInfo = {
  fileName: string;
  columns: Column[];
  rowCount: number;
  meta: ParseMeta;
  // Abas do .xlsx aberto; vazio para CSV.
  sheets: string[];
  // Muda a cada alteração nos dados ou na visualização; a UI descarta linhas de versões antigas.
  viewVersion: number;
  view: ViewSpec;
  viewCount: number;
  // Quantas linhas têm cada tipo de problema, e quantas têm algum.
  problems: Record<ProblemKind, number>;
  problemRows: number;
  mojibakeCells: number;
  // JSON: campos de array que podem virar uma linha por item.
  jsonArrays: string[];
  // Descrição do passo que seria desfeito ou refeito.
  undo?: string;
  redo?: string;
};

export type ProblemItem = Problem & { text: string };

export type OpenProgress = {
  fraction: number;
  // Primeiras linhas, enviadas uma vez, para mostrar a grade antes do fim da leitura.
  preview?: { columns: string[]; rows: string[][] };
};

export type OpenResult = { status: "opened"; info: DatasetInfo } | { status: "choose-sheet"; sheets: string[] };

export type ExportScope = "all" | "view";

// Operação de alteração nos dados (desfazível), do núcleo.
export type Operation = DataOp;

type Rpc<P, R, G = never> = { params: P; result: R; progress: G };

export type RequestMap = {
  ping: Rpc<{ sentAt: number }, { sentAt: number; handledAt: number }>;
  openFile: Rpc<{ file: File; sheet?: string }, OpenResult, OpenProgress>;
  // Lê de novo o arquivo atual com encoding, delimitador ou aba escolhidos pelo usuário.
  reopen: Rpc<{ overrides: ParseOverrides; sheet?: string }, DatasetInfo, OpenProgress>;
  preview: Rpc<{ op: Operation }, Preview>;
  execute: Rpc<{ op: Operation }, DatasetInfo>;
  undo: Rpc<Record<string, never>, DatasetInfo>;
  redo: Rpc<Record<string, never>, DatasetInfo>;
  getProblems: Rpc<{ offset: number; limit: number }, { total: number; items: ProblemItem[] }>;
  locateRow: Rpc<{ row: number }, number>;
  savedSession: Rpc<Record<string, never>, SessionSummary | null>;
  restore: Rpc<Record<string, never>, DatasetInfo>;
  discardSaved: Rpc<Record<string, never>, void>;
  close: Rpc<Record<string, never>, void>;
  // Anonimizar: tipo de dado sugerido por coluna e chave derivada de uma senha.
  anonymizeSuggestions: Rpc<Record<string, never>, ColumnSuggestion[]>;
  anonymizeKey: Rpc<{ password: string }, string>;
  setView: Rpc<ViewSpec, { viewCount: number; viewVersion: number }>;
  getRows: Rpc<{ start: number; count: number }, { viewVersion: number; start: number; indices: number[]; rows: string[][] }>;
  search: Rpc<{ query: string }, { total: number; stored: number }>;
  getMatch: Rpc<{ index: number }, { position: number; column: number } | null>;
  summarize: Rpc<{ column: number; scope: ExportScope; rule?: ValidationRule }, ColumnSummary>;
  countInvalid: Rpc<{ column: number; rule: ValidationRule }, number>;
  createBlank: Rpc<{ columns: number; rows: number }, DatasetInfo>;
  createFromRows: Rpc<{ name: string; rows: string[][]; hasHeader: boolean }, DatasetInfo>;
  createFromJson: Rpc<{ name: string; text: string }, DatasetInfo>;
  previewSql: Rpc<{ options: SqlOptions; scope: ExportScope }, { text: string; columns: { name: string; type: string }[] }>;
  exportSql: Rpc<{ options: SqlOptions; scope: ExportScope }, { bytes: Uint8Array }>;
  exportXlsx: Rpc<{ scope: ExportScope }, { bytes: Uint8Array }>;
  copyText: Rpc<{ scope: ExportScope }, string>;
  previewSplit: Rpc<
    { split: SplitMode; options: CsvExportOptions; scope: ExportScope },
    { total: number; parts: { name: string; rows: number }[]; estimatedBytes: number }
  >;
  exportSplit: Rpc<{ split: SplitMode; options: CsvExportOptions; scope: ExportScope; policy: UnencodablePolicy }, { bytes: Uint8Array }>;
  previewMerge: Rpc<{ files: File[] }, { files: MergeFileSummary[]; columns: string[] }>;
  mergeFiles: Rpc<{ files: File[]; addSource: boolean }, DatasetInfo>;
  // Salva a sessão agora, sem esperar (antes de uma operação que pode travar o worker).
  flush: Rpc<Record<string, never>, void>;
  checkExport: Rpc<{ options: CsvExportOptions; scope: ExportScope }, { unencodable: { char: string; count: number }[] }>;
  exportFile: Rpc<{ options: CsvExportOptions; scope: ExportScope; policy: UnencodablePolicy }, { bytes: Uint8Array }>;
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
