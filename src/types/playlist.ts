import type { Song } from "./song";

export interface Playlist {
  /** Slug único (nome do arquivo), ex.: "principal". */
  id: string;
  /** Nome de exibição, ex.: "Trap BR". */
  name: string;
  songs: Song[];
}