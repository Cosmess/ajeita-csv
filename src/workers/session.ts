import type { Dataset } from "../core/dataset";
import { encodeText, serializeCsv, unencodableChars, type CsvExportOptions } from "../core/export/csv";
import type { UnencodablePolicy } from "../core/export/windows1252";
import { countMojibakeCells } from "../core/fix/mojibake";
import { countProblems, findProblems, rowToText, type Problem } from "../core/fix/problems";
import { emptyHistory, execute, redo, undo, type History } from "../core/history";
import { NormalizedColumns } from "../core/inspect/normalize";
import { searchCells, type SearchResult } from "../core/inspect/search";
import { summarizeColumn } from "../core/inspect/summary";
import { allIndices, buildView, type ViewSpec } from "../core/inspect/view";
import { planOp, type Op, type Plan } from "../core/ops";
import { zipSync } from "fflate";
import Papa from "papaparse";
import { clipboardText } from "../core/export/clipboard";
import { buildXlsx } from "../core/export/xlsx";
import { mergeDatasets, mergedColumns, summarizeMerge, type MergeFileSummary, type MergeInput } from "../core/files/merge";
import { planSplit, type SplitMode } from "../core/files/split";
import { arrayFields, parseJsonRecords } from "../core/create/json";
import { generateSql, inferSqlColumns, type SqlOptions } from "../core/create/sql";
import {
  buildDataset,
  parseCsvBytes,
  tableFromCreated,
  tableFromJson,
  tableFromRows,
  type ParseOverrides,
  type RawTable,
} from "../core/parse";
import { detectHeader } from "../core/parse/header";
import { readSheetRows, readWorkbook, type Workbook } from "../core/parse/xlsx";
import { previewPlan, type Preview } from "../core/preview";
import { indexedDbStore, type SessionStore, type SessionSummary } from "../storage/session";
import { countInvalid, type ValidationRule } from "../core/validate";
import { suggestColumns, type ColumnSuggestion } from "../core/transform/anonymize";
import type { DatasetInfo, ExportScope, OpenProgress, OpenResult, ProblemItem } from "./protocol";

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];
const EMPTY_VIEW: ViewSpec = { sort: [], filters: [] };

const isJson = (fileName: string) => /\.json$/i.test(fileName);

function isXlsx(fileName: string, bytes: Uint8Array): boolean {
  return /\.xlsx$/i.test(fileName) || ZIP_MAGIC.every((byte, i) => bytes[i] === byte);
}

function previewFrom(rows: string[][]): NonNullable<OpenProgress["preview"]> {
  const hasHeader = detectHeader(rows);
  const data = hasHeader ? rows.slice(1) : rows;
  const width = Math.max(rows[0]?.length ?? 0, ...data.map((row) => row.length));
  const header = hasHeader ? (rows[0] ?? []) : [];
  const columns = Array.from({ length: width }, (_, i) => (header[i]?.trim() ? header[i]! : `Coluna ${i + 1}`));
  return { columns, rows: data };
}

export type SessionOptions = {
  store?: SessionStore;
  // Espera depois da última alteração antes de salvar (ms).
  saveDelay?: number;
};

// Estado do arquivo aberto. Vive inteiro dentro do worker; a UI só pede
// as linhas visíveis e os resultados de cada operação.
export class WorkerSession {
  private file?: File;
  private workbook?: Workbook;
  private dataset?: Dataset;
  // Campos de array do JSON aberto (para escolher "uma linha por item").
  private jsonArrays: string[] = [];
  private history: History = emptyHistory();
  private viewSpec: ViewSpec = EMPTY_VIEW;
  private normalized?: NormalizedColumns;
  private view: Uint32Array = new Uint32Array(0);
  private version = 0;
  private problems: Problem[] = [];
  private mojibakeCells = 0;
  private searchResult?: SearchResult;
  private exportCache?: { key: string; text: string };
  // Plano da última prévia: aplicar a mesma operação logo depois não calcula de novo.
  private previewed?: { key: string; version: number; plan: Plan };
  private saveTimer?: ReturnType<typeof setTimeout>;
  private pendingSave?: Promise<void>;
  private readonly store: SessionStore;
  private readonly saveDelay: number;

  constructor(options: SessionOptions = {}) {
    this.store = options.store ?? indexedDbStore;
    this.saveDelay = options.saveDelay ?? 2000;
  }

  // --- Abrir e reler ---------------------------------------------------------

  async open(file: File, sheet: string | undefined, progress: (p: OpenProgress) => void): Promise<OpenResult> {
    this.file = file;
    this.workbook = undefined;
    const bytes = new Uint8Array(await file.arrayBuffer());

    if (isJson(file.name)) {
      progress({ fraction: 0.1 });
      this.load(this.jsonTable(await file.text(), undefined));
      return { status: "opened", info: this.info() };
    }

    if (isXlsx(file.name, bytes)) {
      progress({ fraction: 0.1 });
      this.workbook = readWorkbook(bytes);
      const sheets = this.workbook.SheetNames;
      if (sheets.length > 1 && !sheet) return { status: "choose-sheet", sheets };
      this.load(this.sheetTable(sheet ?? sheets[0]!, {}));
      return { status: "opened", info: this.info() };
    }

    this.load(this.parseCsv(bytes, {}, progress));
    return { status: "opened", info: this.info() };
  }

  // Lê o arquivo de novo com outro encoding, separador ou aba. As alterações feitas são descartadas.
  async reopen(overrides: ParseOverrides, sheet: string | undefined, progress: (p: OpenProgress) => void): Promise<DatasetInfo> {
    const current = this.requireDataset().meta;
    const file = this.requireFile();
    const keep = { hasHeader: overrides.hasHeader ?? current.hasHeader };

    if (current.source === "json") {
      this.load(this.jsonTable(await file.text(), overrides.explode ?? current.explode));
      return this.info();
    }

    if (current.source === "created") throw new Error("Dados criados no painel não podem ser relidos");

    if (current.source === "xlsx") {
      this.workbook ??= readWorkbook(new Uint8Array(await file.arrayBuffer()));
      const target = sheet ?? current.sheet ?? this.workbook.SheetNames[0]!;
      this.load(this.sheetTable(target, target === current.sheet ? keep : {}));
      return this.info();
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    this.load(
      this.parseCsv(
        bytes,
        {
          encoding: overrides.encoding ?? current.encoding,
          delimiter: overrides.delimiter ?? current.delimiter,
          ...keep,
        },
        progress,
      ),
    );
    return this.info();
  }

  // --- Criar ------------------------------------------------------------------

  // Grade vazia, texto ou tabela da página: os dados viram um CSV em memória, que
  // é o "arquivo" da sessão (para salvar e exportar como qualquer outro).
  createFromRows(name: string, rows: string[][], hasHeader: boolean): DatasetInfo {
    if (rows.length === 0) throw new Error("Não há dados para criar a planilha");
    this.file = new File([Papa.unparse(rows, { escapeFormulae: false })], name, { type: "text/csv" });
    this.workbook = undefined;
    this.load(tableFromCreated(rows, hasHeader));
    return this.info();
  }

  createBlank(columns: number, rows: number): DatasetInfo {
    const header = Array.from({ length: columns }, (_, i) => `Coluna ${i + 1}`);
    const empty = Array.from({ length: rows }, () => Array<string>(columns).fill(""));
    return this.createFromRows("nova-planilha.csv", [header, ...empty], true);
  }

  createFromJson(name: string, text: string): DatasetInfo {
    const table = this.jsonTable(text, undefined);
    this.file = new File([text], name, { type: "application/json" });
    this.workbook = undefined;
    this.load(table);
    return this.info();
  }

  // --- Outras exportações ---------------------------------------------------------

  exportXlsx(scope: ExportScope): Uint8Array {
    const base = (this.file?.name ?? "dados").replace(/\.[^.]+$/, "");
    return buildXlsx(this.requireDataset(), base, scope === "view" ? this.view : undefined);
  }

  copyText(scope: ExportScope): string {
    return clipboardText(this.requireDataset(), scope === "view" ? this.view : undefined);
  }

  // --- Dividir e juntar ---------------------------------------------------------

  previewSplit(split: SplitMode, options: CsvExportOptions, scope: ExportScope) {
    const dataset = this.requireDataset();
    const parts = this.splitParts(split, options, scope);
    // Tamanho estimado pela média das primeiras linhas.
    const sample = (scope === "view" ? this.view : allIndices(dataset.rows.length)).subarray(0, 200);
    const perRow = sample.length ? serializeCsv(dataset, options, sample).length / sample.length : 0;
    const rows = parts.reduce((n, p) => n + p.rows.length, 0);
    return {
      total: parts.length,
      parts: parts.slice(0, 20).map((p) => ({ name: p.name, rows: p.rows.length })),
      estimatedBytes: Math.round(perRow * rows),
    };
  }

  exportSplit(split: SplitMode, options: CsvExportOptions, scope: ExportScope, policy: UnencodablePolicy): Uint8Array {
    const dataset = this.requireDataset();
    const files: Record<string, Uint8Array> = {};
    for (const part of this.splitParts(split, options, scope)) {
      files[part.name] = encodeText(serializeCsv(dataset, options, part.rows), options.encoding, policy);
    }
    return zipSync(files, { level: 6 });
  }

  async previewMerge(files: File[]): Promise<{ files: MergeFileSummary[]; columns: string[] }> {
    const inputs = await this.readInputs(files);
    return { files: summarizeMerge(inputs), columns: mergedColumns(inputs) };
  }

  async mergeFiles(files: File[], addSource: boolean): Promise<DatasetInfo> {
    const rows = mergeDatasets(await this.readInputs(files), addSource);
    return this.createFromRows("arquivos-juntados.csv", rows, true);
  }

  // --- SQL --------------------------------------------------------------------

  previewSql(options: SqlOptions, scope: ExportScope): { text: string; columns: { name: string; type: string }[] } {
    const dataset = this.requireDataset();
    const rows = scope === "view" ? this.view : undefined;
    // Prévia com as primeiras linhas: rápida mesmo em arquivos grandes.
    const sample = (rows ?? allIndices(dataset.rows.length)).subarray(0, 5);
    const text = generateSql(dataset, options, sample, this.file?.name);
    const columns = inferSqlColumns(dataset, options, rows).map((c) => ({
      name: c.name,
      type: c.type.kind === "decimal" ? `decimal(${c.type.precision}, ${c.type.scale})` : c.type.kind === "text" ? `texto até ${c.type.length}` : c.type.kind,
    }));
    return { text, columns };
  }

  exportSql(options: SqlOptions, scope: ExportScope): Uint8Array {
    const dataset = this.requireDataset();
    const text = generateSql(dataset, options, scope === "view" ? this.view : undefined, this.file?.name);
    return new TextEncoder().encode(text);
  }

  // --- Alterações com desfazer -----------------------------------------------

  preview(op: Op): Preview {
    const dataset = this.requireDataset();
    const plan = planOp(dataset, op);
    this.previewed = { key: JSON.stringify(op), version: this.version, plan };
    return previewPlan(dataset, plan);
  }

  execute(op: Op): DatasetInfo {
    const previewed = this.previewed;
    this.previewed = undefined;
    const plan = previewed?.version === this.version && previewed.key === JSON.stringify(op) ? previewed.plan : undefined;
    const result = execute(this.requireDataset(), this.history, op, plan);
    // Depois de aplicar a ordenação, os dados já estão na ordem; a visualização não reordena de novo.
    if (op.op === "applySort") this.viewSpec = { ...this.viewSpec, sort: [] };
    this.change(result.dataset, result.history);
    return this.info();
  }

  undo(): DatasetInfo {
    const result = undo(this.requireDataset(), this.history);
    if (result) this.change(result.dataset, result.history);
    return this.info();
  }

  redo(): DatasetInfo {
    const result = redo(this.requireDataset(), this.history);
    if (result) this.change(result.dataset, result.history);
    return this.info();
  }

  // --- Problemas -------------------------------------------------------------

  getProblems(offset: number, limit: number): { total: number; items: ProblemItem[] } {
    const dataset = this.requireDataset();
    return {
      total: this.problems.length,
      items: this.problems.slice(offset, offset + limit).map((problem) => ({
        ...problem,
        text: rowToText(dataset.rows[problem.row]!, dataset.meta.delimiter),
      })),
    };
  }

  // Posição de uma linha dos dados na visualização atual (-1 se um filtro a esconde).
  locateRow(row: number): number {
    return this.view.indexOf(row);
  }

  // --- Visualização ----------------------------------------------------------

  setView(spec: ViewSpec): { viewCount: number; viewVersion: number } {
    this.viewSpec = spec;
    this.rebuildView();
    this.bump();
    return { viewCount: this.view.length, viewVersion: this.version };
  }

  getRows(start: number, count: number) {
    const dataset = this.requireDataset();
    const indices = Array.from(this.view.subarray(start, start + count));
    return { viewVersion: this.version, start, indices, rows: indices.map((i) => dataset.rows[i]!) };
  }

  search(query: string): { total: number; stored: number } {
    this.searchResult = searchCells(this.requireDataset(), this.view, query, this.normalized!);
    return { total: this.searchResult.total, stored: this.searchResult.matches.length / 2 };
  }

  getMatch(index: number): { position: number; column: number } | null {
    const matches = this.searchResult?.matches;
    if (!matches || index < 0 || index * 2 >= matches.length) return null;
    return { position: matches[index * 2]!, column: matches[index * 2 + 1]! };
  }

  summarize(column: number, scope: ExportScope, rule?: ValidationRule) {
    return summarizeColumn(this.requireDataset(), column, scope === "view" ? this.view : undefined, rule);
  }

  countInvalid(column: number, rule: ValidationRule): number {
    return countInvalid(this.requireDataset().rows, column, rule);
  }

  // --- Exportação ------------------------------------------------------------

  checkExport(options: CsvExportOptions, scope: ExportScope) {
    return { unencodable: unencodableChars(this.exportText(options, scope), options.encoding) };
  }

  exportFile(options: CsvExportOptions, scope: ExportScope, policy: UnencodablePolicy): Uint8Array {
    const bytes = encodeText(this.exportText(options, scope), options.encoding, policy);
    this.exportCache = undefined;
    return bytes;
  }

  // --- Sessão salva ----------------------------------------------------------

  savedSession(): Promise<SessionSummary | undefined> {
    return this.store.summary();
  }

  async restore(): Promise<DatasetInfo> {
    const saved = await this.store.load();
    if (!saved) throw new Error("Não há sessão salva");
    this.file = new File([saved.file], saved.fileName);
    this.workbook = undefined;
    this.jsonArrays = saved.dataset.meta.source === "json" ? arrayFields(parseJsonRecords(await this.file.text())) : [];
    this.viewSpec = saved.view;
    this.change(saved.dataset, saved.history, false);
    return this.info();
  }

  async discardSaved(): Promise<void> {
    clearTimeout(this.saveTimer);
    this.saveTimer = undefined;
    await this.pendingSave?.catch(() => {});
    await this.store.clear();
  }

  anonymizeSuggestions(): ColumnSuggestion[] {
    return suggestColumns(this.requireDataset());
  }

  // Volta ao início: esquece o arquivo aberto e apaga a sessão salva.
  async close(): Promise<void> {
    await this.discardSaved();
    this.file = undefined;
    this.workbook = undefined;
    this.dataset = undefined;
    this.jsonArrays = [];
    this.history = emptyHistory();
    this.viewSpec = EMPTY_VIEW;
    this.normalized = undefined;
    this.view = new Uint32Array(0);
    this.problems = [];
    this.mojibakeCells = 0;
    this.searchResult = undefined;
    this.bump();
  }

  // Salva já, sem esperar (usado nos testes e ao fechar).
  async flush(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = undefined;
      this.pendingSave = this.save();
    }
    await this.pendingSave;
  }

  // --- Internos --------------------------------------------------------------

  private load(table: RawTable): void {
    this.viewSpec = EMPTY_VIEW;
    this.change(buildDataset(table), emptyHistory());
  }

  private change(dataset: Dataset, history: History, persist = true): void {
    // Filtros e ordenação apontam colunas pela posição: se as colunas mudaram, deixam de valer.
    const columnsKey = (d: Dataset) => d.columns.map((c) => c.name).join("\u0000");
    if (this.dataset && persist && columnsKey(this.dataset) !== columnsKey(dataset)) this.viewSpec = EMPTY_VIEW;
    this.dataset = dataset;
    this.history = history;
    this.normalized = new NormalizedColumns(dataset);
    this.problems = findProblems(dataset);
    this.mojibakeCells = countMojibakeCells(dataset);
    this.searchResult = undefined;
    this.rebuildView();
    this.bump();
    if (persist) this.scheduleSave();
  }

  private rebuildView(): void {
    const dataset = this.requireDataset();
    const width = dataset.columns.length;
    // Colunas que deixaram de existir saem da ordenação e dos filtros.
    this.viewSpec = {
      sort: this.viewSpec.sort.filter((key) => key.column < width),
      filters: this.viewSpec.filters.filter((filter) => filter.column < width),
    };
    const { sort, filters } = this.viewSpec;
    this.view =
      sort.length === 0 && filters.length === 0
        ? allIndices(dataset.rows.length)
        : buildView(dataset, this.viewSpec, this.normalized!);
  }

  private scheduleSave(): void {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = undefined;
      this.pendingSave = this.save();
    }, this.saveDelay);
  }

  private async save(): Promise<void> {
    if (!this.dataset || !this.file) return;
    try {
      await this.store.save({
        savedAt: Date.now(),
        fileName: this.file.name,
        file: this.file,
        dataset: this.dataset,
        history: this.history,
        view: this.viewSpec,
      });
    } catch {
      // Sem espaço ou IndexedDB indisponível: o trabalho continua, só não é salvo.
    }
  }

  private exportText(options: CsvExportOptions, scope: ExportScope): string {
    const key = JSON.stringify({ options, scope, version: this.version });
    if (this.exportCache?.key !== key) {
      const text = serializeCsv(this.requireDataset(), options, scope === "view" ? this.view : undefined);
      this.exportCache = { key, text };
    }
    return this.exportCache.text;
  }

  private parseCsv(bytes: Uint8Array, overrides: ParseOverrides, progress: (p: OpenProgress) => void): RawTable {
    let fraction = 0;
    return parseCsvBytes(bytes, overrides, {
      onProgress: (value) => {
        fraction = value;
        progress({ fraction });
      },
      onPreview: (rows) => progress({ fraction, preview: previewFrom(rows) }),
    });
  }

  private splitParts(split: SplitMode, options: CsvExportOptions, scope: ExportScope) {
    const base = (this.file?.name ?? "dados").replace(/\.[^.]+$/, "");
    const extension = options.delimiter === "\t" ? "tsv" : "csv";
    return planSplit(this.requireDataset(), split, base, extension, scope === "view" ? this.view : undefined);
  }

  // Lê arquivos avulsos (para juntar) sem mexer no arquivo aberto. Planilha: primeira aba.
  private async readInputs(files: File[]): Promise<MergeInput[]> {
    const inputs: MergeInput[] = [];
    for (const file of files) {
      try {
        let table: RawTable;
        if (isJson(file.name)) table = tableFromJson(await file.text());
        else {
          const bytes = new Uint8Array(await file.arrayBuffer());
          if (isXlsx(file.name, bytes)) {
            const workbook = readWorkbook(bytes);
            table = tableFromRows(readSheetRows(workbook, workbook.SheetNames[0]!), { sheet: workbook.SheetNames[0] });
          } else table = parseCsvBytes(bytes);
        }
        inputs.push({ name: file.name, dataset: buildDataset(table) });
      } catch (error) {
        throw new Error(`Não foi possível ler "${file.name}": ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return inputs;
  }

  private jsonTable(text: string, explode: string | undefined): RawTable {
    this.jsonArrays = arrayFields(parseJsonRecords(text));
    return tableFromJson(text, explode);
  }

  private sheetTable(sheet: string, overrides: ParseOverrides): RawTable {
    return tableFromRows(readSheetRows(this.workbook!, sheet), { ...overrides, sheet });
  }

  private bump(): void {
    this.version++;
    this.previewed = undefined;
    this.exportCache = undefined;
  }

  private info(): DatasetInfo {
    const dataset = this.requireDataset();
    return {
      fileName: this.file?.name ?? "",
      columns: dataset.columns,
      rowCount: dataset.rows.length,
      meta: dataset.meta,
      sheets: this.workbook?.SheetNames ?? (dataset.meta.sheet ? [dataset.meta.sheet] : []),
      viewVersion: this.version,
      view: this.viewSpec,
      viewCount: this.view.length,
      problems: countProblems(this.problems),
      problemRows: this.problems.length,
      mojibakeCells: this.mojibakeCells,
      jsonArrays: dataset.meta.source === "json" ? this.jsonArrays : [],
      undo: this.history.done.at(-1)?.label,
      redo: this.history.undone.at(-1)?.label,
    };
  }

  private requireFile(): File {
    if (!this.file) throw new Error("Nenhum arquivo aberto");
    return this.file;
  }

  private requireDataset(): Dataset {
    if (!this.dataset) throw new Error("Nenhum arquivo aberto");
    return this.dataset;
  }
}
