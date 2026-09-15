import { describe, expect, it } from "vitest";
import { computeGameStats } from "./stats";
import type { SongRoundResult } from "../types/game";

function makeResult(overrides: Partial<SongRoundResult>): SongRoundResult {
  return {
    songId: "s",
    artist: "Artista",
    title: "Música",
    artistCorrect: false,
    titleCorrect: false,
    solved: false,
    solvedAtStage: null,
    artistAtStage: null,
    points: 0,
    finalized: true,
    ...overrides,
  };
}

describe("computeGameStats", () => {
  it("histórico vazio → zeros e nulls", () => {
    const stats = computeGameStats([]);
    expect(stats.played).toBe(0);
    expect(stats.solved).toBe(0);
    expect(stats.averageSolveSeconds).toBeNull();
    expect(stats.bestRound).toBeNull();
  });

  it("cenário misto: acerto, erro com artista e faixa indisponível", () => {
    const history: SongRoundResult[] = [
      makeResult({ songId: "a", solved: true, solvedAtStage: 0, points: 7, artistCorrect: true, titleCorrect: true, artistAtStage: 0 }),
      makeResult({ songId: "b", artistCorrect: true, artistAtStage: 2, points: 2 }),
      makeResult({ songId: "c", error: true, points: 0 }),
    ];
    const stats = computeGameStats(history);
    expect(stats.played).toBe(3);
    expect(stats.solved).toBe(1);
    expect(stats.failed).toBe(1);
    expect(stats.errors).toBe(1);
    expect(stats.averageSolveSeconds).toBeCloseTo(0.1);
    expect(stats.bestRound?.songId).toBe("a");
  });
});