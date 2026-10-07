import { LockIcon } from "./icons";
import AudioViz from "./AudioViz";
import type { SnippetPhase } from "../hooks/useAudio";

interface NowPlayingPanelProps {
  secret: boolean;
  playing: boolean;
  phase: SnippetPhase;
  song: { title: string; artist: string } | null;
  streak: number;
  /** Dica revelada: nome do artista (só na dificuldade Fácil). */
  hintArtist: string | null;
  /** Dica revelada: URL da capa do álbum (só na dificuldade Fácil). */
  hintCoverUrl: string | null;
}

export default function NowPlayingPanel({
  secret,
  playing,
  phase,
  song,
  streak,
  hintArtist,
  hintCoverUrl,
}: NowPlayingPanelProps) {
  return (
    <section
      className={secret ? "now-playing now-playing--secret" : "now-playing"}
      aria-label={secret ? "Trecho secreto" : "Música da rodada"}
    >
      {secret ? (
        <>
          <span className="np-lock" aria-hidden="true">
            <LockIcon />
          </span>
          <p className="np-title">Escute com atenção</p>
          <AudioViz phase={phase} />
          {hintCoverUrl && (
            <img
              className="np-hint-cover"
              src={hintCoverUrl}
              alt="Capa do álbum (dica parcialmente desfocada)"
            />
          )}
          {hintArtist && <p className="np-hint">DICA · Artista: {hintArtist}</p>}
          <p className="np-sub">
            {phase === "buffering" ? (
              "Preparando o áudio…"
            ) : playing ? (
              <span className="np-playing">Tocando trecho…</span>
            ) : (
              "Responda ou pule para revelar"
            )}
          </p>
          {streak >= 2 && (
            <span
              className={
                streak >= 5
                  ? "streak streak--fire"
                  : streak >= 3
                    ? "streak streak--hot"
                    : "streak"
              }
            >
              <span className="streak-flame" aria-hidden="true">
                🔥
              </span>
              COMBO ×{streak}
              {streak >= 5 ? " — lendário" : streak >= 3 ? " — em chamas" : ""}
            </span>
          )}
        </>
      ) : (
        <>
          <p className="np-reveal-label">A música era</p>
          <p className="np-title">{song?.title ?? "—"}</p>
          <p className="np-sub">{song?.artist ?? ""}</p>
        </>
      )}
      <p className="np-source">Áudio completo via Spotify Premium</p>
    </section>
  );
}