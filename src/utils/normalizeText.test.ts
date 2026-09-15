import { describe, expect, it } from "vitest";
import { normalizeText } from "./normalizeText";

describe("normalizeText", () => {
  it("converte para minúsculas", () => {
    expect(normalizeText("Bohemian Rhapsody")).toBe("bohemian rhapsody");
  });

  it("remove acentos", () => {
    expect(normalizeText("Beyoncé")).toBe("beyonce");
    expect(normalizeText("Ação")).toBe("acao");
  });

  it("remove espaços extras (bordas e meio)", () => {
    expect(normalizeText("  Queen    of   Stone ")).toBe("queen of stone");
  });

  it("remove pontuação simples", () => {
    expect(normalizeText("Don't Stop Me Now!")).toBe("dont stop me now");
    expect(normalizeText("Hello, World!")).toBe("hello world");
  });

  it("trata hífens e barras como espaço", () => {
    expect(normalizeText("AC/DC - Thunderstruck")).toBe("ac dc thunderstruck");
  });

  it("normaliza & para and", () => {
    expect(normalizeText("Simon & Garfunkel")).toBe("simon and garfunkel");
  });

  it("mantém números", () => {
    expect(normalizeText("7 Rings")).toBe("7 rings");
  });

  it("retorna vazio para entradas vazias", () => {
    expect(normalizeText("")).toBe("");
    expect(normalizeText("   ")).toBe("");
  });
});