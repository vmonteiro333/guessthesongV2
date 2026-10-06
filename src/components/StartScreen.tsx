import { useEffect, useRef, useState } from "react";
import type { Playlist } from "../types/playlist";
import type { GameModeId } from "../types/gameMode";
import { getGameMode } from "../data/gameModes";
import ModePicker from "./ModePicker";

interface StartScreenProps {
  playlist: Playlist;
  modeId: GameModeId;
  onChangeMode: (id: GameModeId) => void;
  onStart: () => void;
}

export default function StartScreen({ playlist, modeId, onChangeMode, onStart }: StartScreenProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const mode = getGameMode(modeId);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const empty = playlist.songs.length === 0;

  useEffect(() => {
    if (!empty) buttonRef.current?.focus();
  }, [empty]);

  return (
    <section className="start-screen" aria-labelledby="start-title">
      {/* Modo de jogo — quando outros modos existirem, seus botões de
          configuração (dificuldade, duração…) entram entre este bloco
          e o título, dirigidos por mode.id */}
      <button
        type="button"
        className="mode-trigger"
        onClick={() => setPickerOpen(true)}
        aria-haspopup="dialog"
        aria-label={`Modo de jogo: ${mode.name}. Abrir seletor de modos`}
      >
        <span className="mode-trigger-label">Modo de jogo</span>
        <span className="mode-trigger-value">
          <span className="mode-trigger-icon" aria-hidden="true">
            ⚡
          </span>
          {mode.name}
          <span className="mode-trigger-chevron" aria-hidden="true">
            ▾
          </span>
        </span>
      </button>
      <p className="mode-description">{mode.description}</p>

      <h2 id="start-title" className="start-title">
        Qual é a música?
      </h2>
      <p className="start-tagline">
        Você ouve trechos cada vez mais longos. Quanto antes acertar, mais pontos vale.
      </p>

      <ul className="start-rules">
        <li>7 trechos por música: 0,1s → 0,5s → 1s → 2s → 4s → 8s → 16s</li>
        <li>O palpite é sempre uma MÚSICA — acertou, leva os pontos cheios da etapa</li>
        <li>Chutou uma música de um artista que participa da secreta? Dica de artista</li>
        <li>Não sabe? Pule a etapa e ouça um trecho maior</li>
      </ul>

      {empty ? (
        <p className="feedback feedback--wrong">
          <span className="feedback-message">
            Esta playlist está vazia — importe as músicas de novo.
          </span>
        </p>
      ) : (
        <button ref={buttonRef} type="button" className="btn btn-primary btn-large" onClick={onStart}>
          Começar a jogar
        </button>
      )}

      <ModePicker
        open={pickerOpen}
        selectedId={mode.id}
        onSelect={onChangeMode}
        onClose={() => setPickerOpen(false)}
      />

      <p className="start-footnote">
        Áudio completo via Spotify Premium — use fones para a melhor experiência.
      </p>
    </section>
  );
}