import type { TableCell, TableModel } from "./table";

// Executada DENTRO da página pela API scripting: precisa ser autocontida (sem
// importar nada nem usar variáveis de fora), porque só o código da função é enviado.
//
// Escolhe a tabela: a que contém a seleção do usuário; a única da página; ou, se
// houver várias, pede para o usuário clicar nela (Esc cancela).
export function pickTableInPage(): Promise<
  { status: "ok"; table: { rows: { text: string; colspan: number; rowspan: number; header: boolean }[][]; headerRows: number } }
  | { status: "none" | "cancelled" }
> {
  const read = (table: HTMLTableElement) => {
    const rows = Array.from(table.rows).map((row) =>
      Array.from(row.cells).map((cell) => ({
        text: (cell.innerText || cell.textContent || "").replace(/\s+/g, " ").trim(),
        colspan: cell.colSpan || 1,
        rowspan: cell.rowSpan || 1,
        header: cell.tagName === "TH",
      })),
    );
    let headerRows = table.tHead ? table.tHead.querySelectorAll("tr").length : 0;
    if (headerRows === 0) {
      // Sem <thead>: linhas iniciais só com <th> contam como cabeçalho.
      while (headerRows < rows.length && rows[headerRows]!.length > 0 && rows[headerRows]!.every((c) => c.header)) headerRows++;
    }
    return { status: "ok" as const, table: { rows, headerRows } };
  };

  const selection = window.getSelection();
  const anchor = selection && selection.rangeCount > 0 ? selection.getRangeAt(0).commonAncestorContainer : null;
  const selected = (anchor instanceof Element ? anchor : anchor?.parentElement)?.closest("table");
  if (selected) return Promise.resolve(read(selected));

  const tables = Array.from(document.querySelectorAll("table")).filter((t) => t.rows.length > 0);
  if (tables.length === 0) return Promise.resolve({ status: "none" as const });
  if (tables.length === 1) return Promise.resolve(read(tables[0]!));

  return new Promise((resolve) => {
    const hint = document.createElement("div");
    hint.textContent = "Ajeita CSV: clique na tabela que você quer importar (Esc cancela)";
    hint.setAttribute(
      "style",
      "position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147483647;background:#007a3d;color:#fff;" +
        "padding:8px 14px;border-radius:6px;font:14px system-ui,sans-serif;box-shadow:0 4px 12px rgba(0,0,0,.25)",
    );
    document.body.appendChild(hint);
    let current: HTMLTableElement | null = null;
    const outline = (table: HTMLTableElement | null) => {
      if (current) current.style.outline = current.dataset.ajeitaOutline ?? "";
      current = table;
      if (table) {
        table.dataset.ajeitaOutline = table.style.outline;
        table.style.outline = "3px solid #007a3d";
      }
    };
    const finish = (result: { status: "cancelled" } | ReturnType<typeof read>) => {
      outline(null);
      hint.remove();
      document.removeEventListener("mouseover", over, true);
      document.removeEventListener("click", click, true);
      document.removeEventListener("keydown", key, true);
      resolve(result);
    };
    const over = (e: MouseEvent) => outline((e.target as Element).closest?.("table") ?? null);
    const click = (e: MouseEvent) => {
      const table = (e.target as Element).closest?.("table");
      if (!table) return;
      e.preventDefault();
      e.stopPropagation();
      finish(read(table));
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && finish({ status: "cancelled" });
    document.addEventListener("mouseover", over, true);
    document.addEventListener("click", click, true);
    document.addEventListener("keydown", key, true);
  });
}

// Também autocontida: o texto selecionado com quebras de linha e tabulações preservadas
// (o selectionText do menu de contexto junta tudo numa linha só).
export function readSelectionInPage(): string {
  return window.getSelection()?.toString() ?? "";
}

export type { TableCell, TableModel };
