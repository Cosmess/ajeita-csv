import type { Dataset } from "../core/dataset";
import { encodeText, serializeCsv, unencodableChars, type CsvExportOptions } from "../core/export/csv";
import type { UnencodablePolicy } from "../core/export/windows1252";
import { NormalizedColumns } from "../core/inspect/normalize";
import { searchCells, type SearchResult } from "../core/inspect/search";
import { summarizeColumn } from "../core/inspect/summary";
import { allIndices, buildView, type ViewSpec } from "../core/inspect/view";
import { buildDataset, parseCsvBytes, tableFromRows, type ParseOverrides, type RawTable } from "../core/parse";
import { detectHeader } from "../core/parse/header";
import { readSheetRows, readWorkbook, type Workbook } from "../core/parse/xlsx";
import type { DatasetInfo, ExportScope, OpenProgress, OpenResult } from "./protocol";

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

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

// Estado do arquivo aberto. Vive inteiro dentro do worker; a UI só pede
// as linhas visíveis e os resultados de cada operação.
export class WorkerSession {
  private file?: File;
  private workbook?: Workbook;
  private table?: RawTable;
  private dataset?: Dataset;
  private normalized?: NormalizedColumns;
  private view: Uint32Array = new Uint32Array(0);
  private version = 0;
  private searchResult?: SearchResult;
  private exportCache?: { key: string; text: string };

  async open(file: File, sheet: string | undefined, progress: (p: OpenProgress) => void): Promise<OpenResult> {
    this.file = file;
    this.workbook = undefined;
    const bytes = new Uint8Array(await file.arrayBuffer());

    if (isXlsx(file.name, bytes)) {
      progress({ fraction: 0.1 });
      this.workbook = readWorkbook(bytes);
      const sheets = this.workbook.SheetNames;
      if (sheets.length > 1 && !sheet) return { status: "choose-sheet", sheets };
      return { status: "opened", info: this.loadSheet(sheet ?? sheets[0]!, {}) };
    }

    this.setTable(this.parseCsv(bytes, {}, progress));
    return { status: "opened", info: this.info() };
  }

  async reopen(overrides: ParseOverrides, sheet: string | undefined, progress: (p: OpenProgress) => void): Promise<DatasetInfo> {
    const table = this.requireTable();
    const current = table.meta;

    if (this.workbook) {
      const target = sheet ?? current.sheet ?? this.workbook.SheetNames[0]!;
      const keepHeader = target === current.sheet ? current.hasHeader : undefined;
      return this.loadSheet(target, { hasHeader: overrides.hasHeader ?? keepHeader });
    }

    const onlyHeader =
      (overrides.encoding ?? current.encoding) === current.encoding &&
      (overrides.delimiter ?? current.delimiter) === current.delimiter;
    if (onlyHeader) {
      // Trocar o cabeçalho não exige ler o arquivo de novo.
      this.setTable({ rows: table.rows, meta: { ...current, hasHeader: overrides.hasHeader ?? current.hasHeader } });
      return this.info();
    }

    const bytes = new Uint8Array(await this.file!.arrayBuffer());
    this.setTable(
      this.parseCsv(
        bytes,
        {
          encoding: overrides.encoding ?? current.encoding,
          delimiter: overrides.delimiter ?? current.delimiter,
          hasHeader: overrides.hasHeader,
        },
        progress,
      ),
    );
    return this.info();
  }

  setView(spec: ViewSpec): { viewCount: number; viewVersion: number } {
    const dataset = this.requireDataset();
    this.view = buildView(dataset, spec, this.normalized!);
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

  summarize(column: number, scope: ExportScope) {
    return summarizeColumn(this.requireDataset(), column, scope === "view" ? this.view : undefined);
  }

  checkExport(options: CsvExportOptions, scope: ExportScope) {
    return { unencodable: unencodableChars(this.exportText(options, scope), options.encoding) };
  }

  exportFile(options: CsvExportOptions, scope: ExportScope, policy: UnencodablePolicy): Uint8Array {
    const bytes = encodeText(this.exportText(options, scope), options.encoding, policy);
    this.exportCache = undefined;
    return bytes;
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

  private loadSheet(sheet: string, overrides: ParseOverrides): DatasetInfo {
    const rows = readSheetRows(this.workbook!, sheet);
    this.setTable(tableFromRows(rows, { ...overrides, sheet }));
    return this.info();
  }

  private setTable(table: RawTable): void {
    this.table = table;
    this.dataset = buildDataset(table);
    this.normalized = new NormalizedColumns(this.dataset);
    this.view = allIndices(this.dataset.rows.length);
    this.searchResult = undefined;
    this.bump();
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
      sheets: this.workbook?.SheetNames ?? [],
      viewVersion: this.version,
    };
  }

  private requireTable(): RawTable {
    if (!this.table) throw new Error("Nenhum arquivo aberto");
    return this.table;
  }

  private requireDataset(): Dataset {
    if (!this.dataset) throw new Error("Nenhum arquivo aberto");
    return this.dataset;
  }
}
