import { useEffect, useRef } from "react";
import type { Playlist } from "../types/playlist";

interface StartScreenProps {
  playlist: Playlist;
  onStart: () => void;
  onChoosePlaylist: () => void;
}

export default function StartScreen({ playlist, onStart, onChoosePlaylist }: StartScreenProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    buttonRef.current?.focus();
  }, []);

  const empty = playlist.songs.length === 0;

  return (
    <section className="start-screen panel" aria-labelledby="start-title">
      <p className="start-kicker">
        {playlist.name} — {playlist.songs.length} músicas
      </p>
      <h2 id="start-title" className="start-title">
        Qual é a música?
      </h2>
      <p className="start-tagline">
        Você ouve trechos cada vez mais longos. Quanto antes acertar, mais pontos vale.
      </p>
      <ul className="start-rules">
        <li>7 trechos por música: 0,1s → 0,5s → 1s → 2s → 4s → 8s → 16s</li>
        <li>O palpite é sempre uma MÚSICA — acertou, leva os pontos cheios da etapa</li>
        <li>Chutou uma música de um artista que participa da secreta? Dica amarela</li>
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
      <button type="button" className="btn btn-ghost btn-large" onClick={onChoosePlaylist}>
        Trocar playlist
      </button>
      <p className="start-footnote">
        Áudio completo via Spotify Premium — use fones para a melhor experiência.
      </p>
    </section>
  );
}