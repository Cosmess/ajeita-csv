import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { Dataset } from "../../src/core/dataset";
import { EXPORT_PRESETS, encodeText, serializeCsv } from "../../src/core/export/csv";
import { NormalizedColumns } from "../../src/core/inspect/normalize";
import { searchCells } from "../../src/core/inspect/search";
import { summarizeColumn } from "../../src/core/inspect/summary";
import { allIndices, buildView } from "../../src/core/inspect/view";
import { buildDataset, parseCsvBytes } from "../../src/core/parse";
import { planOp, type Op } from "../../src/core/ops";
import { applyPatch } from "../../src/core/patch";
import { previewPlan } from "../../src/core/preview";

const FILE = join(__dirname, "..", "fixtures", "generated", "referencia.csv");
// Metas do CLAUDE.md, com 20% de tolerância.
const TOLERANCE = 1.2;
const seconds = (s: number) => s * 1000 * TOLERANCE;

function measure<T>(label: string, fn: () => T): { result: T; ms: number } {
  const start = performance.now();
  const result = fn();
  const ms = performance.now() - start;
  console.log(`${label}: ${(ms / 1000).toFixed(2)} s`);
  return { result, ms };
}

describe.skipIf(!existsSync(FILE))("desempenho com o arquivo de referência", () => {
  let dataset: Dataset;
  let normalized: NormalizedColumns;

  beforeAll(() => {
    const bytes = new Uint8Array(readFileSync(FILE));
    let progressEvents = 0;
    let previewAt = 0;
    const start = performance.now();
    const parse = measure("parse completo", () =>
      buildDataset(
        parseCsvBytes(bytes, {}, {
          onProgress: () => progressEvents++,
          onPreview: () => (previewAt = performance.now() - start),
        }),
      ),
    );
    console.log(`prévia disponível em ${(previewAt / 1000).toFixed(2)} s; ${progressEvents} eventos de progresso`);
    dataset = parse.result;
    normalized = new NormalizedColumns(dataset);
    expect(dataset.rows).toHaveLength(1_000_000);
    expect(parse.ms).toBeLessThan(seconds(15));
    expect(previewAt).toBeLessThan(seconds(2));
  });

  it("ordena texto em menos de 2 s", () => {
    const { ms } = measure("ordenar por nome", () =>
      buildView(dataset, { sort: [{ column: 1, direction: "asc" }], filters: [] }, normalized),
    );
    expect(ms).toBeLessThan(seconds(2));
  });

  it("ordena números em menos de 2 s", () => {
    const { ms } = measure("ordenar por valor", () =>
      buildView(dataset, { sort: [{ column: 7, direction: "desc" }], filters: [] }, normalized),
    );
    expect(ms).toBeLessThan(seconds(2));
  });

  it("ordena datas em menos de 2 s", () => {
    const { ms } = measure("ordenar por data", () =>
      buildView(dataset, { sort: [{ column: 6, direction: "asc" }], filters: [] }, normalized),
    );
    expect(ms).toBeLessThan(seconds(2));
  });

  it("filtra em menos de 2 s", () => {
    const { ms } = measure("filtrar cidade contém 'sao'", () =>
      buildView(dataset, { sort: [], filters: [{ column: 4, op: "contains", value: "sao" }] }, normalized),
    );
    expect(ms).toBeLessThan(seconds(2));
  });

  it("busca em todas as colunas em menos de 2 s", () => {
    const { ms } = measure("buscar 'conceicao'", () =>
      searchCells(dataset, allIndices(dataset.rows.length), "conceicao", normalized),
    );
    expect(ms).toBeLessThan(seconds(2));
  });

  it("resume uma coluna em menos de 2 s", () => {
    const { ms } = measure("resumo da coluna valor", () => summarizeColumn(dataset, 7));
    expect(ms).toBeLessThan(seconds(2));
  });

  it("exporta Excel BR em menos de 10 s", () => {
    const { ms } = measure("exportar Excel BR", () =>
      encodeText(serializeCsv(dataset, EXPORT_PRESETS["excel-br"]), "utf-8-bom"),
    );
    expect(ms).toBeLessThan(seconds(10));
  });

  it("exporta Windows-1252 em menos de 10 s", () => {
    const { ms } = measure("exportar Windows-1252", () =>
      encodeText(serializeCsv(dataset, EXPORT_PRESETS["excel-br"]), "windows-1252"),
    );
    expect(ms).toBeLessThan(seconds(10));
  });

  // Transformação simples numa coluna: prévia < 1 s e aplicação < 3 s.
  const transforms: [string, Op][] = [
    ["remover espaços (nome)", { op: "trimSpaces", params: { columns: [1] } }],
    ["máscara de CPF", { op: "formatDocuments", params: { columns: [2], mode: "unmask", kind: "cpf", padZeros: true } }],
    ["telefones", { op: "formatPhones", params: { columns: [8], format: "e164", addNinthDigit: true } }],
    ["datas para ISO", { op: "convertDates", params: { columns: [6], to: "ymd", keepTime: true } }],
    ["números para 1234.56", { op: "convertNumbers", params: { columns: [7], to: "us", keepCurrency: false } }],
  ];
  for (const [label, op] of transforms) {
    it(`${label}: prévia < 1 s e aplicação < 3 s`, () => {
      const preview = measure(`prévia ${label}`, () => previewPlan(dataset, planOp(dataset, op)));
      const applied = measure(`aplicar ${label}`, () => applyPatch(dataset, planOp(dataset, op).patch));
      expect(preview.ms).toBeLessThan(seconds(1));
      expect(applied.ms).toBeLessThan(seconds(3));
    });
  }

  it("dividir coluna em < 3 s", () => {
    const { ms } = measure("dividir nome", () =>
      applyPatch(dataset, planOp(dataset, { op: "splitColumn", params: { column: 1, separator: " ", parts: 2 } }).patch),
    );
    expect(ms).toBeLessThan(seconds(3));
  });
});
