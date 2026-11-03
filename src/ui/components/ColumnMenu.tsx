import { useEffect, useRef, useState } from "react";
import type { Column } from "../../core/dataset";
import { RULE_LABELS, type ValidationRule } from "../../core/validate";

type Props = {
  column: number;
  columns: Column[];
  anchor: { left: number; top: number };
  hasHeader: boolean;
  rule?: ValidationRule;
  onSummary: () => void;
  onFilter: () => void;
  onFormat: () => void;
  onSplit: () => void;
  onRename: (name: string) => void;
  onDuplicate: () => void;
  onMove: (to: number) => void;
  onDelete: () => void;
  onValidate: (rule: ValidationRule | undefined) => void;
  onClose: () => void;
};

export function ColumnMenu(props: Props) {
  const { column, columns, anchor } = props;
  const name = columns[column]?.name ?? "";
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(name);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && props.onClose();
    const escape = (e: KeyboardEvent) => e.key === "Escape" && props.onClose();
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", escape);
    };
  }, [props]);

  const item = (label: string, action: () => void, disabled = false) => (
    <button
      type="button"
      role="menuitem"
      className="menu-item"
      disabled={disabled}
      onClick={() => {
        action();
        props.onClose();
      }}
    >
      {label}
    </button>
  );

  // Mantém o menu dentro da janela estreita do painel.
  const left = Math.max(8, Math.min(anchor.left, window.innerWidth - 228));

  return (
    <div ref={ref} className="menu column-menu" role="menu" style={{ left, top: anchor.top }}>
      <p className="menu-title">{name}</p>
      {renaming ? (
        <form
          className="rename"
          onSubmit={(e) => {
            e.preventDefault();
            if (newName.trim()) props.onRename(newName.trim());
            props.onClose();
          }}
        >
          <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} aria-label="Novo nome" />
          <button type="submit" className="button primary">
            OK
          </button>
        </form>
      ) : (
        <button
          type="button"
          role="menuitem"
          className="menu-item"
          disabled={!props.hasHeader}
          title={props.hasHeader ? undefined : 'Marque "Primeira linha é cabeçalho" para dar nome às colunas'}
          onClick={() => setRenaming(true)}
        >
          Renomear…
        </button>
      )}
      {item("Resumo", props.onSummary)}
      {item("Filtrar…", props.onFilter)}
      {item("Formatar e limpar…", props.onFormat)}
      <label className="menu-select">
        Validar como
        <select
          value={props.rule ?? ""}
          onChange={(e) => {
            props.onValidate((e.target.value || undefined) as ValidationRule | undefined);
            props.onClose();
          }}
        >
          <option value="">Sem validação</option>
          {Object.entries(RULE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <hr />
      {item("Dividir…", props.onSplit)}
      {item("Duplicar", props.onDuplicate)}
      {item("Mover para a esquerda", () => props.onMove(column - 1), column === 0)}
      {item("Mover para a direita", () => props.onMove(column + 1), column === columns.length - 1)}
      {item("Excluir coluna", props.onDelete, columns.length === 1)}
    </div>
  );
}
