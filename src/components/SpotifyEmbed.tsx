import { LockIcon } from "./icons";

interface SpotifyEmbedProps {
  blurred: boolean;
  attachContainer: (element: HTMLDivElement | null) => void;
}

/**
 * APENAS apresentação: um único container para o embed OFICIAL do Spotify
 * (a IFrame API injeta o iframe dentro dele). Durante a rodada fica
 * desfocado para não entregar a resposta; revelado no fim da rodada.
 * Toca apenas a prévia pública de 30s — sem extração de áudio.
 */
export default function SpotifyEmbed({ blurred, attachContainer }: SpotifyEmbedProps) {
  return (
    <div className={blurred ? "sc-player sc-player--blurred" : "sc-player"}>
      <div className="sc-frame-wrap">
        <div ref={attachContainer} className="spotify-container" aria-hidden={blurred || undefined} />
      </div>
      {blurred && (
        <div className="sc-veil" aria-hidden="true">
          <LockIcon />
          <span>Trecho secreto — responda para revelar</span>
        </div>
      )}
      <p className="sc-attribution">
        Áudio via{" "}
        <a href="https://open.spotify.com" target="_blank" rel="noreferrer noopener">
          Spotify
        </a>{" "}
        (prévia de 30s)
      </p>
    </div>
  );
}