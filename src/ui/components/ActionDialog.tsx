import { useState } from "react";
import type { Column } from "../../core/dataset";
import type { ActionContext, ActionDef, Field, Values } from "../actions";
import type { Operation } from "../../workers/protocol";

function initialValues(action: ActionDef, column?: number): Values {
  const values: Values = {};
  for (const field of action.fields) {
    if (field.kind === "columns") values[field.key] = column === undefined ? [] : [column];
    else if (field.kind === "column") values[field.key] = column ?? 0;
    else if (field.kind === "text") values[field.key] = field.initial ?? "";
    else values[field.key] = field.initial;
  }
  return values;
}

type Props = {
  action: ActionDef;
  context: ActionContext;
  columns: Column[];
  column?: number;
  onSubmit: (op: Operation) => void;
  onClose: () => void;
};

// Formulário de uma ação, montado a partir dos campos que ela declara.
export function ActionDialog({ action, context, columns, column, onSubmit, onClose }: Props) {
  const [values, setValues] = useState<Values>(() => initialValues(action, column));
  const set = (key: string, value: unknown) => setValues((current) => ({ ...current, [key]: value }));

  const errors = action.fields.flatMap((f) => (f.kind === "text" && f.error?.(values) ? [f.error(values)!] : []));
  const missingColumns = action.fields.some(
    (f) => f.kind === "columns" && !f.optional && (values[f.key] as number[]).length === 0,
  );

  const renderField = (field: Field) => {
    switch (field.kind) {
      case "columns": {
        const selected = values[field.key] as number[];
        const toggle = (index: number) =>
          set(
            field.key,
            selected.includes(index) ? selected.filter((c) => c !== index) : [...selected, index].sort((a, b) => a - b),
          );
        return (
          <fieldset key={field.key} className="column-picker">
            <legend>{field.label}</legend>
            <div className="column-picker-actions">
              <button type="button" className="button link" onClick={() => set(field.key, columns.map((_, i) => i))}>
                Todas
              </button>
              <button type="button" className="button link" onClick={() => set(field.key, [])}>
                Nenhuma
              </button>
            </div>
            <div className="column-picker-list">
              {columns.map((c, i) => (
                <label key={i} className="checkbox">
                  <input type="checkbox" checked={selected.includes(i)} onChange={() => toggle(i)} />
                  {c.name}
                </label>
              ))}
            </div>
            {field.optional && <p className="muted small">{field.optional}</p>}
          </fieldset>
        );
      }
      case "column":
        return (
          <label key={field.key}>
            {field.label}
            <select value={String(values[field.key])} onChange={(e) => set(field.key, Number(e.target.value))}>
              {columns.map((c, i) => (
                <option key={i} value={i}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        );
      case "select":
        return (
          <label key={field.key}>
            {field.label}
            <select value={String(values[field.key])} onChange={(e) => set(field.key, e.target.value)}>
              {field.options.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        );
      case "checkbox":
        return (
          <label key={field.key} className="checkbox">
            <input type="checkbox" checked={Boolean(values[field.key])} onChange={(e) => set(field.key, e.target.checked)} />
            {field.label}
          </label>
        );
      case "number":
        return (
          <label key={field.key}>
            {field.label}
            <input
              type="number"
              min={field.min}
              max={field.max}
              value={Number(values[field.key])}
              onChange={(e) => set(field.key, Number(e.target.value))}
            />
          </label>
        );
      case "text": {
        const error = field.error?.(values);
        return (
          <label key={field.key}>
            {field.label}
            <input
              value={String(values[field.key] ?? "")}
              placeholder={field.placeholder}
              aria-invalid={Boolean(error)}
              onChange={(e) => set(field.key, e.target.value)}
            />
            {error && <span className="field-error">{error}</span>}
          </label>
        );
      }
    }
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <form
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="action-title"
        onSubmit={(e) => {
          e.preventDefault();
          if (errors.length === 0 && !missingColumns) onSubmit(action.toOp(values, context));
        }}
      >
        <h2 id="action-title">{action.label}</h2>
        {action.hint && <p className="muted small">{action.hint}</p>}
        <div className="action-fields">{action.fields.map(renderField)}</div>
        {action.fields.length === 0 && <p className="muted">Vale para o arquivo inteiro.</p>}
        <div className="modal-actions">
          <button type="button" className="button" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="button primary" disabled={errors.length > 0 || missingColumns}>
            Ver prévia
          </button>
        </div>
      </form>
    </div>
  );
}
