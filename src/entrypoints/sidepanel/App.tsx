import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import type { ColumnSummary as Summary } from "../../core/inspect/summary";
import type { Filter, SortKey, ViewSpec } from "../../core/inspect/view";
import type { ParseOverrides } from "../../core/parse";
import type { Preview } from "../../core/preview";
import { browser } from "wxt/browser";
import { rowsFromText } from "../../core/create/selection";
import { detectHeader } from "../../core/parse/header";
import type { ValidationRule } from "../../core/validate";
import { PAGE_IMPORT_KEY, type PageImport } from "../../shared/page-import";
import { MergeDialog } from "../../ui/components/MergeDialog";
import { PasteDialog } from "../../ui/components/PasteDialog";
import { SplitDialog } from "../../ui/components/SplitDialog";
import type { SessionSummary } from "../../storage/session";
import { ACTIONS, type ActionDef } from "../../ui/actions";
import { ActionDialog } from "../../ui/components/ActionDialog";
import { ActionsMenu } from "../../ui/components/ActionsMenu";
import { AnonymizeDialog } from "../../ui/components/AnonymizeDialog";
import { CompareDialog } from "../../ui/components/CompareDialog";
import { CHANGES_COLUMN, COMPARE_STATUSES, STATUS_COLUMN, type CompareOptions, type CompareStatus } from "../../core/files/compare";
import { ColumnMenu } from "../../ui/components/ColumnMenu";
import { ColumnSummary } from "../../ui/components/ColumnSummary";
import { ExportDialog } from "../../ui/components/ExportDialog";
import { FileBar } from "../../ui/components/FileBar";
import { EmptyState, isAccepted } from "../../ui/components/FileDrop";
import { ActiveFilters, FilterEditor } from "../../ui/components/FilterBar";
import { Grid } from "../../ui/components/Grid";
import { LoadingView } from "../../ui/components/Loading";
import { PreviewDialog } from "../../ui/components/PreviewDialog";
import { ProblemsPanel } from "../../ui/components/ProblemsPanel";
import { RestorePrompt } from "../../ui/components/RestorePrompt";
import { SearchBar } from "../../ui/components/SearchBar";
import { SettingsButton } from "../../ui/components/Settings";
import { SheetPicker } from "../../ui/components/SheetPicker";
import { formatCount } from "../../ui/labels";
import { getWorkerClient, restartWorker } from "../../ui/worker";
import type { DatasetInfo, OpenProgress, OpenResult, Operation } from "../../workers/protocol";

type Screen =
  | { kind: "empty" }
  | { kind: "loading"; fileName: string; progress: OpenProgress; message?: string }
  | { kind: "choose-sheet"; file: File; sheets: string[] }
  | { kind: "ready" };

type SearchState = {
  query: string;
  searching: boolean;
  total: number;
  stored: number;
  current: number;
  match?: { position: number; column: number };
};

type PreviewState = { op: Operation; data?: Preview; error?: string; applying: boolean };

type Drawer = { kind: "summary"; column: number; data?: Summary } | { kind: "problems" };

const EMPTY_VIEW: ViewSpec = { sort: [], filters: [] };

const STATUS_LABELS: Record<CompareStatus, [string, string]> = {
  Novo: ["novo", "novos"],
  Removido: ["removido", "removidos"],
  Alterado: ["alterado", "alterados"],
  Igual: ["igual", "iguais"],
};
const EMPTY_SEARCH: SearchState = { query: "", searching: false, total: 0, stored: 0, current: 0 };
const SEARCH_DELAY = 250;
// Uma expressão regular pode não terminar nunca (backtracking catastrófico).
const REGEX_TIMEOUT = 10_000;

class RegexTimeout extends Error {}

const usesRegex = (op: Operation) => op.op === "replace" && op.params.regex;
const columnsKey = (info?: DatasetInfo) => info?.columns.map((c) => c.name).join("\u0000") ?? "";

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

// Próximo estado da ordenação ao clicar no cabeçalho: crescente → decrescente → sem ordem.
// Com Shift, a coluna é somada às já ordenadas em vez de substituí-las.
function nextSort(sort: SortKey[], column: number, additive: boolean): SortKey[] {
  const current = sort.find((key) => key.column === column);
  const others = additive ? sort.filter((key) => key.column !== column) : [];
  if (!current) return [...others, { column, direction: "asc" }];
  if (current.direction === "asc") {
    const flipped: SortKey = { column, direction: "desc" };
    return additive ? sort.map((key) => (key.column === column ? flipped : key)) : [flipped];
  }
  return others;
}

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

export function App() {
  const client = getWorkerClient();
  const [screen, setScreen] = useState<Screen>({ kind: "empty" });
  const [info, setInfo] = useState<DatasetInfo>();
  const [view, setView] = useState<ViewSpec>(EMPTY_VIEW);
  const [viewState, setViewState] = useState({ count: 0, version: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [filterColumn, setFilterColumn] = useState<number>();
  const [drawer, setDrawer] = useState<Drawer>();
  const [preview, setPreview] = useState<PreviewState>();
  const [exporting, setExporting] = useState(false);
  const [search, setSearch] = useState<SearchState>(EMPTY_SEARCH);
  const [focus, setFocus] = useState<{ position: number; key: number }>();
  const [saved, setSaved] = useState<SessionSummary>();
  const [confirmReopen, setConfirmReopen] = useState<{ overrides: ParseOverrides; sheet?: string }>();
  const [confirmHome, setConfirmHome] = useState(false);
  const [action, setAction] = useState<{ def: ActionDef; column?: number }>();
  const [actionPicker, setActionPicker] = useState<number>();
  const [anonymizing, setAnonymizing] = useState<{ column?: number }>();
  const [columnMenu, setColumnMenu] = useState<{ column: number; anchor: { left: number; top: number } }>();
  const [validations, setValidations] = useState<Partial<Record<number, ValidationRule>>>({});
  const [invalidCounts, setInvalidCounts] = useState<Partial<Record<number, number>>>({});
  const [pasting, setPasting] = useState(false);
  const [splitting, setSplitting] = useState(false);
  const [merging, setMerging] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [statusCounts, setStatusCounts] = useState<Partial<Record<string, number>>>();
  const [confirmImport, setConfirmImport] = useState<Extract<PageImport, { status: "ready" }>>();
  const handledImport = useRef(0);
  const [dragging, setDragging] = useState(false);
  // Muda a cada arquivo aberto: a grade é recriada e volta ao topo.
  const [gridKey, setGridKey] = useState(0);
  const dragDepth = useRef(0);

  // Sessão salva de antes: oferecer para continuar.
  useEffect(() => {
    client
      .request("savedSession", {})
      .then((summary) => setSaved(summary ?? undefined))
      .catch(() => {});
  }, [client]);

  // Atualiza a tela com o estado do worker. `fresh`: outro arquivo (ou o mesmo relido).
  const applyInfo = useCallback((next: DatasetInfo, fresh: boolean) => {
    // Validações apontam colunas pela posição: se as colunas mudaram, deixam de valer.
    setInfo((previous) => {
      if (fresh || columnsKey(previous) !== columnsKey(next)) setValidations({});
      return next;
    });
    setView(next.view);
    setViewState({ count: next.viewCount, version: next.viewVersion });
    if (fresh) {
      setFilterColumn(undefined);
      setDrawer(undefined);
      setFocus(undefined);
      setSearch((current) => ({ ...EMPTY_SEARCH, query: current.query }));
      setGridKey((key) => key + 1);
    }
    setScreen({ kind: "ready" });
  }, []);

  const restoreScreen = useCallback(() => setScreen(info ? { kind: "ready" } : { kind: "empty" }), [info]);

  // Cria dados novos no worker (grade vazia, colados, da página) e mostra.
  const create = useCallback(
    async (request: () => Promise<DatasetInfo>) => {
      setBusy(true);
      setError(undefined);
      setNotice(undefined);
      try {
        applyInfo(await request(), true);
        setSaved(undefined);
      } catch (e) {
        setError(message(e));
        restoreScreen();
      } finally {
        setBusy(false);
      }
    },
    [applyInfo, restoreScreen],
  );

  const createFromText = (text: string) => {
    setPasting(false);
    if (/^\s*[[{]/.test(text)) {
      void create(() => client.request("createFromJson", { name: "dados-colados.json", text }));
      return;
    }
    const rows = rowsFromText(text);
    void create(() => client.request("createFromRows", { name: "dados-colados.csv", rows, hasHeader: detectHeader(rows) }));
  };

  const mergeFiles = (files: File[], addSource: boolean) => {
    setMerging(false);
    void create(() => client.request("mergeFiles", { files, addSource }));
  };

  const compareFiles = (before: File | undefined, after: File, options: CompareOptions) => {
    setComparing(false);
    void create(async () => {
      const { info: result, summary } = await client.request("compareFiles", { before, after, options });
      const { before: a, after: b } = summary.duplicateKeys;
      if (a + b > 0) {
        setNotice(
          `Há chaves repetidas (${formatCount(a)} no antes, ${formatCount(b)} no depois): linhas com a mesma chave foram comparadas na ordem em que aparecem.`,
        );
      }
      return result;
    });
  };

  const importFromPage = useCallback(
    (data: Extract<PageImport, { status: "ready" }>) => {
      setConfirmImport(undefined);
      const base = data.title.replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 60) || (data.kind === "table" ? "tabela" : "selecao");
      void create(() => client.request("createFromRows", { name: `${base}.csv`, rows: data.rows, hasHeader: data.hasHeader }));
    },
    [client, create],
  );

  // Dados vindos da página pelo menu de contexto (o service worker grava em storage.session).
  const hasEdits = Boolean(info?.undo);
  useEffect(() => {
    const handle = (data: PageImport | undefined) => {
      if (!data || data.id < handledImport.current) return;
      if (data.status === "working") {
        setScreen({
          kind: "loading",
          fileName: "",
          progress: { fraction: 0 },
          message:
            data.kind === "table"
              ? "Lendo a tabela da página… Se houver várias, clique na que você quer importar (Esc cancela)."
              : "Lendo o texto selecionado…",
        });
        return;
      }
      handledImport.current = data.id + 1;
      void browser.storage.session.remove(PAGE_IMPORT_KEY);
      if (data.status === "ready") {
        if (hasEdits) {
          restoreScreen();
          setConfirmImport(data);
        } else importFromPage(data);
      } else {
        restoreScreen();
        if (data.status === "error") setError(data.message);
        else setNotice(data.message);
      }
    };
    // Fora da extensão (ex.: página de teste) não há storage.session.
    if (!browser?.storage?.session) return;
    void browser.storage.session.get(PAGE_IMPORT_KEY).then((stored) => handle(stored[PAGE_IMPORT_KEY] as PageImport | undefined));
    const listener = (changes: Record<string, { newValue?: unknown }>, area: string) => {
      if (area === "session" && changes[PAGE_IMPORT_KEY]) handle(changes[PAGE_IMPORT_KEY].newValue as PageImport | undefined);
    };
    browser.storage.onChanged.addListener(listener);
    return () => browser.storage.onChanged.removeListener(listener);
  }, [hasEdits, importFromPage, restoreScreen]);

  const openFile = useCallback(
    async (file: File, sheet?: string) => {
      if (!isAccepted(file)) {
        setError(`"${file.name}" não é um formato aceito. Use CSV, TXT, TSV ou XLSX.`);
        return;
      }
      setError(undefined);
      setNotice(undefined);
      setSaved(undefined);
      setScreen({ kind: "loading", fileName: file.name, progress: { fraction: 0 } });
      try {
        const result: OpenResult = await client.request("openFile", { file, sheet }, (progress) =>
          setScreen((current) =>
            current.kind === "loading"
              ? { ...current, progress: { fraction: progress.fraction, preview: progress.preview ?? current.progress.preview } }
              : current,
          ),
        );
        if (result.status === "choose-sheet") setScreen({ kind: "choose-sheet", file, sheets: result.sheets });
        else applyInfo(result.info, true);
      } catch (e) {
        setError(`Não foi possível abrir "${file.name}": ${message(e)}`);
        restoreScreen();
      }
    },
    [applyInfo, client, restoreScreen],
  );

  const reopen = useCallback(
    async (overrides: ParseOverrides, sheet?: string) => {
      if (!info) return;
      setConfirmReopen(undefined);
      setBusy(true);
      setError(undefined);
      setScreen({ kind: "loading", fileName: info.fileName, progress: { fraction: 0 } });
      try {
        const next = await client.request("reopen", { overrides, sheet }, (progress) =>
          setScreen((current) => (current.kind === "loading" ? { ...current, progress: { fraction: progress.fraction } } : current)),
        );
        applyInfo(next, true);
      } catch (e) {
        setError(message(e));
        restoreScreen();
      } finally {
        setBusy(false);
      }
    },
    [applyInfo, client, info, restoreScreen],
  );

  // Reler o arquivo descarta as alterações; pedir confirmação se houver alguma.
  const requestReopen = (overrides: ParseOverrides, sheet?: string) => {
    if (info?.undo) setConfirmReopen({ overrides, sheet });
    else void reopen(overrides, sheet);
  };

  // Volta à tela inicial: fecha o arquivo e apaga a sessão salva.
  const goHome = async () => {
    setConfirmHome(false);
    setBusy(true);
    try {
      await client.request("close", {});
      setInfo(undefined);
      setView(EMPTY_VIEW);
      setViewState({ count: 0, version: 0 });
      setValidations({});
      setFilterColumn(undefined);
      setDrawer(undefined);
      setPreview(undefined);
      setExporting(false);
      setSearch(EMPTY_SEARCH);
      setFocus(undefined);
      setAction(undefined);
      setActionPicker(undefined);
      setAnonymizing(undefined);
      setColumnMenu(undefined);
      setSplitting(false);
      setComparing(false);
      setConfirmReopen(undefined);
      setConfirmImport(undefined);
      setSaved(undefined);
      setError(undefined);
      setNotice(undefined);
      setScreen({ kind: "empty" });
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };

  // Com alterações feitas, pedir confirmação antes de zerar.
  const requestHome = () => {
    if (info?.undo) setConfirmHome(true);
    else void goHome();
  };

  const restoreSaved = async () => {
    setBusy(true);
    setScreen({ kind: "loading", fileName: saved?.fileName ?? "", progress: { fraction: 0.5 } });
    try {
      applyInfo(await client.request("restore", {}), true);
      setSaved(undefined);
    } catch (e) {
      setError(`Não foi possível restaurar: ${message(e)}`);
      setScreen({ kind: "empty" });
    } finally {
      setBusy(false);
    }
  };

  const clearSaved = async () => {
    try {
      await client.request("discardSaved", {});
      setSaved(undefined);
      setNotice(
        info
          ? "Dados salvos apagados. O arquivo aberto volta a ser salvo se você fizer outra alteração."
          : "Dados salvos apagados.",
      );
    } catch (e) {
      setError(message(e));
    }
  };

  // Executa uma alteração (com desfazer) e atualiza a tela.
  const run = useCallback(
    async (request: () => Promise<DatasetInfo>) => {
      setBusy(true);
      setError(undefined);
      try {
        applyInfo(await request(), false);
        return true;
      } catch (e) {
        if (e instanceof RegexTimeout) throw e;
        setError(message(e));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [applyInfo],
  );

  // Operações com expressão regular: salva a sessão antes e interrompe o worker se passar do limite.
  const guarded = useCallback(
    async <T,>(op: Operation, request: () => Promise<T>): Promise<T> => {
      if (!usesRegex(op)) return request();
      await client.request("flush", {});
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new RegexTimeout()), REGEX_TIMEOUT);
      });
      try {
        return await Promise.race([request(), timeout]);
      } finally {
        clearTimeout(timer);
      }
    },
    [client],
  );

  const recoverFromTimeout = useCallback(async () => {
    const fresh = restartWorker("A operação foi interrompida");
    setPreview(undefined);
    setBusy(false);
    try {
      applyInfo(await fresh.request("restore", {}), true);
    } catch {
      setInfo(undefined);
      setScreen({ kind: "empty" });
    }
    setError(
      "A expressão regular demorou mais de 10 segundos e foi interrompida. O arquivo foi recarregado como estava antes; tente uma expressão mais simples.",
    );
  }, [applyInfo]);

  const execute = useCallback(
    async (op: Operation) => {
      try {
        return await run(() => guarded(op, () => client.request("execute", { op })));
      } catch (e) {
        if (e instanceof RegexTimeout) await recoverFromTimeout();
        return false;
      }
    },
    [client, guarded, recoverFromTimeout, run],
  );
  const undo = useCallback(() => run(() => client.request("undo", {})), [client, run]);
  const redo = useCallback(() => run(() => client.request("redo", {})), [client, run]);

  const openPreview = async (op: Operation) => {
    setPreview({ op, applying: false });
    try {
      const data = await guarded(op, () => client.request("preview", { op }));
      setPreview((current) => (current?.op === op ? { ...current, data } : current));
    } catch (e) {
      if (e instanceof RegexTimeout) await recoverFromTimeout();
      else setPreview((current) => (current?.op === op ? { ...current, error: message(e) } : current));
    }
  };

  // Quantos inválidos cada coluna validada tem, recalculado a cada alteração.
  useEffect(() => {
    const entries = Object.entries(validations) as [string, ValidationRule][];
    if (entries.length === 0) {
      setInvalidCounts({});
      return;
    }
    let cancelled = false;
    Promise.all(entries.map(([column, rule]) => client.request("countInvalid", { column: Number(column), rule })))
      .then((counts) => {
        if (!cancelled) setInvalidCounts(Object.fromEntries(entries.map(([column], i) => [column, counts[i]])));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [client, validations, info]);

  const applyPreview = async () => {
    if (!preview) return;
    setPreview({ ...preview, applying: true });
    const ok = await execute(preview.op);
    setPreview(ok ? undefined : { ...preview, applying: false });
  };

  const goToRow = async (row: number) => {
    const position = await client.request("locateRow", { row });
    if (position < 0) {
      setNotice(`A linha ${formatCount(row + 1)} está escondida pelos filtros ativos.`);
      return;
    }
    setFocus({ position, key: Date.now() });
  };

  // Atalhos: desfazer e refazer (fora de campos de texto).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (screen.kind !== "ready" || busy || isTyping(e.target) || !(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey && info?.undo) {
        e.preventDefault();
        void undo();
      } else if (((key === "z" && e.shiftKey) || key === "y") && info?.redo) {
        e.preventDefault();
        void redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, info, redo, screen.kind, undo]);

  const applyView = useCallback(
    async (next: ViewSpec) => {
      setView(next);
      setBusy(true);
      try {
        const result = await client.request("setView", next);
        setViewState({ count: result.viewCount, version: result.viewVersion });
      } catch (e) {
        setError(message(e));
      } finally {
        setBusy(false);
      }
    },
    [client],
  );

  const setFilter = (filter: Filter) =>
    void applyView({ ...view, filters: [...view.filters.filter((f) => f.column !== filter.column), filter] });
  const removeFilter = (column: number) =>
    void applyView({ ...view, filters: view.filters.filter((f) => f.column !== column) });

  // Resultado de "Comparar" (reconhecido pelas colunas, inclusive ao reabrir um CSV exportado).
  const comparison =
    info && info.columns.length > 2 && info.columns[0]!.name === STATUS_COLUMN && info.columns.at(-1)!.name === CHANGES_COLUMN
      ? { status: 0, changes: info.columns.length - 1 }
      : undefined;
  const isComparison = comparison !== undefined;
  const statusFilter = view.filters.find((f) => f.column === 0 && f.op === "equals")?.value;

  // Quantas linhas em cada situação, recalculado a cada alteração nos dados.
  useEffect(() => {
    if (!isComparison) {
      setStatusCounts(undefined);
      return;
    }
    let cancelled = false;
    client
      .request("summarize", { column: 0, scope: "all" })
      .then((summary) => !cancelled && setStatusCounts(Object.fromEntries(summary.top.map((t) => [t.value, t.count]))))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [client, info, isComparison]);

  // Busca: refeita quando o texto muda (com uma pequena espera) ou quando os dados ou a visualização mudam.
  useEffect(() => {
    if (screen.kind !== "ready") return;
    const query = search.query;
    if (query.trim() === "") {
      setSearch((current) => ({ ...EMPTY_SEARCH, query: current.query }));
      return;
    }
    let cancelled = false;
    setSearch((current) => ({ ...current, searching: true }));
    const timer = setTimeout(async () => {
      try {
        const result = await client.request("search", { query });
        const match = result.stored > 0 ? ((await client.request("getMatch", { index: 0 })) ?? undefined) : undefined;
        if (!cancelled) setSearch({ query, searching: false, total: result.total, stored: result.stored, current: 0, match });
      } catch (e) {
        if (!cancelled) {
          setSearch((current) => ({ ...current, searching: false }));
          setError(message(e));
        }
      }
    }, SEARCH_DELAY);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [client, search.query, viewState.version, screen.kind]);

  const moveSearch = async (delta: 1 | -1) => {
    if (search.stored === 0) return;
    const index = (search.current + delta + search.stored) % search.stored;
    const match = await client.request("getMatch", { index });
    setSearch((current) => ({ ...current, current: index, match: match ?? undefined }));
  };

  // Resumo da coluna aberta, recalculado quando os dados ou os filtros mudam.
  const summaryColumn = drawer?.kind === "summary" ? drawer.column : undefined;
  const filtered = view.filters.length > 0;
  useEffect(() => {
    if (summaryColumn === undefined) return;
    let cancelled = false;
    client
      .request("summarize", { column: summaryColumn, scope: filtered ? "view" : "all", rule: validations[summaryColumn] })
      .then((data) => !cancelled && setDrawer({ kind: "summary", column: summaryColumn, data }))
      .catch((e) => !cancelled && setError(message(e)));
    return () => {
      cancelled = true;
    };
  }, [client, summaryColumn, filtered, viewState.version, validations]);

  const onDragEnter = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    dragDepth.current++;
    setDragging(true);
  };
  const onDragLeave = () => {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && screen.kind !== "loading") void openFile(file);
  };

  return (
    <main
      className="app"
      onDragEnter={onDragEnter}
      onDragOver={(e) => e.dataTransfer.types.includes("Files") && e.preventDefault()}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {screen.kind !== "ready" && (
        <header className="intro">
          <div className="intro-title">
            <h1>
              <img src="/icon/48.png" alt="" width="28" height="28" />
              Ajeita CSV
            </h1>
            <SettingsButton onClearSaved={() => void clearSaved()} />
          </div>
          <p className="muted">
            Abra, corrija e limpe arquivos CSV. Tudo é processado no seu navegador: nenhum dado sai da sua máquina.
          </p>
        </header>
      )}

      {error && (
        <div className="banner error" role="alert">
          <span>{error}</span>
          <button type="button" className="grid-icon" aria-label="Fechar aviso" onClick={() => setError(undefined)}>
            ×
          </button>
        </div>
      )}
      {notice && (
        <div className="banner ok" role="status">
          <span>{notice}</span>
          <button type="button" className="grid-icon" aria-label="Fechar aviso" onClick={() => setNotice(undefined)}>
            ×
          </button>
        </div>
      )}
      {confirmReopen && (
        <div className="banner warn" role="alertdialog" aria-label="Confirmar releitura">
          <span>Ler o arquivo de novo descarta as alterações feitas. Continuar?</span>
          <span className="banner-actions">
            <button type="button" className="button" onClick={() => setConfirmReopen(undefined)}>
              Cancelar
            </button>
            <button
              type="button"
              className="button primary"
              onClick={() => void reopen(confirmReopen.overrides, confirmReopen.sheet)}
            >
              Ler de novo
            </button>
          </span>
        </div>
      )}

      {confirmHome && (
        <div className="banner warn" role="alertdialog" aria-label="Confirmar volta ao início">
          <span>Voltar ao início descarta o arquivo aberto e as alterações feitas. Exporte antes se quiser guardá-las.</span>
          <span className="banner-actions">
            <button type="button" className="button" onClick={() => setConfirmHome(false)}>
              Cancelar
            </button>
            <button type="button" className="button primary" onClick={() => void goHome()}>
              Descartar e voltar
            </button>
          </span>
        </div>
      )}

      {confirmImport && (
        <div className="banner warn" role="alertdialog" aria-label="Confirmar importação">
          <span>
            Abrir os dados da página ({formatCount(confirmImport.rows.length)} linhas)? As alterações no arquivo aberto serão
            descartadas.
          </span>
          <span className="banner-actions">
            <button type="button" className="button" onClick={() => setConfirmImport(undefined)}>
              Cancelar
            </button>
            <button type="button" className="button primary" onClick={() => importFromPage(confirmImport)}>
              Abrir
            </button>
          </span>
        </div>
      )}

      {screen.kind === "empty" && (
        <>
          {saved && (
            <RestorePrompt
              summary={saved}
              busy={busy}
              onRestore={() => void restoreSaved()}
              onDiscard={() => void clearSaved()}
            />
          )}
          <EmptyState
            onFile={(file) => void openFile(file)}
            onBlank={() => void create(() => client.request("createBlank", { columns: 3, rows: 10 }))}
            onPaste={() => setPasting(true)}
            onMerge={() => setMerging(true)}
            onCompare={() => setComparing(true)}
          />
        </>
      )}
      {screen.kind === "loading" && (
        <LoadingView fileName={screen.fileName} progress={screen.progress} message={screen.message} />
      )}
      {pasting && <PasteDialog onSubmit={createFromText} onClose={() => setPasting(false)} />}
      {merging && <MergeDialog replacing={hasEdits} onMerge={mergeFiles} onClose={() => setMerging(false)} />}
      {comparing && (
        <CompareDialog
          current={screen.kind === "ready" ? info?.fileName : undefined}
          replacing={hasEdits}
          onCompare={compareFiles}
          onClose={() => setComparing(false)}
        />
      )}
      {screen.kind === "choose-sheet" && (
        <SheetPicker
          fileName={screen.file.name}
          sheets={screen.sheets}
          onPick={(sheet) => void openFile(screen.file, sheet)}
          onCancel={restoreScreen}
        />
      )}

      {screen.kind === "ready" && info && (
        <>
          <FileBar
            info={info}
            busy={busy}
            onReopen={requestReopen}
            onHome={requestHome}
            onSetHeader={(hasHeader) => void execute({ op: "setHeader", params: { hasHeader } })}
            onUndo={() => void undo()}
            onRedo={() => void redo()}
            onOpenFile={(file) => void openFile(file)}
            onExport={() => setExporting(true)}
            onClearSaved={() => void clearSaved()}
          />
          {comparison && statusCounts && (
            <div className="compare-bar" role="group" aria-label="Filtrar pela situação">
              {COMPARE_STATUSES.map((status) => {
                const active = statusFilter === status;
                return (
                  <button
                    key={status}
                    type="button"
                    className={`compare-chip status-${status.toLowerCase()}${active ? " active" : ""}`}
                    aria-pressed={active}
                    disabled={busy}
                    title={active ? "Mostrar todas as linhas" : `Mostrar só as linhas "${status}"`}
                    onClick={() => (active ? removeFilter(0) : setFilter({ column: 0, op: "equals", value: status }))}
                  >
                    <strong>{formatCount(statusCounts[status] ?? 0)}</strong> {STATUS_LABELS[status][statusCounts[status] === 1 ? 0 : 1]}
                  </button>
                );
              })}
            </div>
          )}
          {info.mojibakeCells > 0 && (
            <div className="banner warn" role="status">
              <span>
                {formatCount(info.mojibakeCells)} {info.mojibakeCells === 1 ? "célula parece ter" : "células parecem ter"}{" "}
                acentos quebrados (como <code>JoÃ£o</code>).
              </span>
              <button
                type="button"
                className="button"
                disabled={busy}
                onClick={() => void openPreview({ op: "fixEncoding", params: {} })}
              >
                Corrigir…
              </button>
            </div>
          )}
          <div className="toolbar">
            <ActionsMenu
              disabled={busy}
              extra={[
                { title: "Privacidade", items: [{ label: "Anonimizar dados (LGPD)…", onClick: () => setAnonymizing({}) }] },
                {
                  title: "Arquivos",
                  items: [
                    { label: "Dividir arquivo…", onClick: () => setSplitting(true) },
                    { label: "Juntar arquivos…", onClick: () => setMerging(true) },
                    { label: "Comparar com outro arquivo…", onClick: () => setComparing(true) },
                  ],
                },
              ]}
              onPick={(def) =>
                def.direct
                  ? void execute(def.toOp({}, { rowCount: info.rowCount, columnCount: info.columns.length }))
                  : setAction({ def })
              }
            />
            <SearchBar
            query={search.query}
            searching={search.searching}
            total={search.total}
            stored={search.stored}
            current={search.current}
            onQuery={(query) => setSearch((current) => ({ ...current, query }))}
            onMove={(delta) => void moveSearch(delta)}
            />
          </div>
          {filterColumn !== undefined && (
            <FilterEditor
              column={filterColumn}
              columns={info.columns}
              current={view.filters.find((f) => f.column === filterColumn)}
              rule={validations[filterColumn]}
              onApply={(filter) => {
                setFilter(filter);
                setFilterColumn(undefined);
              }}
              onRemove={() => {
                removeFilter(filterColumn);
                setFilterColumn(undefined);
              }}
              onClose={() => setFilterColumn(undefined)}
            />
          )}
          <ActiveFilters
            filters={view.filters}
            columns={info.columns}
            onRemove={removeFilter}
            onClear={() => void applyView({ ...view, filters: [] })}
          />
          {view.sort.length > 0 && (
            <div className="sort-bar">
              <span className="muted small">A ordenação está só na tela.</span>
              <button
                type="button"
                className="button link"
                disabled={busy}
                onClick={() => void execute({ op: "applySort", params: { sort: view.sort } })}
              >
                Aplicar aos dados
              </button>
            </div>
          )}
          <div className="grid-area">
            <Grid
              key={gridKey}
              columns={info.columns}
              viewVersion={viewState.version}
              viewCount={viewState.count}
              sort={view.sort}
              filters={view.filters}
              searchQuery={search.total > 0 ? search.query : ""}
              currentMatch={search.match}
              focus={focus}
              readOnly={busy}
              validations={validations}
              invalidCounts={invalidCounts}
              comparison={comparison}
              onSort={(column, additive) => void applyView({ ...view, sort: nextSort(view.sort, column, additive) })}
              onFilter={setFilterColumn}
              onFilterInvalid={(column) => setFilter({ column, op: "invalid", rule: validations[column] })}
              onColumnMenu={(column, anchor) => setColumnMenu({ column, anchor })}
              onMoveColumn={(from, to) => void execute({ op: "moveColumn", params: { from, to } })}
              onPaste={(row, column, text) => void execute({ op: "paste", params: { row, column, text } })}
              onDeleteRow={(row) => void execute({ op: "deleteRows", params: { rows: [row] } })}
              onEditCell={(row, column, value) => void execute({ op: "editCell", params: { row, column, value } })}
            />
            {drawer?.kind === "summary" && (
              <ColumnSummary
                summary={drawer.data}
                loading={!drawer.data}
                filtered={filtered}
                onFilterValue={(column, value) => setFilter({ column, op: "equals", value })}
                onClose={() => setDrawer(undefined)}
              />
            )}
            {drawer?.kind === "problems" && (
              <ProblemsPanel
                info={info}
                busy={busy}
                onGoToRow={(row) => void goToRow(row)}
                onFixRow={(row) => void execute({ op: "fixProblems", params: { rows: [row] } })}
                onEditRow={(row, text) => void execute({ op: "editRow", params: { row, text } })}
                onDeleteRow={(row) => void execute({ op: "deleteRows", params: { rows: [row] } })}
                onFixAll={() => void openPreview({ op: "fixProblems", params: { rows: "all" } })}
                onClose={() => setDrawer(undefined)}
              />
            )}
          </div>
          <footer className="status-bar" role="status">
            <span>
              {filtered
                ? `${formatCount(viewState.count)} de ${formatCount(info.rowCount)} linhas`
                : `${formatCount(info.rowCount)} linhas`}
              {` · ${formatCount(info.columns.length)} colunas`}
              {busy && " · processando…"}
            </span>
            {info.problemRows > 0 && (
              <button
                type="button"
                className="button link problems-button"
                onClick={() => setDrawer(drawer?.kind === "problems" ? undefined : { kind: "problems" })}
              >
                ⚠ {formatCount(info.problemRows)} {info.problemRows === 1 ? "linha com problema" : "linhas com problema"}
              </button>
            )}
          </footer>
          {exporting && (
            <ExportDialog
              fileName={info.fileName}
              rowCount={info.rowCount}
              viewCount={viewState.count}
              viewChanged={filtered || view.sort.length > 0}
              onClose={() => setExporting(false)}
              onSaved={(name) => {
                setExporting(false);
                setNotice(`Arquivo salvo: ${name}`);
              }}
              onCopied={(rows) => {
                setExporting(false);
                setNotice(`${formatCount(rows)} linhas copiadas. Cole no Excel ou no Google Sheets.`);
              }}
            />
          )}
          {splitting && (
            <SplitDialog
              fileName={info.fileName}
              columns={info.columns}
              viewChanged={filtered || view.sort.length > 0}
              onClose={() => setSplitting(false)}
              onSaved={(name) => {
                setSplitting(false);
                setNotice(`Arquivo salvo: ${name}`);
              }}
            />
          )}
          {columnMenu && (
            <ColumnMenu
              column={columnMenu.column}
              columns={info.columns}
              anchor={columnMenu.anchor}
              hasHeader={info.meta.hasHeader}
              rule={validations[columnMenu.column]}
              onSummary={() => setDrawer({ kind: "summary", column: columnMenu.column })}
              onFilter={() => setFilterColumn(columnMenu.column)}
              onFormat={() => setActionPicker(columnMenu.column)}
              onSplit={() => setAction({ def: ACTIONS.find((a) => a.id === "splitColumn")!, column: columnMenu.column })}
              onRename={(name) => void execute({ op: "renameColumn", params: { column: columnMenu.column, name } })}
              onDuplicate={() => void execute({ op: "duplicateColumn", params: { column: columnMenu.column } })}
              onInsert={() => void execute({ op: "addColumn", params: { index: columnMenu.column + 1 } })}
              onMove={(to) => void execute({ op: "moveColumn", params: { from: columnMenu.column, to } })}
              onDelete={() => void execute({ op: "deleteColumns", params: { columns: [columnMenu.column] } })}
              onValidate={(rule) =>
                setValidations((current) => {
                  const next = { ...current };
                  if (rule) next[columnMenu.column] = rule;
                  else delete next[columnMenu.column];
                  return next;
                })
              }
              onClose={() => setColumnMenu(undefined)}
            />
          )}
          {actionPicker !== undefined && (
            <div className="modal-backdrop" role="presentation">
              <div className="modal" role="dialog" aria-modal="true" aria-labelledby="picker-title">
                <h2 id="picker-title">Ajeitar "{info.columns[actionPicker]?.name}"</h2>
                <div className="action-picker">
                  {ACTIONS.filter((a) => a.fields.some((f) => f.kind === "columns" || f.kind === "column")).map((def) => (
                    <button
                      key={def.id}
                      type="button"
                      className="menu-item"
                      onClick={() => {
                        setAction({ def, column: actionPicker });
                        setActionPicker(undefined);
                      }}
                    >
                      {def.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="menu-item"
                    onClick={() => {
                      setAnonymizing({ column: actionPicker });
                      setActionPicker(undefined);
                    }}
                  >
                    Anonimizar (LGPD)
                  </button>
                </div>
                <div className="modal-actions">
                  <button type="button" className="button" onClick={() => setActionPicker(undefined)}>
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          )}
          {action && (
            <ActionDialog
              action={action.def}
              context={{ rowCount: info.rowCount, columnCount: info.columns.length }}
              columns={info.columns}
              column={action.column}
              onSubmit={(op) => {
                setAction(undefined);
                void openPreview(op);
              }}
              onClose={() => setAction(undefined)}
            />
          )}
          {anonymizing && (
            <AnonymizeDialog
              columns={info.columns}
              column={anonymizing.column}
              onSubmit={(op) => {
                setAnonymizing(undefined);
                void openPreview(op);
              }}
              onClose={() => setAnonymizing(undefined)}
            />
          )}
          {preview && (
            <PreviewDialog
              preview={preview.data}
              error={preview.error}
              applying={preview.applying}
              onApply={() => void applyPreview()}
              onCancel={() => setPreview(undefined)}
              onGoToRow={(row) => {
                setPreview(undefined);
                void goToRow(row);
              }}
            />
          )}
        </>
      )}

      {dragging && (
        <div className="drop-overlay" aria-hidden="true">
          Solte o arquivo para abrir
        </div>
      )}
    </main>
  );
}
