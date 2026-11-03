import { formatCount } from "../labels";

type Props = {
  query: string;
  searching: boolean;
  total: number;
  stored: number;
  current: number;
  onQuery: (query: string) => void;
  onMove: (delta: 1 | -1) => void;
};

export function SearchBar({ query, searching, total, stored, current, onQuery, onMove }: Props) {
  const status =
    query.trim() === ""
      ? ""
      : searching
        ? "Buscando…"
        : total === 0
        ? "Nada encontrado"
        : `${formatCount(current + 1)} de ${formatCount(total)}${stored < total ? " (navegação nas primeiras " + formatCount(stored) + ")" : ""}`;

  return (
    <div className="search-bar" role="search">
      <input
        type="search"
        placeholder="Buscar em todas as colunas"
        aria-label="Buscar em todas as colunas"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onMove(e.shiftKey ? -1 : 1);
          }
        }}
      />
      <span className="search-status" aria-live="polite">
        {status}
      </span>
      <button type="button" className="grid-icon" aria-label="Ocorrência anterior" disabled={total === 0} onClick={() => onMove(-1)}>
        ↑
      </button>
      <button type="button" className="grid-icon" aria-label="Próxima ocorrência" disabled={total === 0} onClick={() => onMove(1)}>
        ↓
      </button>
    </div>
  );
}
