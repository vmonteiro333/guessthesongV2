import { describe, expect, it } from "vitest";
import { compareArtist, compareTitle, evaluateGuess } from "./compareAnswer";
import type { Song } from "../types/song";

const target: Song = {
  id: "alvo",
  title: "Imagina esse cenário",
  artist: "Matuê feat. Veigh",
  soundcloudUrl: "https://soundcloud.com/a/b",
};

const musicaDoVeigh: Song = {
  id: "veigh-1",
  title: "Talvez você precise de mim",
  artist: "Veigh",
  soundcloudUrl: "https://soundcloud.com/c/d",
};

const musicaAlheia: Song = {
  id: "x",
  title: "Evidências",
  artist: "Chitãozinho & Xororó",
  soundcloudUrl: "https://soundcloud.com/e/f",
};

describe("compareTitle", () => {
  it("ignora acentos, caixa e espaços", () => {
    expect(compareTitle("imagina esse cenario", "Imagina esse cenário")).toBe(true);
  });

  it("aceita 'feat.' no palpite do título", () => {
    expect(compareTitle("Imagina esse cenário feat. Veigh", "Imagina esse cenário")).toBe(true);
  });

  it("rejeita título diferente (sem fuzzy) e vazio", () => {
    expect(compareTitle("imagina o cenario", "Imagina esse cenário")).toBe(false);
    expect(compareTitle("", "Imagina esse cenário")).toBe(false);
  });
});

describe("compareArtist", () => {
  it("aceita nome completo e cada artista da dupla", () => {
    expect(compareArtist("Jorge e Mateus", "Jorge & Mateus")).toBe(true);
    expect(compareArtist("jorge", "Jorge & Mateus")).toBe(true);
    expect(compareArtist("rihanna", "Calvin Harris feat. Rihanna")).toBe(true);
  });

  it("rejeita escritos que não batem", () => {
    expect(compareArtist("jorge mateus", "Jorge & Mateus")).toBe(false);
    expect(compareArtist("simone", "Jorge & Mateus")).toBe(false);
  });
});

describe("evaluateGuess (mecânica v2)", () => {
  it("música correta → correct, mesmo sem preencher o artista", () => {
    expect(evaluateGuess({ title: "imagina esse cenario" }, target, []).outcome).toBe("correct");
  });

  it("música errada de artista do alvo → artist (via campo artista)", () => {
    const result = evaluateGuess(
      { title: "Talvez você precise de mim", artist: "Veigh" },
      target,
      []
    );
    expect(result.outcome).toBe("artist");
    expect(result.matchedArtists).toEqual(["Veigh"]);
  });

  it("música errada de artista do alvo → artist (via catálogo, sem digitar artista)", () => {
    const result = evaluateGuess(
      { title: "Talvez você precise de mim" },
      target,
      [target, musicaDoVeigh, musicaAlheia]
    );
    expect(result.outcome).toBe("artist");
    expect(result.matchedArtists).toEqual(["Veigh"]);
  });

  it("qualquer artista do feat isolado também vira amarelo", () => {
    expect(evaluateGuess({ title: "qualquer", artist: "Matuê" }, target, []).outcome).toBe(
      "artist"
    );
  });

  it("música de artista alheio → wrong", () => {
    expect(
      evaluateGuess({ title: "Evidências", artist: "Chitãozinho" }, target, [musicaAlheia]).outcome
    ).toBe("wrong");
  });

  it("SÓ o artista (sem música) NUNCA vira amarelo", () => {
    expect(evaluateGuess({ title: "", artist: "Matuê" }, target, []).outcome).toBe("wrong");
    expect(evaluateGuess({ title: "   ", artist: "Matuê" }, target, []).outcome).toBe("wrong");
  });
});