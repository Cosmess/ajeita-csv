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
import { planOp, type Op } from "../core/ops";
import { buildDataset, parseCsvBytes, tableFromRows, type ParseOverrides, type RawTable } from "../core/parse";
import { detectHeader } from "../core/parse/header";
import { readSheetRows, readWorkbook, type Workbook } from "../core/parse/xlsx";
import { previewPlan, type Preview } from "../core/preview";
import { indexedDbStore, type SessionStore, type SessionSummary } from "../storage/session";
import { countInvalid, type ValidationRule } from "../core/validate";
import type { DatasetInfo, ExportScope, OpenProgress, OpenResult, ProblemItem } from "./protocol";

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];
const EMPTY_VIEW: ViewSpec = { sort: [], filters: [] };

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
  private history: History = emptyHistory();
  private viewSpec: ViewSpec = EMPTY_VIEW;
  private normalized?: NormalizedColumns;
  private view: Uint32Array = new Uint32Array(0);
  private version = 0;
  private problems: Problem[] = [];
  private mojibakeCells = 0;
  private searchResult?: SearchResult;
  private exportCache?: { key: string; text: string };
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

  // --- Alterações com desfazer -----------------------------------------------

  preview(op: Op): Preview {
    const dataset = this.requireDataset();
    return previewPlan(dataset, planOp(dataset, op));
  }

  execute(op: Op): DatasetInfo {
    const result = execute(this.requireDataset(), this.history, op);
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

  private sheetTable(sheet: string, overrides: ParseOverrides): RawTable {
    return tableFromRows(readSheetRows(this.workbook!, sheet), { ...overrides, sheet });
  }

  private bump(): void {
    this.version++;
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
