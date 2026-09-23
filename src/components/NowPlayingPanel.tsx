import { LockIcon } from "./icons";

interface NowPlayingPanelProps {
  secret: boolean;
  playing: boolean;
  song: { title: string; artist: string } | null;
}

/** Painel de áudio: secreto durante a rodada, revelado no fim (sem iframe!). */
export default function NowPlayingPanel({ secret, playing, song }: NowPlayingPanelProps) {
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
          <p className="np-title">Trecho secreto</p>
          <p className="np-sub">
            {playing ? (
              <span className="np-playing">
                <span className="eq" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                Tocando trecho…
              </span>
            ) : (
              "Responda ou pule para revelar"
            )}
          </p>
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