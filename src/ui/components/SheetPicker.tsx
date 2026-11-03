export function SheetPicker(props: { fileName: string; sheets: string[]; onPick: (sheet: string) => void; onCancel: () => void }) {
  return (
    <section className="sheet-picker">
      <p>
        <strong>{props.fileName}</strong> tem {props.sheets.length} abas. Qual você quer abrir?
      </p>
      <ul>
        {props.sheets.map((sheet) => (
          <li key={sheet}>
            <button type="button" className="button" onClick={() => props.onPick(sheet)}>
              {sheet}
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="button link" onClick={props.onCancel}>
        Cancelar
      </button>
    </section>
  );
}
