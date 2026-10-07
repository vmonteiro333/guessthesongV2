import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import { difficulties } from "../data/difficulties";
import type { DifficultyId } from "../types/difficulty";
import { formatSeconds } from "../utils/gameRules";

interface DifficultyPickerProps {
  open: boolean;
  selectedId: DifficultyId;
  onSelect: (id: DifficultyId) => void;
  onClose: () => void;
}

export default function DifficultyPicker({
  open,
  selectedId,
  onSelect,
  onClose,
}: DifficultyPickerProps) {
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
        aria-labelledby="difficulty-picker-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="results-drawer-header">
          <h2 id="difficulty-picker-title">Dificuldade</h2>
          <button ref={closeRef} type="button" className="btn btn-ghost" onClick={onClose}>
            Fechar
          </button>
        </div>
        <div className="results-drawer-body">
          <div className="mode-list">
            {difficulties.map((difficulty) => {
              const isSelected = difficulty.id === selectedId;
              return (
                <button
                  key={difficulty.id}
                  type="button"
                  className={`mode-item mode-item--diff${isSelected ? " mode-item--selected" : ""}`}
                  style={{ "--diff-color": difficulty.color } as CSSProperties}
                  onClick={() => {
                    onSelect(difficulty.id);
                    onClose();
                  }}
                >
                  <span className="mode-item-head">
                    <span className="mode-dot" aria-hidden="true" />
                    <span className="mode-item-name">{difficulty.name}</span>
                    {isSelected && (
                      <span className="mode-check" aria-hidden="true">
                        ✓
                      </span>
                    )}
                  </span>
                  <span className="mode-item-desc">{difficulty.description}</span>
                  <span className="mode-item-stages">
                    {difficulty.stages.map((s) => formatSeconds(s)).join(" → ")}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}