import Papa from "papaparse";
import type { Dataset } from "../dataset";

// Texto no formato que o Excel e o Google Sheets entendem ao colar: tabulação entre
// colunas e quebra de linha entre linhas. Células com tabulação, aspas ou quebra de
// linha vão entre aspas. Os valores vão como estão (1.234,56 cola certo em pt-BR).
export function clipboardText(dataset: Dataset, rows?: Uint32Array): string {
  const count = rows ? rows.length : dataset.rows.length;
  const data: string[][] = [];
  if (dataset.meta.hasHeader) data.push(dataset.meta.header);
  for (let i = 0; i < count; i++) data.push(dataset.rows[rows ? rows[i]! : i]!);
  return Papa.unparse(data, { delimiter: "\t", newline: "\r\n", escapeFormulae: false });
}
