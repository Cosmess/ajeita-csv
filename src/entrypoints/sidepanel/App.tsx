import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import type { ColumnSummary as Summary } from "../../core/inspect/summary";
import type { Filter, SortKey, ViewSpec } from "../../core/inspect/view";
import type { ParseOverrides } from "../../core/parse";
import { ColumnSummary } from "../../ui/components/ColumnSummary";
import { ExportDialog } from "../../ui/components/ExportDialog";
import { FileBar } from "../../ui/components/FileBar";
import { EmptyState, isAccepted } from "../../ui/components/FileDrop";
import { ActiveFilters, FilterEditor } from "../../ui/components/FilterBar";
import { Grid } from "../../ui/components/Grid";
import { LoadingView } from "../../ui/components/Loading";
import { SearchBar } from "../../ui/components/SearchBar";
import { SheetPicker } from "../../ui/components/SheetPicker";
import { formatCount } from "../../ui/labels";
import { getWorkerClient } from "../../ui/worker";
import type { DatasetInfo, OpenProgress, OpenResult } from "../../workers/protocol";

type Screen =
  | { kind: "empty" }
  | { kind: "loading"; fileName: string; progress: OpenProgress }
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

const EMPTY_VIEW: ViewSpec = { sort: [], filters: [] };
const EMPTY_SEARCH: SearchState = { query: "", searching: false, total: 0, stored: 0, current: 0 };
const SEARCH_DELAY = 250;

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
  const [summary, setSummary] = useState<{ column: number; data?: Summary }>();
  const [exporting, setExporting] = useState(false);
  const [search, setSearch] = useState<SearchState>(EMPTY_SEARCH);
  const [dragging, setDragging] = useState(false);
  // Muda a cada arquivo aberto: a grade é recriada e volta ao topo.
  const [gridKey, setGridKey] = useState(0);
  const dragDepth = useRef(0);

  const showDataset = useCallback((next: DatasetInfo) => {
    setInfo(next);
    setView(EMPTY_VIEW);
    setViewState({ count: next.rowCount, version: next.viewVersion });
    setFilterColumn(undefined);
    setSummary(undefined);
    setSearch((current) => ({ ...EMPTY_SEARCH, query: current.query }));
    setGridKey((key) => key + 1);
    setScreen({ kind: "ready" });
  }, []);

  const restoreScreen = useCallback(() => setScreen(info ? { kind: "ready" } : { kind: "empty" }), [info]);

  const openFile = useCallback(
    async (file: File, sheet?: string) => {
      if (!isAccepted(file)) {
        setError(`"${file.name}" não é um formato aceito. Use CSV, TXT, TSV ou XLSX.`);
        return;
      }
      setError(undefined);
      setNotice(undefined);
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
        else showDataset(result.info);
      } catch (e) {
        setError(`Não foi possível abrir "${file.name}": ${message(e)}`);
        restoreScreen();
      }
    },
    [client, restoreScreen, showDataset],
  );

  const reopen = useCallback(
    async (overrides: ParseOverrides, sheet?: string) => {
      if (!info) return;
      setBusy(true);
      setError(undefined);
      const rereads = overrides.encoding !== undefined || overrides.delimiter !== undefined;
      if (rereads) setScreen({ kind: "loading", fileName: info.fileName, progress: { fraction: 0 } });
      try {
        const next = await client.request("reopen", { overrides, sheet }, (progress) =>
          setScreen((current) => (current.kind === "loading" ? { ...current, progress: { fraction: progress.fraction } } : current)),
        );
        showDataset(next);
      } catch (e) {
        setError(message(e));
        restoreScreen();
      } finally {
        setBusy(false);
      }
    },
    [client, info, restoreScreen, showDataset],
  );

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

  // Busca: refeita quando o texto muda (com uma pequena espera) ou quando a visualização muda.
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

  // Resumo da coluna aberta, recalculado quando os filtros mudam.
  const summaryColumn = summary?.column;
  const filtered = view.filters.length > 0;
  useEffect(() => {
    if (summaryColumn === undefined) return;
    let cancelled = false;
    setSummary({ column: summaryColumn });
    client
      .request("summarize", { column: summaryColumn, scope: filtered ? "view" : "all" })
      .then((data) => !cancelled && setSummary({ column: summaryColumn, data }))
      .catch((e) => !cancelled && setError(message(e)));
    return () => {
      cancelled = true;
    };
  }, [client, summaryColumn, filtered, viewState.version]);

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
          <h1>Ajeita CSV</h1>
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

      {screen.kind === "empty" && <EmptyState onFile={(file) => void openFile(file)} />}
      {screen.kind === "loading" && <LoadingView fileName={screen.fileName} progress={screen.progress} />}
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
            onReopen={(overrides, sheet) => void reopen(overrides, sheet)}
            onOpenFile={(file) => void openFile(file)}
            onExport={() => setExporting(true)}
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
          {filterColumn !== undefined && (
            <FilterEditor
              column={filterColumn}
              columns={info.columns}
              current={view.filters.find((f) => f.column === filterColumn)}
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
              onSort={(column, additive) => void applyView({ ...view, sort: nextSort(view.sort, column, additive) })}
              onFilter={setFilterColumn}
              onSummary={(column) => setSummary({ column })}
            />
            {summary && (
              <ColumnSummary
                summary={summary.data}
                loading={!summary.data}
                filtered={filtered}
                onFilterValue={(column, value) => setFilter({ column, op: "equals", value })}
                onClose={() => setSummary(undefined)}
              />
            )}
          </div>
          <footer className="status-bar" role="status">
            {filtered
              ? `${formatCount(viewState.count)} de ${formatCount(info.rowCount)} linhas`
              : `${formatCount(info.rowCount)} linhas`}
            {` · ${formatCount(info.columns.length)} colunas`}
            {info.meta.issues.length > 0 && ` · ${formatCount(info.meta.issues.length)} linhas com problema de estrutura`}
            {busy && " · processando…"}
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
