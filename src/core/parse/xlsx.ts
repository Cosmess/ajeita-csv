import * as XLSX from "xlsx";

export type Workbook = XLSX.WorkBook;

export function readWorkbook(bytes: Uint8Array): Workbook {
  // dateNF: datas com o formato padrão do Excel aparecem como dd/mm/aaaa.
  return XLSX.read(bytes, { type: "array", dense: true, dateNF: "dd/mm/yyyy" });
}

// Lê os valores como texto formatado (cell.w), para não perder zeros à esquerda
// nem transformar datas em número serial.
export function readSheetRows(workbook: Workbook, sheetName: string): string[][] {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`Aba não encontrada: ${sheetName}`);
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "", blankrows: true });
  return rows.map((row) => row.map((value) => (value == null ? "" : String(value))));
}
