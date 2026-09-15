export interface Song {
  id: string;
  title: string;
  artist: string;
  /** Opcional: outras formas do artista que também devem ser aceitas. */
  artistAliases?: string[];
  soundcloudUrl: string;
  coverUrl?: string;
}