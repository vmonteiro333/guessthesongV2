import { describe, expect, it } from "vitest";
import { computeRoundPoints } from "./score";

describe("computeRoundPoints", () => {
  it("acerto completo paga a pontuação cheia do estágio, uma única vez", () => {
    const expected = [7, 6, 5, 4, 3, 2, 1];
    expected.forEach((points, stage) => {
      expect(
        computeRoundPoints({
          solved: true,
          solvedAtStage: stage,
          artistCorrect: true, // amarelo anterior não pode somar nada extra
          artistAtStage: 0,
        })
      ).toBe(points);
    });
  });

  it("rodada perdida com artista descoberto paga floor(pontos/2) do estágio do artista", () => {
    const expected = [3, 3, 2, 2, 1, 1, 0];
    expected.forEach((points, stage) => {
      expect(
        computeRoundPoints({
          solved: false,
          solvedAtStage: null,
          artistCorrect: true,
          artistAtStage: stage,
        })
      ).toBe(points);
    });
  });

  it("nada descoberto paga zero", () => {
    expect(
      computeRoundPoints({ solved: false, solvedAtStage: null, artistCorrect: false, artistAtStage: null })
    ).toBe(0);
  });

  it("é defensiva contra estados inválidos", () => {
    expect(
      computeRoundPoints({ solved: true, solvedAtStage: null, artistCorrect: false, artistAtStage: null })
    ).toBe(0);
  });
});