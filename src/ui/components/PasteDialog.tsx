import { useState } from "react";

// Dados colados: JSON (lista de objetos) ou texto de planilha/página (tabulação, ";" ou espaços).
export function PasteDialog(props: { onSubmit: (text: string) => void; onClose: () => void }) {
  const [text, setText] = useState("");
  const looksJson = /^\s*[[{]/.test(text);
  return (
    <div className="modal-backdrop" role="presentation">
      <form
        className="modal wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="paste-title"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) props.onSubmit(text);
        }}
      >
        <h2 id="paste-title">Colar dados</h2>
        <p className="muted small">
          Cole células copiadas do Excel ou do Google Sheets, texto com colunas separadas por tabulação, ";" ou espaços, ou
          um JSON (lista de objetos).
        </p>
        <textarea
          className="paste-area"
          autoFocus
          rows={12}
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="Dados colados"
          placeholder={'nome\tcidade\nMaria\tRecife\n\nou\n\n[{"nome": "Maria", "endereco": {"cidade": "Recife"}}]'}
        />
        {text.trim() && <p className="muted small">Reconhecido como {looksJson ? "JSON" : "texto em colunas"}.</p>}
        <div className="modal-actions">
          <button type="button" className="button" onClick={props.onClose}>
            Cancelar
          </button>
          <button type="submit" className="button primary" disabled={!text.trim()}>
            Criar planilha
          </button>
        </div>
      </form>
    </div>
  );
}
