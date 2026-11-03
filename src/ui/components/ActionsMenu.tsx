import { useEffect, useRef, useState } from "react";
import { ACTION_GROUPS, ACTIONS, type ActionDef } from "../actions";

type Props = {
  disabled: boolean;
  onPick: (action: ActionDef) => void;
  // Itens que abrem janelas próprias (dividir, juntar), no grupo "Arquivos".
  files: { label: string; onClick: () => void }[];
};

export function ActionsMenu({ disabled, onPick, files }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div className="menu-anchor" ref={ref}>
      <button
        type="button"
        className="button"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        Ajeitar ▾
      </button>
      {open && (
        <div className="menu actions-menu" role="menu">
          {ACTION_GROUPS.map(({ group, label }) => (
            <div key={group} className="menu-group">
              <p className="menu-title">{label}</p>
              {ACTIONS.filter((a) => a.group === group).map((action) => (
                <button
                  key={action.id}
                  type="button"
                  role="menuitem"
                  className="menu-item"
                  onClick={() => {
                    setOpen(false);
                    onPick(action);
                  }}
                >
                  {action.label}
                </button>
              ))}
            </div>
          ))}
          <div className="menu-group">
            <p className="menu-title">Arquivos</p>
            {files.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                className="menu-item"
                onClick={() => {
                  setOpen(false);
                  item.onClick();
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
