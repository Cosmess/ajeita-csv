import Papa from "papaparse";
import type { Delimiter, ParseIssue } from "../dataset";

export type CsvParseCallbacks = {
  // Fração do texto já processada (0 a 1).
  onProgress?: (fraction: number) => void;
  // Chamado uma vez, com as primeiras linhas, para mostrar a grade antes do fim.
  onPreview?: (rows: string[][]) => void;
};

export type CsvParseResult = { rows: string[][]; issues: ParseIssue[] };

const CHUNK_SIZE = 1024 * 1024;
const PREVIEW_ROWS = 200;

export function parseCsvText(text: string, delimiter: Delimiter, callbacks: CsvParseCallbacks = {}): CsvParseResult {
  const rows: string[][] = [];
  const issues: ParseIssue[] = [];
  let previewSent = false;

  // O PapaParse aceita `chunk` com texto (processa de forma síncrona), mas os tipos
  // só preveem isso para arquivos; daí o cast.
  const config = {
    delimiter,
    chunkSize: CHUNK_SIZE,
    skipEmptyLines: false,
    chunk(results: Papa.ParseResult<string[]>) {
      const offset = rows.length;
      for (const row of results.data) rows.push(row);
      for (const error of results.errors) {
        if (error.code === "MissingQuotes" || error.code === "InvalidQuotes") {
          issues.push({
            row: offset + (error.row ?? 0),
            kind: "unclosed_quote",
            message: "Aspas não fechadas",
          });
        }
      }
      if (!previewSent && callbacks.onPreview) {
        previewSent = true;
        callbacks.onPreview(rows.slice(0, PREVIEW_ROWS));
      }
      callbacks.onProgress?.(text.length ? results.meta.cursor / text.length : 1);
    },
  };
  Papa.parse<string[]>(text, config as unknown as Papa.ParseConfig<string[]>);

  // Uma quebra de linha no fim do arquivo não é uma linha de dados.
  const last = rows.at(-1);
  if (last && last.length === 1 && last[0] === "") rows.pop();

  return { rows, issues };
}
