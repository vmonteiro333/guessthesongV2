import { useEffect, useMemo, useRef } from "react";
import type { SongRoundResult } from "../types/game";
import { computeGameStats } from "../utils/stats";
import { formatSeconds, STAGES } from "../utils/gameRules";
import { loadBestScore } from "../utils/storage";
import { RestartIcon } from "./icons";

interface GameOverProps {
  score: number;
  history: SongRoundResult[];
  onRestart: () => void;
  onChoosePlaylist: () => void;
}

export default function GameOver({ score, history, onRestart, onChoosePlaylist }: GameOverProps) {
  const stats = useMemo(() => computeGameStats(history), [history]);
  const previousBest = useMemo(() => loadBestScore(), []);
  const isRecord = score > previousBest && score > 0;
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    buttonRef.current?.focus();
  }, []);

  const average =
    stats.averageSolveSeconds !== null
      ? formatSeconds(Math.round(stats.averageSolveSeconds * 10) / 10)
      : "—";

  return (
    <section className="gameover panel" aria-labelledby="gameover-title">
      <h2 id="gameover-title" className="gameover-title">
        Fim de jogo
      </h2>
      {isRecord && <p className="record-badge">Novo recorde pessoal!</p>}

      <div className="stats-grid">
        <div className="stat">
          <p className="stat-value">{score}</p>
          <p className="stat-label">Pontuação</p>
        </div>
        <div className="stat">
          <p className="stat-value">{Math.max(previousBest, score)}</p>
          <p className="stat-label">Recorde</p>
        </div>
        <div className="stat">
          <p className="stat-value">
            {stats.solved}/{stats.played}
          </p>
          <p className="stat-label">Acertos</p>
        </div>
        <div className="stat">
          <p className="stat-value">{stats.failed}</p>
          <p className="stat-label">Erros</p>
        </div>
        <div className="stat">
          <p className="stat-value">{stats.errors}</p>
          <p className="stat-label">Indisponíveis</p>
        </div>
        <div className="stat">
          <p className="stat-value">{average}</p>
          <p className="stat-label">Média p/ acertar</p>
        </div>
      </div>

      {stats.bestRound ? (
        <p className="gameover-best-round">
          Melhor rodada:{" "}
          <strong>
            {stats.bestRound.artist} — {stats.bestRound.title}
          </strong>{" "}
          ({stats.bestRound.points} pts em{" "}
          {formatSeconds(STAGES[stats.bestRound.solvedAtStage ?? 0])})
        </p>
      ) : (
        <p className="gameover-best-round">Nenhuma rodada acertada nesta sessão.</p>
      )}

      <div className="gameover-actions">
        <button ref={buttonRef} type="button" className="btn btn-primary btn-large" onClick={onRestart}>
          <RestartIcon />
          Jogar novamente
        </button>
        <button type="button" className="btn btn-ghost btn-large" onClick={onChoosePlaylist}>
          Trocar playlist
        </button>
      </div>
    </section>
  );
}