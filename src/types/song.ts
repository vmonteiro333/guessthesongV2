export interface Song {
  id: string;
  title: string;
  artist: string;
  /** Opcional: outras formas do artista que também devem ser aceitas. */
  artistAliases?: string[];
  /** Link da faixa: https://open.spotify.com/track/... */
  spotifyUrl: string;
  /** Streams totais da faixa (alimenta o filtro de popularidade). */
  streams?: number;
  coverUrl?: string;
}