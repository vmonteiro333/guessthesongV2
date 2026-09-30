import { useEffect, useRef } from "react";
import type { SongRoundResult } from "../types/game";
import ResultCard from "./ResultCard";

interface ResultDrawerProps {
  open: boolean;
  results: SongRoundResult[];
  onClose: () => void;
}

export default function ResultDrawer({ open, results, onClose }: ResultDrawerProps) {
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

  const solved = results.filter((r) => r.solved).length;

  return (
    <div
      className="results-overlay"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="results-drawer panel"
        role="dialog"
        aria-modal="true"
        aria-label="Resultados das rodadas"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="results-drawer-header">
          <h2>
            Resultados — {solved}/{results.length} acertadas
          </h2>
          <button ref={closeRef} type="button" className="btn btn-ghost" onClick={onClose}>
            Fechar
          </button>
        </div>
        <div className="results-drawer-body">
          {results.length === 0 ? (
            <p className="hint">Nenhuma rodada concluída ainda nesta sessão.</p>
          ) : (
            <ol className="results-list">
              {results.map((result) => (
                <li key={result.songId}>
                  <ResultCard result={result} />
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}