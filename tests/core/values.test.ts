import { describe, expect, it } from "vitest";
import { detectColumnType, numberShape, parseDate, parseNumber } from "../../src/core/parse/values";

describe("números", () => {
  it.each([
    ["1.234,56", "br"],
    ["89,90", "br"],
    ["1234.56", "us"],
    ["1,234.56", "us"],
    ["1000", "plain"],
    ["1.234", "both"],
    ["R$ 1.234,56", "br"],
    ["-R$ 15.000,00", "br"],
    ["0001", "none"],
    ["01310100", "none"],
    ["529.982.247-25", "none"],
    ["abc", "none"],
  ])("%s → %s", (value, shape) => {
    expect(numberShape(value)).toBe(shape);
  });

  it("converte nos dois formatos", () => {
    expect(parseNumber("1.234,56", "br")).toBe(1234.56);
    expect(parseNumber("R$ -1.234,56", "br")).toBe(-1234.56);
    expect(parseNumber("1,234.56", "us")).toBe(1234.56);
    expect(parseNumber("", "br")).toBeNaN();
  });
});

describe("datas", () => {
  it("lê os três formatos, com e sem hora", () => {
    const expected = Date.UTC(2025, 2, 15);
    expect(parseDate("15/03/2025", "dmy")).toBe(expected);
    expect(parseDate("03/15/2025", "mdy")).toBe(expected);
    expect(parseDate("2025-03-15", "ymd")).toBe(expected);
    expect(parseDate("15/03/2025 14:30", "dmy")).toBe(Date.UTC(2025, 2, 15, 14, 30));
  });

  it("rejeita datas inexistentes", () => {
    expect(parseDate("29/02/2025", "dmy")).toBeNaN();
    expect(parseDate("2025-02-30", "ymd")).toBeNaN();
    expect(parseDate("13/13/2025", "dmy")).toBeNaN();
  });
});

describe("tipo da coluna", () => {
  it.each([
    [["1.234,56", "89,90", "15.000,00"], { type: "number", format: "br" }],
    [["1234.56", "0.99"], { type: "number", format: "us" }],
    [["1", "2", "30"], { type: "number", format: "plain" }],
    [["1.234", "2.500"], { type: "number", format: "br" }],
    [["1.234,56", "1234.56"], { type: "string" }],
    [["15/03/2025", "01/12/2024"], { type: "date", format: "dmy" }],
    [["03/15/2025", "12/01/2024"], { type: "date", format: "mdy" }],
    [["03/04/2025", "05/06/2025"], { type: "date", format: "dmy" }],
    [["2025-03-15", "2024-12-01 10:00"], { type: "date", format: "ymd" }],
    [["sim", "não", "Sim"], { type: "boolean" }],
    [["0001", "0002"], { type: "string" }],
    [["", " "], { type: "unknown" }],
  ])("%j → %j", (values, expected) => {
    expect(detectColumnType(values)).toEqual(expected);
  });

  it("ignora vazios e tolera poucos valores fora do tipo", () => {
    const values = [...Array.from({ length: 99 }, (_, i) => String(i + 1)), "", "n/d"];
    expect(detectColumnType(values)).toEqual({ type: "number", format: "plain" });
  });
});
