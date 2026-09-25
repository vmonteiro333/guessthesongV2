import { describe, expect, it } from "vitest";
import { isSpotifyTrackUrl, toSpotifyUri, parseSpotifyTrackId } from "./spotifyUrl";

describe("spotifyUrl", () => {
  it("aceita URLs de faixa com parâmetros e prefixo de idioma", () => {
    expect(isSpotifyTrackUrl("https://open.spotify.com/track/3A76ChcuE7C1RJt6eGQNXN")).toBe(true);
    expect(isSpotifyTrackUrl("https://open.spotify.com/track/3A76ChcuE7C1RJt6eGQNXN?si=abc")).toBe(true);
    expect(isSpotifyTrackUrl("https://open.spotify.com/intl-pt/track/3A76ChcuE7C1RJt6eGQNXN")).toBe(true);
  });

  it("rejeita playlist, álbum, encurtado e lixo", () => {
    expect(isSpotifyTrackUrl("https://open.spotify.com/playlist/xyz")).toBe(false);
    expect(isSpotifyTrackUrl("https://open.spotify.com/album/xyz")).toBe(false);
    expect(isSpotifyTrackUrl("https://spotify.link/abc123")).toBe(false);
    expect(isSpotifyTrackUrl("")).toBe(false);
  });

  it("parseia e converte para URI spotify:track:", () => {
    expect(parseSpotifyTrackId("https://open.spotify.com/track/3A76ChcuE7C1RJt6eGQNXN?si=x")).toBe(
      "3A76ChcuE7C1RJt6eGQNXN"
    );
    expect(toSpotifyUri("https://open.spotify.com/track/3A76ChcuE7C1RJt6eGQNXN")).toBe(
      "spotify:track:3A76ChcuE7C1RJt6eGQNXN"
    );
  });
});