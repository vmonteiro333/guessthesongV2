export interface Song {
  id: string;
  title: string;
  artist: string;
  /** Opcional: outras formas do artista que também devem ser aceitas. */
  artistAliases?: string[];
  /** Link da faixa: https://open.spotify.com/track/... (prévia de 30s via embed). */
  spotifyUrl: string;
  coverUrl?: string;
}