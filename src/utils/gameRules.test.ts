import { describe, expect, it } from "vitest";
import {
  STAGES,
  STAGE_POINTS,
  getArtistPoints,
  getNextStageIndex,
  getStagePoints,
  getStageSeconds,
  formatSeconds,
  isLastStage,
} from "./gameRules";

describe("estágios", () => {
  it("define os 7 estágios corretos", () => {
    expect(STAGES).toEqual([0.1, 0.5, 1, 2, 4, 8, 16]);
  });

  it("começa em 0,1s", () => {
    expect(getStageSeconds(0)).toBe(0.1);
  });

  it("último estágio é 16s e não tem próximo", () => {
    expect(isLastStage(6)).toBe(true);
    expect(getNextStageIndex(6)).toBeNull();
  });

  it("avança exatamente um estágio por vez", () => {
    expect(getNextStageIndex(0)).toBe(1);
    expect(getNextStageIndex(4)).toBe(5);
    expect(isLastStage(5)).toBe(false);
  });
});

describe("pontuação por estágio", () => {
  it("tabela de pontos completos [7,6,5,4,3,2,1]", () => {
    expect(STAGE_POINTS).toEqual([7, 6, 5, 4, 3, 2, 1]);
    [7, 6, 5, 4, 3, 2, 1].forEach((expected, index) => {
      expect(getStagePoints(index)).toBe(expected);
    });
  });

  it("tabela de pontos só-artista [3,3,2,2,1,1,0]", () => {
    [3, 3, 2, 2, 1, 1, 0].forEach((expected, index) => {
      expect(getArtistPoints(index)).toBe(expected);
    });
  });
});

describe("formatSeconds", () => {
  it("formata no padrão pt-BR", () => {
    expect(formatSeconds(0.1)).toBe("0,1s");
    expect(formatSeconds(0.5)).toBe("0,5s");
    expect(formatSeconds(16)).toBe("16s");
  });
});