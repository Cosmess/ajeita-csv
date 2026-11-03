// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { pickTableInPage, readSelectionInPage } from "../../src/core/create/table-dom";
import { tableToRows } from "../../src/core/create/table";
import { fixture } from "../helpers";

describe("leitura de tabela na página", () => {
  it("lê a tabela da fixture com colspan e rowspan", async () => {
    document.documentElement.innerHTML = new TextDecoder().decode(fixture("tabela-colspan-rowspan.html"));
    const result = await pickTableInPage();
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.table.headerRows).toBe(2);
    expect(tableToRows(result.table).rows).toEqual([
      ["Região", "Estado", "2025 1º semestre", "2025 2º semestre"],
      ["Sudeste", "SP", "1.200,00", "1.350,00"],
      ["Sudeste", "RJ", "800,00", "910,50"],
      ["Sul", "PR", "430,00", "470,00"],
      ["Sul", "SC", "sem dados", "sem dados"],
    ]);
  });

  it("usa a tabela onde está a seleção quando há várias", async () => {
    document.body.innerHTML = "<table><tr><td>primeira</td></tr></table><table><tr><th>x</th></tr><tr><td id='alvo'>segunda</td></tr></table>";
    const range = document.createRange();
    range.selectNodeContents(document.getElementById("alvo")!);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    const result = await pickTableInPage();
    expect(result.status === "ok" && result.table.rows.map((r) => r.map((c) => c.text))).toEqual([["x"], ["segunda"]]);
    expect(result.status === "ok" && result.table.headerRows).toBe(1);
    expect(readSelectionInPage()).toBe("segunda");
  });

  it("avisa quando não há tabela", async () => {
    document.body.innerHTML = "<p>sem tabelas</p>";
    window.getSelection()!.removeAllRanges();
    expect(await pickTableInPage()).toEqual({ status: "none" });
  });

  it("com várias tabelas e sem seleção, espera o clique do usuário", async () => {
    document.body.innerHTML = "<table><tr><td>a</td></tr></table><table><tr><td id='b'>b</td></tr></table>";
    window.getSelection()!.removeAllRanges();
    const pending = pickTableInPage();
    expect(document.body.textContent).toContain("clique na tabela");
    document.getElementById("b")!.click();
    const result = await pending;
    expect(result.status === "ok" && result.table.rows[0]![0]!.text).toBe("b");
    expect(document.body.textContent).not.toContain("clique na tabela");
  });

  it("Esc cancela a escolha", async () => {
    document.body.innerHTML = "<table><tr><td>a</td></tr></table><table><tr><td>b</td></tr></table>";
    window.getSelection()!.removeAllRanges();
    const pending = pickTableInPage();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(await pending).toEqual({ status: "cancelled" });
  });
});
