import { useEffect, useMemo, useRef } from "react";
import type { SongRoundResult } from "../types/game";
import { computeGameStats } from "../utils/stats";
import { formatSeconds, STAGES } from "../utils/gameRules";
import { loadBestScore } from "../utils/storage";
import { RestartIcon } from "./icons";

interface GameOverProps {
  score: number;
  history: SongRoundResult[];
  playlistName: string;
  maxStreak: number;
  onRestart: () => void;
  onChoosePlaylist: () => void;
}

const RANK_LABEL: Record<string, string> = {
  S: "impecável",
  A: "excelente",
  B: "muito bem",
  C: "na trilha",
  D: "aquecendo",
};

function rankFor(solved: number, played: number): { grade: string; label: string } | null {
  if (played === 0) return null;
  const acc = solved / played;
  if (acc >= 0.9) return { grade: "S", label: RANK_LABEL.S };
  if (acc >= 0.7) return { grade: "A", label: RANK_LABEL.A };
  if (acc >= 0.5) return { grade: "B", label: RANK_LABEL.B };
  if (acc >= 0.3) return { grade: "C", label: RANK_LABEL.C };
  return { grade: "D", label: RANK_LABEL.D };
}

export default function GameOver({
  score,
  history,
  playlistName,
  maxStreak,
  onRestart,
  onChoosePlaylist,
}: GameOverProps) {
  const stats = useMemo(() => computeGameStats(history), [history]);
  const previousBest = useMemo(() => loadBestScore(), []);
  const isRecord = score > previousBest && score > 0;
  const rank = rankFor(stats.solved, stats.played);
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

      {rank && (
        <div className="rank-block" aria-label={`Ranque ${rank.grade}: ${rank.label}`}>
          <span className="rank-badge" aria-hidden="true">
            {rank.grade}
          </span>
          <p className="rank-label">Ranque {rank.grade} — {rank.label}</p>
        </div>
      )}

      {isRecord && <p className="record-badge">🏆 Novo recorde pessoal</p>}

      <p className="gameover-score">{score}</p>
      <p className="gameover-score-label">pontos</p>
      <p className="gameover-playlist">{playlistName}</p>

      <div className="stats-grid">
        <div className="stat">
          <p className="stat-value">
            {stats.solved}/{stats.played}
          </p>
          <p className="stat-label">Acertos</p>
        </div>
        <div className="stat">
          <p className="stat-value">{maxStreak}</p>
          <p className="stat-label">Maior combo</p>
        </div>
        <div className="stat">
          <p className="stat-value">{average}</p>
          <p className="stat-label">Média</p>
        </div>
        <div className="stat">
          <p className="stat-value">{stats.failed}</p>
          <p className="stat-label">Erros</p>
        </div>
        <div className="stat">
          <p className="stat-value">{Math.max(previousBest, score)}</p>
          <p className="stat-label">Recorde</p>
        </div>
        <div className="stat">
          <p className="stat-value">{stats.bestRound?.points ?? 0}</p>
          <p className="stat-label">Melhor rodada</p>
        </div>
      </div>

      {/* momentos memoráveis — só com dados reais da sessão */}
      {stats.bestRound && (
        <p className="gameover-highlight">
          ⚡ Você acertou <strong>"{stats.bestRound.title}"</strong> em{" "}
          {formatSeconds(STAGES[stats.bestRound.solvedAtStage ?? 0])}!
        </p>
      )}
      {maxStreak >= 2 && (
        <p className="gameover-highlight">
          🔥 Seu maior combo foi <strong>{maxStreak}</strong>.
        </p>
      )}

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