import { STAGES } from "./gameRules";
import type { SongRoundResult } from "../types/game";

export interface GameStats {
  played: number;
  solved: number;
  failed: number;
  errors: number;
  averageSolveSeconds: number | null;
  bestRound: SongRoundResult | null;
}

export function computeGameStats(history: readonly SongRoundResult[]): GameStats {
  const finalized = history.filter((entry) => entry.finalized);
  const solvedEntries = finalized.filter((entry) => entry.solved);
  const errorEntries = finalized.filter((entry) => entry.error === true);
  const failed = finalized.length - solvedEntries.length - errorEntries.length;

  const solveSeconds = solvedEntries
    .map((entry) => entry.solvedAtStage)
    .filter((stage): stage is number => stage !== null)
    .map((stage) => STAGES[stage] ?? 0);

  const averageSolveSeconds =
    solveSeconds.length > 0
      ? solveSeconds.reduce((total, value) => total + value, 0) / solveSeconds.length
      : null;

  const bestRound = solvedEntries.reduce<SongRoundResult | null>(
    (best, entry) => (best === null || entry.points > best.points ? entry : best),
    null
  );

  return {
    played: finalized.length,
    solved: solvedEntries.length,
    failed: Math.max(0, failed),
    errors: errorEntries.length,
    averageSolveSeconds,
    bestRound,
  };
}