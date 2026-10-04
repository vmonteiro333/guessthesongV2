import { useEffect, useRef } from "react";
import type { SongRoundResult } from "../types/game";

interface TrackModalProps {
  result: SongRoundResult;
  spotifyUrl: string | null;
  onClose: () => void;
  onNext: () => void;
  isLastRound: boolean;
  brokenCombo: number;
  streakAfter: number;
}

/**
 * Janela de fim de rodada: veredicto + capa + info da faixa + player.
 * Usa o embed OFICIAL do Spotify (prévia de 30s, sem login extra) para
 * não interferir no device do jogo (Web Playback SDK).
 */
export default function TrackModal({
  result,
  spotifyUrl,
  onClose,
  onNext,
  isLastRound,
  brokenCombo, streakAfter
}: TrackModalProps) {
  const nextRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    nextRef.current?.focus();
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const solved = result.solved;

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div
        className="track-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="track-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className={solved ? "track-modal-head track-modal-head--win" : "track-modal-head track-modal-head--lose"}>
          <p className="track-modal-verdict" id="track-modal-title">
            {solved ? "✓ Acertou!" : "✕ Não foi dessa vez"}
          </p>
          {result.points > 0 && (
            <p className="track-modal-points">+{result.points} pts</p>
          )}
        </div>

        <div className="track-modal-body">
          <div className="track-modal-art">
            {spotifyUrl ? (
              <iframe
                title={`Prévia de ${result.title} — ${result.artist}`}
                className="track-modal-embed"
                src={`https://open.spotify.com/embed/track/${spotifyUrl.split("/track/")[1]?.split("?")[0] ?? ""}`}
                loading="lazy"
                allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
              />
            ) : (
              <p className="hint">Prévia indisponível para esta faixa.</p>
            )}
          </div>

          <p className="track-modal-label">A música era</p>
          <p className="track-modal-title">{result.title}</p>
          <p className="track-modal-artist">{result.artist}</p>
        </div>
          {solved && streakAfter >= 2 && (
            <div className="combo-note">
              <span className="combo-badge combo-badge--fire" aria-label={`Combo de ${streakAfter} acertos ativo`}>
                <span className="combo-flame" aria-hidden="true">
                  🔥
                </span>
                COMBO ×{streakAfter}
              </span>
            </div>
          )}
          {!solved && brokenCombo > 0 && (
            <div className="combo-note">
              <span className="combo-badge combo-badge--broken" aria-label={`Combo de ${brokenCombo} acertos quebrado`}>
                💔 Combo de {brokenCombo} perdido
              </span>
            </div>
          )}
        <div className="track-modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Fechar
          </button>
          <button ref={nextRef} type="button" className="btn btn-primary" onClick={onNext}>
            {isLastRound ? "Ver resultado final →" : "Próxima música →"}
          </button>
        </div>
      </div>
    </div>
  );
}