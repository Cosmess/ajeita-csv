import { describe, expect, it } from "vitest";
import { KeyTable } from "../../src/core/inspect/key-table";

describe("KeyTable", () => {
  it("guarda, atualiza e encontra chaves, inclusive com colisão de hash", () => {
    const table = new KeyTable();
    for (let i = 0; i < 200_000; i++) table.set(`x${i}`, i);
    table.set("x5", -1);
    expect(table.size).toBe(200_000);
    expect(table.get("x5")).toBe(-1);
    expect(table.get("x199999")).toBe(199_999);
    expect(table.has("x200000")).toBe(false);
    expect(table.get("")).toBeUndefined();
    // Com 200 mil chaves em 30 bits, colisões de hash acontecem: todas precisam continuar certas.
    for (let i = 0; i < 200_000; i += 997) if (i !== 5) expect(table.get(`x${i}`)).toBe(i);
  });

  it("diferencia texto com acentos e vazio", () => {
    const table = new KeyTable();
    table.set("São Paulo", 1);
    table.set("Sao Paulo", 2);
    table.set("", 3);
    expect([table.get("São Paulo"), table.get("Sao Paulo"), table.get("")]).toEqual([1, 2, 3]);
  });
});
