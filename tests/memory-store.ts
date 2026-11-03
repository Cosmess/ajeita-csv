import type { SavedSession, SessionStore, SessionSummary } from "../src/storage/session";

// Armazenamento em memória para os testes da sessão do worker.
export function memoryStore(): SessionStore & { saved?: SavedSession; saves: number } {
  const store = {
    saved: undefined as SavedSession | undefined,
    saves: 0,
    async save(session: SavedSession) {
      store.saved = structuredClone(session);
      store.saves++;
    },
    async load() {
      return store.saved && structuredClone(store.saved);
    },
    async summary(): Promise<SessionSummary | undefined> {
      const s = store.saved;
      return s && { fileName: s.fileName, savedAt: s.savedAt, rowCount: s.dataset.rows.length, steps: s.history.done.length };
    },
    async clear() {
      store.saved = undefined;
    },
  };
  return store;
}
