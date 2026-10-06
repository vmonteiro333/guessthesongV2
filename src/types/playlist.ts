import type { Song } from "./song";

export interface Playlist {
  /** Slug único (nome do arquivo), ex.: "principal". */
  id: string;
  /** Nome de exibição, ex.: "Trap BR". */
  name: string;
  /** Descrição curta exibida no seletor (opcional). */
  description?: string;
  /** Caminho da capa em /public (opcional), ex.: "/playlists/principal.jpg". */
  cover?: string;
  songs: Song[];
}