const TRACK_ID_RE =
  /^https?:\/\/open\.spotify\.com\/(?:intl-[a-z-]+\/)?track\/([A-Za-z0-9]{22})(?:[?#].*)?$/;

export function parseSpotifyTrackId(url: string): string | null {
  if (typeof url !== "string") return null;
  const match = url.trim().match(TRACK_ID_RE);
  return match ? match[1] : null;
}

export function isSpotifyTrackUrl(url: string): boolean {
  return parseSpotifyTrackId(url) !== null;
}

export function toSpotifyUri(url: string): string | null {
  const id = parseSpotifyTrackId(url);
  return id ? `spotify:track:${id}` : null;
}