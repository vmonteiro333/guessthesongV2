import { describe, expect, it } from "vitest";
import { compareArtist, compareTitle, evaluateGuess } from "./compareAnswer";
import type { Song } from "../types/song";

const song: Song = {
  id: "song-001",
  title: "Blinding Lights",
  artist: "The Weeknd",
  soundcloudUrl: "https://soundcloud.com/artista/faixa",
};

describe("compareArtist", () => {
  it("aceita acentos, maiúsculas e espaços diferentes", () => {
    expect(compareArtist("  beyoncé ", "Beyoncé")).toBe(true);
  });

  it("rejeita artista diferente", () => {
    expect(compareArtist("beyonc", "Beyoncé")).toBe(false);
  });

  it("rejeita palpite vazio", () => {
    expect(compareArtist("", "Beyoncé")).toBe(false);
  });
});

describe("compareTitle", () => {
  it("aceita variações de caixa/espaço", () => {
    expect(compareTitle("blinding   lights", "Blinding Lights")).toBe(true);
  });

  it("rejeita título diferente (sem fuzzy)", () => {
    expect(compareTitle("blinding light", "Blinding Lights")).toBe(false);
  });
});

describe("evaluateGuess", () => {
  it("artista + música corretos → correct", () => {
    expect(evaluateGuess({ artist: "the weeknd", title: "Blinding Lights" }, song)).toBe("correct");
  });

  it("apenas artista correto → artist", () => {
    expect(evaluateGuess({ artist: "The Weeknd", title: "" }, song)).toBe("artist");
    expect(evaluateGuess({ artist: "The Weeknd", title: "tik tok" }, song)).toBe("artist");
  });

  it("título correto sem artista NÃO encerra a rodada (regra documentada)", () => {
    expect(evaluateGuess({ artist: "", title: "Blinding Lights" }, song)).toBe("wrong");
  });

  it("ambos errados → wrong", () => {
    expect(evaluateGuess({ artist: "Queen", title: "Bohemian" }, song)).toBe("wrong");
  });

  it("ambos vazios → wrong (o hook bloqueia antes de chegar aqui)", () => {
    expect(evaluateGuess({ artist: "", title: "" }, song)).toBe("wrong");
  });
});