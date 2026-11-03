import { strToU8, Zip, ZipDeflate } from "fflate";
import type { Dataset, DateFormat, NumberFormat } from "../dataset";
import { numberShape, parseNumber } from "../parse/values";
import { parseDateParts } from "../transform/convert";

// Gerador de .xlsx próprio: escreve a planilha em pedaços direto num zip compactado.
// Montar a planilha inteira na memória (como faz o SheetJS) não cabe com centenas de
// milhares de linhas; assim o uso de memória fica perto do tamanho do arquivo final.

// Limite de linhas de uma planilha do Excel (incluindo o cabeçalho).
export const XLSX_MAX_ROWS = 1_048_576;
// Inteiros com mais dígitos que isso são identificadores (CPF, telefone, código): ficam
// como texto para o Excel não mostrar em notação científica nem perder zeros.
const MAX_NUMERIC_ID_DIGITS = 9;
// O Excel não aceita células com mais caracteres que isso.
const MAX_CELL_LENGTH = 32_767;
const MAX_WIDTH = 50;
const ROWS_PER_CHUNK = 2_000;

type Cell = { kind: "text"; value: string } | { kind: "number"; value: number; format: string };
type CellWriter = (value: string) => Cell;

const text = (value: string): Cell => ({ kind: "text", value });

// Como escrever cada coluna: números e datas viram células de verdade (o Excel soma e
// ordena); o resto vai como texto, exatamente como está.
function writerFor(dataset: Dataset, column: number, rows: Uint32Array | undefined): CellWriter {
  const info = dataset.columns[column]!;
  const count = rows ? rows.length : dataset.rows.length;
  const each = (test: (value: string) => boolean) => {
    for (let i = 0; i < count; i++) {
      const value = (dataset.rows[rows ? rows[i]! : i]![column] ?? "").trim();
      if (value !== "" && !test(value)) return false;
    }
    return true;
  };

  if (info.type === "number") {
    const format = info.format as NumberFormat;
    let decimals = 0;
    const ok = each((v) => {
      const shape = numberShape(v);
      if (shape === "none") return false;
      if (shape === "plain" && v.replace("-", "").length > MAX_NUMERIC_ID_DIGITS) return false;
      const separator = format === "us" ? "." : ",";
      const fraction = v.includes(separator) ? v.slice(v.lastIndexOf(separator) + 1).replace(/\D/g, "") : "";
      decimals = Math.max(decimals, fraction.length);
      return !Number.isNaN(parseNumber(v, format));
    });
    if (ok) {
      const z = decimals > 0 ? `#,##0.${"0".repeat(Math.min(decimals, 10))}` : format === "plain" ? "0" : "#,##0";
      return (v) => {
        const n = parseNumber(v, format);
        return Number.isNaN(n) ? text(v) : { kind: "number", value: n, format: z };
      };
    }
  }

  if (info.type === "date") {
    const format = info.format as DateFormat;
    let withTime = false;
    const ok = each((v) => {
      const parts = parseDateParts(v, format);
      if (parts?.time) withTime = true;
      return parts !== undefined;
    });
    if (ok) {
      const z = withTime ? "dd/mm/yyyy hh:mm" : "dd/mm/yyyy";
      return (v) => {
        const parts = parseDateParts(v, format);
        if (!parts) return text(v);
        const [h = 0, m = 0, s = 0] = (parts.time ? parts.time.split(":") : []).map(Number);
        // Número de série do Excel (dias desde 30/12/1899), calculado em UTC: a data
        // não muda com o fuso horário de quem exporta.
        const serial = Date.UTC(+parts.y, +parts.m - 1, +parts.d, h, m, s) / 86_400_000 + 25_569;
        return { kind: "number", value: serial, format: z };
      };
    }
  }

  return text;
}

export function sheetName(name: string): string {
  return name.replace(/[[\]:*?/\\]/g, " ").trim().slice(0, 31) || "Dados";
}

// Caracteres de controle não são permitidos em XML (exceto tab e quebras de linha).
const INVALID_XML = /[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g;

function escapeXml(value: string): string {
  return value
    .replace(INVALID_XML, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function columnLetter(index: number): string {
  let letters = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
  return letters;
}

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const NS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const NS_PKG_REL = "http://schemas.openxmlformats.org/package/2006/relationships";

const CONTENT_TYPES =
  XML_HEADER +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
  '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
  '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
  "</Types>";

const ROOT_RELS =
  XML_HEADER +
  `<Relationships xmlns="${NS_PKG_REL}">` +
  `<Relationship Id="rId1" Type="${NS_REL}/officeDocument" Target="xl/workbook.xml"/>` +
  "</Relationships>";

const WORKBOOK_RELS =
  XML_HEADER +
  `<Relationships xmlns="${NS_PKG_REL}">` +
  `<Relationship Id="rId1" Type="${NS_REL}/worksheet" Target="worksheets/sheet1.xml"/>` +
  `<Relationship Id="rId2" Type="${NS_REL}/styles" Target="styles.xml"/>` +
  "</Relationships>";

const workbookXml = (name: string) =>
  XML_HEADER +
  `<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}">` +
  `<sheets><sheet name="${escapeXml(sheetName(name))}" sheetId="1" r:id="rId1"/></sheets>` +
  "</workbook>";

// Um estilo por formato de número (o índice 0 é o padrão, sem formato).
function stylesXml(formats: readonly string[]): string {
  const numFmts = formats.map((code, i) => `<numFmt numFmtId="${164 + i}" formatCode="${escapeXml(code)}"/>`).join("");
  const xfs = formats.map((_, i) => `<xf numFmtId="${164 + i}" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>`).join("");
  return (
    XML_HEADER +
    `<styleSheet xmlns="${NS_MAIN}">` +
    (formats.length ? `<numFmts count="${formats.length}">${numFmts}</numFmts>` : "") +
    '<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>' +
    '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    `<cellXfs count="${formats.length + 1}"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>${xfs}</cellXfs>` +
    "</styleSheet>"
  );
}

export function buildXlsx(dataset: Dataset, name: string, rows?: Uint32Array): Uint8Array {
  const count = rows ? rows.length : dataset.rows.length;
  const header = dataset.meta.hasHeader ? 1 : 0;
  if (count + header > XLSX_MAX_ROWS) {
    throw new Error(`O Excel aceita até ${XLSX_MAX_ROWS.toLocaleString("pt-BR")} linhas por planilha. Divida o arquivo antes.`);
  }
  const width = dataset.columns.length;
  const writers = dataset.columns.map((_, c) => writerFor(dataset, c, rows));
  const letters = dataset.columns.map((_, c) => columnLetter(c));
  const formats: string[] = [];
  const styleOf = (format: string) => {
    let index = formats.indexOf(format);
    if (index < 0) index = formats.push(format) - 1;
    return index + 1;
  };

  // Larguras pelas primeiras linhas.
  const widths = dataset.columns.map((c) => Math.min(MAX_WIDTH, Math.max(8, c.name.length + 2)));
  for (let i = 0; i < Math.min(count, 200); i++) {
    const row = dataset.rows[rows ? rows[i]! : i]!;
    for (let c = 0; c < width; c++) widths[c] = Math.min(MAX_WIDTH, Math.max(widths[c]!, (row[c] ?? "").length + 2));
  }

  const chunks: Uint8Array[] = [];
  let failure: Error | undefined;
  const zip = new Zip((error, data) => {
    if (error) failure = error;
    else chunks.push(data);
  });
  const addFile = (path: string, content: string) => {
    const file = new ZipDeflate(path, { level: 6 });
    zip.add(file);
    file.push(strToU8(content), true);
  };

  const cellXml = (cell: Cell, ref: string) => {
    if (cell.kind === "number") return `<c r="${ref}" s="${styleOf(cell.format)}"><v>${cell.value}</v></c>`;
    const value = cell.value.length > MAX_CELL_LENGTH ? cell.value.slice(0, MAX_CELL_LENGTH) : cell.value;
    return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
  };

  const sheet = new ZipDeflate("xl/worksheets/sheet1.xml", { level: 6 });
  zip.add(sheet);
  const cols = widths.map((w, c) => `<col min="${c + 1}" max="${c + 1}" width="${w}" customWidth="1"/>`).join("");
  sheet.push(strToU8(`${XML_HEADER}<worksheet xmlns="${NS_MAIN}">${width ? `<cols>${cols}</cols>` : ""}<sheetData>`));

  let buffer = "";
  let excelRow = 0;
  if (header) {
    excelRow++;
    buffer += `<row r="1">${dataset.columns
      .map((c, i) => cellXml(text(dataset.meta.header[i] ?? c.name), `${letters[i]}1`))
      .join("")}</row>`;
  }
  for (let i = 0; i < count; i++) {
    const row = dataset.rows[rows ? rows[i]! : i]!;
    excelRow++;
    let xml = `<row r="${excelRow}">`;
    for (let c = 0; c < width; c++) {
      const value = row[c] ?? "";
      if (value !== "") xml += cellXml(writers[c]!(value), `${letters[c]}${excelRow}`);
    }
    buffer += `${xml}</row>`;
    if ((i + 1) % ROWS_PER_CHUNK === 0) {
      sheet.push(strToU8(buffer));
      buffer = "";
    }
  }
  sheet.push(strToU8(`${buffer}</sheetData></worksheet>`), true);

  addFile("[Content_Types].xml", CONTENT_TYPES);
  addFile("_rels/.rels", ROOT_RELS);
  addFile("xl/workbook.xml", workbookXml(name));
  addFile("xl/_rels/workbook.xml.rels", WORKBOOK_RELS);
  // Os estilos só são conhecidos depois de escrever as células.
  addFile("xl/styles.xml", stylesXml(formats));
  zip.end();
  if (failure) throw failure;

  const total = chunks.reduce((n, chunk) => n + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}
