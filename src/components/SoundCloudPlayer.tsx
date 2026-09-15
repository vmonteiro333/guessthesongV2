import { buildWidgetSrc } from "../utils/soundcloudUrl";
import { LockIcon } from "./icons";

interface SoundCloudPlayerProps {
  /** URL da faixa da sessão atual (usada no src do iframe). */
  trackUrl: string;
  /** Durante a rodada o widget fica desfocado para não entregar a resposta. */
  blurred: boolean;
  attachIframe: (element: HTMLIFrameElement | null) => void;
}

/**
 * APENAS apresentação: um único iframe do widget oficial do SoundCloud.
 * A lógica de áudio vive em services/audio + hooks/useSoundCloud.
 *
 * Nota sobre atribuição: o widget oficial (com a marca e os links do
 * SoundCloud) permanece no DOM o tempo todo. Durante a rodada ele é
 * desfocado (necessário para não entregar a resposta do jogo) e é
 * totalmente revelado no fim da rodada. Não há player customizado nem
 * extração de áudio.
 */
export default function SoundCloudPlayer({ trackUrl, blurred, attachIframe }: SoundCloudPlayerProps) {
  return (
    <div className={blurred ? "sc-player sc-player--blurred" : "sc-player"}>
      <div className="sc-frame-wrap" aria-hidden={blurred || undefined}>
        <iframe
          ref={attachIframe}
          title="Player de áudio do SoundCloud"
          className="sc-iframe"
          src={buildWidgetSrc(trackUrl)}
          scrolling="no"
          tabIndex={-1}
        />
      </div>
      {blurred && (
        <div className="sc-veil" aria-hidden="true">
          <LockIcon />
          <span>Trecho secreto — responda para revelar</span>
        </div>
      )}
      <p className="sc-attribution">
        Áudio via{" "}
        <a href="https://soundcloud.com" target="_blank" rel="noreferrer noopener">
          SoundCloud
        </a>
      </p>
    </div>
  );
}