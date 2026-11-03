// Dados trazidos da página pelo menu de contexto, do service worker para o painel
// (via chrome.storage.session, que só existe enquanto o navegador está aberto).
export const PAGE_IMPORT_KEY = "pageImport";

export type PageImport =
  | { id: number; status: "working"; kind: "selection" | "table" }
  | { id: number; status: "ready"; kind: "selection" | "table"; title: string; rows: string[][]; hasHeader: boolean }
  | { id: number; status: "error" | "cancelled"; kind: "selection" | "table"; message: string };
