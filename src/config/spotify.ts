/**
 * Client ID público do app Spotify (não é segredo — aparece em toda URL de
 * OAuth). Com PKCE, NENHUM client secret é usado no frontend.
 */
export const SPOTIFY_CLIENT_ID = "f990b061be3d4f78aee0dadbec852fe1";

/**
 * Redirect URI da página atual. Em dev vira http://127.0.0.1:5173/ e no
 * Pages vira https://.../guessthesongV2/ — os dois estão cadastrados no
 * dashboard, então o mesmo código funciona nos dois ambientes.
 */
export function getSpotifyRedirectUri(): string {
  let uri = window.location.origin + window.location.pathname;
  if (!uri.endsWith("/")) uri += "/";
  return uri;
}

export const SPOTIFY_SCOPES = [
  "streaming",
  "user-read-private",
  "user-modify-playback-state",
];