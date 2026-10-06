import { useEffect, useRef } from "react";
import { gameModes } from "../data/gameModes";
import type { GameModeId } from "../types/gameMode";

interface ModePickerProps {
  open: boolean;
  selectedId: GameModeId;
  onSelect: (id: GameModeId) => void;
  onClose: () => void;
}

export default function ModePicker({ open, selectedId, onSelect, onClose }: ModePickerProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div
        className="results-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mode-picker-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="results-drawer-header">
          <h2 id="mode-picker-title">Modo de jogo</h2>
          <button ref={closeRef} type="button" className="btn btn-ghost" onClick={onClose}>
            Fechar
          </button>
        </div>
        <div className="results-drawer-body">
          <div className="mode-list">
            {gameModes.map((mode) => {
              const isSelected = mode.id === selectedId;
              const disabled = mode.status !== "available";
              return (
                <button
                  key={mode.id}
                  type="button"
                  className={`mode-item${isSelected ? " mode-item--selected" : ""}`}
                  disabled={disabled}
                  onClick={() => {
                    onSelect(mode.id);
                    onClose();
                  }}
                >
                  <span className="mode-item-head">
                    <span className="mode-item-name">{mode.name}</span>
                    {mode.status === "soon" && <span className="mode-soon">EM BREVE</span>}
                    {isSelected && (
                      <span className="mode-check" aria-hidden="true">
                        ✓
                      </span>
                    )}
                  </span>
                  <span className="mode-item-desc">{mode.description}</span>
                </button>
              );
            })}
          </div>
          <p className="hint">
            Novos modos chegam em breve — dificuldades, durações e desafios diários.
          </p>
        </div>
      </div>
    </div>
  );
}