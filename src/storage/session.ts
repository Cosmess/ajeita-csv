import type { Dataset } from "../core/dataset";
import type { History } from "../core/history";
import type { ViewSpec } from "../core/inspect/view";

// Última sessão de trabalho, guardada só neste navegador (IndexedDB da extensão).
export type SavedSession = {
  savedAt: number;
  fileName: string;
  // Arquivo original: permite reler com outro encoding ou separador depois de restaurar.
  file: Blob;
  dataset: Dataset;
  history: History;
  view: ViewSpec;
};

export type SessionSummary = { fileName: string; savedAt: number; rowCount: number; steps: number };

export type SessionStore = {
  save(session: SavedSession): Promise<void>;
  load(): Promise<SavedSession | undefined>;
  summary(): Promise<SessionSummary | undefined>;
  clear(): Promise<void>;
};

const DB_NAME = "ajeita-csv";
const STORE = "session";
// Resumo em registro separado: perguntar "continuar de onde parei?" sem ler o arquivo inteiro.
const SUMMARY_KEY = "summary";
const META_KEY = "meta";
const chunkKey = (index: number) => `rows:${index}`;
// O Chrome limita cada valor do IndexedDB (~130 MB); as linhas vão em blocos bem menores.
const CHUNK_ROWS = 20_000;

type StoredMeta = Omit<SavedSession, "dataset"> & { dataset: Omit<Dataset, "rows">; chunks: number };

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(mode: IDBTransactionMode, body: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await openDb();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = body(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request ? request.result : undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

function write(session: SavedSession): Promise<unknown> {
  const { rows, ...dataset } = session.dataset;
  const chunks = Math.ceil(rows.length / CHUNK_ROWS);
  const meta: StoredMeta = { ...session, dataset, chunks };
  const summary: SessionSummary = {
    fileName: session.fileName,
    savedAt: session.savedAt,
    rowCount: rows.length,
    steps: session.history.done.length,
  };
  return run("readwrite", (store) => {
    store.clear();
    for (let i = 0; i < chunks; i++) store.put(rows.slice(i * CHUNK_ROWS, (i + 1) * CHUNK_ROWS), chunkKey(i));
    store.put(meta, META_KEY);
    store.put(summary, SUMMARY_KEY);
  });
}

export const indexedDbStore: SessionStore = {
  async save(session) {
    try {
      await write(session);
    } catch {
      // Histórico grande demais (ex.: desfazer a exclusão de quase todas as linhas):
      // salva os dados sem ele, para ao menos não perder o trabalho.
      await write({ ...session, history: { done: [], undone: [] } });
    }
  },
  async load() {
    const meta = await run<StoredMeta>("readonly", (store) => store.get(META_KEY));
    if (!meta) return undefined;
    const db = await openDb();
    try {
      const chunks = await new Promise<string[][][]>((resolve, reject) => {
        const tx = db.transaction(STORE, "readonly");
        const store = tx.objectStore(STORE);
        const requests = Array.from({ length: meta.chunks }, (_, i) => store.get(chunkKey(i)) as IDBRequest<string[][] | undefined>);
        tx.oncomplete = () =>
          requests.every((r) => r.result)
            ? resolve(requests.map((r) => r.result!))
            : reject(new Error("Sessão salva incompleta"));
        tx.onerror = () => reject(tx.error);
      });
      const { chunks: _count, dataset, ...rest } = meta;
      return { ...rest, dataset: { ...dataset, rows: chunks.flat() } };
    } finally {
      db.close();
    }
  },
  summary: () => run<SessionSummary>("readonly", (store) => store.get(SUMMARY_KEY)),
  async clear() {
    await run("readwrite", (store) => store.clear());
  },
};
