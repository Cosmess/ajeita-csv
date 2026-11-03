import { browser } from "wxt/browser";
import { rowsFromText } from "../core/create/selection";
import { tableToRows } from "../core/create/table";
import { pickTableInPage, readSelectionInPage } from "../core/create/table-dom";
import { detectHeader } from "../core/parse/header";
import { PAGE_IMPORT_KEY, type PageImport } from "../shared/page-import";

const MENU_SELECTION = "ajeita-selection";
const MENU_TABLE = "ajeita-table";

const BLOCKED_PAGE =
  "Não foi possível ler esta página. O Chrome não deixa extensões lerem páginas internas (chrome://) nem a Chrome Web Store.";

export default defineBackground(() => {
  // Clicar no ícone da extensão abre o side panel.
  void browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

  browser.runtime.onInstalled.addListener(() => {
    browser.contextMenus.removeAll(() => {
      browser.contextMenus.create({ id: MENU_SELECTION, title: "Criar CSV a partir da seleção", contexts: ["selection"] });
      browser.contextMenus.create({ id: MENU_TABLE, title: "Criar CSV desta tabela", contexts: ["page", "selection"] });
    });
  });

  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (tab?.id === undefined) return;
    // Abrir o painel só é permitido em resposta direta ao clique.
    void browser.sidePanel.open({ windowId: tab.windowId });
    const kind = info.menuItemId === MENU_TABLE ? "table" : "selection";
    void importFromPage(kind, tab.id, info.frameId ?? 0, tab.title ?? "", info.selectionText ?? "");
  });
});

async function publish(data: PageImport): Promise<void> {
  await browser.storage.session.set({ [PAGE_IMPORT_KEY]: data });
}

// O clique no menu dá acesso temporário à aba (activeTab): lê a seleção ou a tabela ali.
async function importFromPage(kind: "selection" | "table", tabId: number, frameId: number, title: string, fallbackText: string) {
  const id = Date.now();
  await publish({ id, status: "working", kind });
  const target = { tabId, frameIds: [frameId] };
  try {
    if (kind === "selection") {
      const [result] = await browser.scripting.executeScript({ target, func: readSelectionInPage });
      const rows = rowsFromText((result?.result as string | undefined) || fallbackText);
      if (rows.length === 0) {
        await publish({ id, status: "error", kind, message: "Não há texto selecionado." });
        return;
      }
      await publish({ id, status: "ready", kind, title, rows, hasHeader: detectHeader(rows) });
      return;
    }

    const [result] = await browser.scripting.executeScript({ target, func: pickTableInPage });
    const picked = result?.result as Awaited<ReturnType<typeof pickTableInPage>> | undefined;
    if (picked?.status !== "ok") {
      await publish(
        picked?.status === "cancelled"
          ? { id, status: "cancelled", kind, message: "Importação cancelada." }
          : { id, status: "error", kind, message: "Não encontrei nenhuma tabela nesta página." },
      );
      return;
    }
    const { rows, hasHeader } = tableToRows(picked.table);
    await publish({ id, status: "ready", kind, title, rows, hasHeader });
  } catch (error) {
    // storage.session tem limite de tamanho; o resto é página que não pode ser lida.
    const tooBig = error instanceof Error && /quota/i.test(error.message);
    const message = tooBig ? "A tabela é grande demais para importar pelo menu. Salve a página e abra o arquivo." : BLOCKED_PAGE;
    await publish({ id, status: "error", kind, message });
  }
}
