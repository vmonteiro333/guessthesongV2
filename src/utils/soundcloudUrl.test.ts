import { describe, expect, it } from "vitest";
import { buildWidgetSrc, isValidSoundCloudUrl } from "./soundcloudUrl";

describe("buildWidgetSrc", () => {
  it("monta a URL do widget com auto_play=false", () => {
    const src = buildWidgetSrc("https://soundcloud.com/artista/faixa");
    expect(src.startsWith("https://w.soundcloud.com/player/?")).toBe(true);
    expect(src).toContain("auto_play=false");
    expect(src).toContain(encodeURIComponent("https://soundcloud.com/artista/faixa"));
  });
});

describe("isValidSoundCloudUrl", () => {
  it("aceita permalinks https do soundcloud", () => {
    expect(isValidSoundCloudUrl("https://soundcloud.com/artista/faixa")).toBe(true);
    expect(isValidSoundCloudUrl("https://www.soundcloud.com/artista/faixa")).toBe(true);
  });

  it("rejeita http, outros domínios e lixo", () => {
    expect(isValidSoundCloudUrl("http://soundcloud.com/a/b")).toBe(false);
    expect(isValidSoundCloudUrl("https://exemplo.com/a/b")).toBe(false);
    expect(isValidSoundCloudUrl("qualquer coisa")).toBe(false);
    expect(isValidSoundCloudUrl("")).toBe(false);
  });
});