import type { SongRoundResult } from "../types/game";
import ResultCard from "./ResultCard";

interface ResultListProps {
  results: SongRoundResult[];
}

export default function ResultList({ results }: ResultListProps) {
  return (
    <section className="results panel" aria-label="Resultados das rodadas">
      <h2 className="panel-title">Resultados</h2>
      {results.length === 0 ? (
        <p className="hint">Suas rodadas aparecem aqui.</p>
      ) : (
        <ol className="results-list">
          {results.map((result) => (
            <li key={result.songId}>
              <ResultCard result={result} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}