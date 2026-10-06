import { Fragment, useEffect, useRef, useState } from "react";
import { assetUrl } from "../config/assets";
import type { Playlist } from "../types/playlist";
import type { GameModeId } from "../types/gameMode";
import { getGameMode } from "../data/gameModes";
import { STAGES, formatSeconds } from "../utils/gameRules";
import ModePicker from "./ModePicker";
import { NoteIcon, PlayIcon } from "./icons";

interface StartScreenProps {
  playlist: Playlist;
  modeId: GameModeId;
  onChangeMode: (id: GameModeId) => void;
  onStart: () => void;
  onChoosePlaylist: () => void;
}

export default function StartScreen({
  playlist,
  modeId,
  onChangeMode,
  onStart,
  onChoosePlaylist,
}: StartScreenProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const mode = getGameMode(modeId);
  const ctaRef = useRef<HTMLButtonElement>(null);
  const empty = playlist.songs.length === 0;

  useEffect(() => {
    if (!empty) ctaRef.current?.focus();
  }, [empty]);

  return (
    <section className="home" aria-labelledby="home-title">
      <header className="home-brand" aria-hidden="true">
        <span className="brand-mark">
          <NoteIcon />
        </span>
        <span className="home-brand-name">Guess the Song</span>
      </header>

      <div className="home-title-block">
        <h1 id="home-title" className="start-title home-title">
          Qual é a música?
        </h1>
        <p className="start-tagline home-tagline">
          Ouça um trecho. Reconheça antes que ele fique maior.
          <br />
          Quanto mais rápido, mais pontos.
        </p>
      </div>

      <aside className="home-side">
        <div className="playlist-mini">
          <PlaylistCover playlist={playlist} />
          <div className="playlist-mini-info">
            <span className="playlist-mini-name" title={playlist.name}>
              {playlist.name}
            </span>
            <span className="playlist-mini-count">
              {playlist.songs.length} música{playlist.songs.length === 1 ? "" : "s"}
            </span>
          </div>
          <button
            type="button"
            className="playlist-mini-swap"
            onClick={onChoosePlaylist}
            aria-label="Trocar playlist"
          >
            Trocar
          </button>
        </div>

        <button
          type="button"
          className="mode-pill"
          onClick={() => setPickerOpen(true)}
          aria-haspopup="dialog"
          aria-label={`Modo de jogo: ${mode.name}. Abrir seletor de modos`}
        >
          <span className="mode-pill-label">MODO</span>
          <span className="mode-pill-value">
            <span aria-hidden="true">⚡</span>
            {mode.name}
          </span>
          <span className="mode-pill-chevron" aria-hidden="true">
            ▾
          </span>
        </button>
      </aside>

      <div
        className="home-progression"
        aria-label={`Progressão dos trechos: 7 etapas, de ${formatSeconds(STAGES[0])} até ${formatSeconds(
          STAGES[STAGES.length - 1]
        )}`}
      >
        <span className="prog-label" aria-hidden="true">
          7 etapas
        </span>
        <div className="prog-track" aria-hidden="true">
          {STAGES.map((stage, index) => (
            <Fragment key={stage}>
              <span
                className={
                  index === STAGES.length - 1 ? "prog-chip prog-chip--final" : "prog-chip"
                }
              >
                {formatSeconds(stage)}
              </span>
              {index < STAGES.length - 1 && <span className="prog-line" />}
            </Fragment>
          ))}
        </div>
      </div>

      <div className="home-cta">
        <button
          ref={ctaRef}
          type="button"
          className="btn btn-primary btn-large btn-play"
          onClick={onStart}
          disabled={empty}
        >
          <PlayIcon />
          Jogar agora
        </button>
        {empty && (
          <p className="home-empty-note" role="status">
            Esta playlist está vazia — importe as músicas de novo.
          </p>
        )}
        <p className="start-footnote">
          Áudio completo via Spotify Premium · use fones para a melhor experiência.
        </p>
      </div>

      <ModePicker
        open={pickerOpen}
        selectedId={mode.id}
        onSelect={onChangeMode}
        onClose={() => setPickerOpen(false)}
      />
    </section>
  );
}

function PlaylistCover({ playlist }: { playlist: Playlist }) {
  const src = playlist.cover ? assetUrl(playlist.cover) : null;
  if (src) {
    return <img className="playlist-mini-cover" src={src} alt="" loading="lazy" />;
  }
  return (
    <span className="playlist-mini-cover playlist-mini-cover--fallback" aria-hidden="true">
      {playlist.name.slice(0, 2).toUpperCase()}
    </span>
  );
}