import type { SongRoundResult } from "../types/game";

type CardStatus = "solved" | "artist" | "failed" | "error";

const STATUS_LABEL: Record<CardStatus, string> = {
  solved: "Acertou",
  artist: "Artista certo",
  failed: "Errou",
  error: "Indisponível",
};

function getStatus(result: SongRoundResult): CardStatus {
  if (result.error) return "error";
  if (result.solved) return "solved";
  if (result.artistCorrect) return "artist";
  return "failed";
}

/** Cor + rótulo textual (não depende só de cor) + pontos quando houver. */
export default function ResultCard({ result }: { result: SongRoundResult }) {
  const status = getStatus(result);
  const showArtist = result.finalized;
  const revealTitle = result.titleCorrect || result.finalized;
  return (
    <article className={`result-card result-card--${status}`}>
      <span className={`dot dot--${status}`} aria-hidden="true" />
      <div className="result-info">
        <p className="result-names">
          {showArtist ? result.artist : "Artista ???"}
          <span className="result-sep" aria-hidden="true">
            {" — "}
          </span>
          {revealTitle ? result.title : "Música ???"}
        </p>
        <p className="result-status">{STATUS_LABEL[status]}</p>
      </div>
      {result.points > 0 && (
        <span className="result-points" aria-label={`${result.points} pontos`}>
          +{result.points}
        </span>
      )}
      <span className="visually-hidden">
        {`Status: ${STATUS_LABEL[status]}. ${result.points} pontos.`}
      </span>
    </article>
  );
}