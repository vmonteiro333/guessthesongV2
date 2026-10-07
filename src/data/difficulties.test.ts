import { describe, expect, it } from "vitest";
import { difficulties, getDifficulty } from "./difficulties";
import { STAGES, STAGE_POINTS } from "../utils/gameRules";

describe("difficulties", () => {
  it("toda lista de etapas é PREFIXO de STAGES — pontos permanecem alinhados", () => {
    for (const d of difficulties) {
      expect(d.stages.length).toBeGreaterThan(0);
      d.stages.forEach((seconds, index) => {
        expect(seconds).toBe(STAGES[index]);
      });
      expect(d.stages.length).toBeLessThanOrEqual(STAGE_POINTS.length);
    }
  });

  it("ordenadas da mais fácil para a mais difícil (etapas nunca aumentam)", () => {
    for (let i = 1; i < difficulties.length; i += 1) {
      expect(difficulties[i].stages.length).toBeLessThanOrEqual(difficulties[i - 1].stages.length);
    }
  });

  it("getDifficulty cai no Médio com id inválido", () => {
    expect(getDifficulty("lixo").id).toBe("normal");
    expect(getDifficulty(null).id).toBe("normal");
  });
});