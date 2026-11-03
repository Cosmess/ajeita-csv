import { useState } from "react";

export const PRIVACY_URL = "https://github.com/Cosmess/ajeita-csv/blob/main/PRIVACY.md";

export function SettingsButton({ onClearSaved }: { onClearSaved: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="settings">
      <button
        type="button"
        className="grid-icon"
        aria-label="Configurações"
        aria-expanded={open}
        title="Configurações"
        onClick={() => setOpen((v) => !v)}
      >
        ⚙
      </button>
      {open && (
        <div className="settings-menu" role="menu">
          <p className="muted small">
            O arquivo aberto e o histórico de alterações ficam salvos só neste navegador, para você continuar depois.
          </p>
          <button
            type="button"
            className="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onClearSaved();
            }}
          >
            Limpar dados salvos
          </button>
          <a className="small" href={PRIVACY_URL} target="_blank" rel="noreferrer">
            Política de privacidade
          </a>
        </div>
      )}
    </div>
  );
}
