export type DifficultyId = "easy" | "normal" | "hard" | "very-hard" | "hardcore";

export interface Difficulty {
  id: DifficultyId;
  name: string;
  description: string;
  /** Durações (segundos) das etapas, em ordem crescente. SEMPRE um prefixo de STAGES. */
  stages: number[];
  /** Habilita o botão de dica (artista/capa). */
  allowHints: boolean;
  /** Autocomplete também encontra músicas pelo nome do artista. */
  allowArtistSearch: boolean;
  /** Cor de identidade no seletor (hex). */
  color: string;
}

// ==================== Dimensão POPULARIDADE ====================

export type PopularityFilterId = "hits" | "mid" | "niche";

export interface PopularityFilter {
  id: PopularityFilterId;
  name: string;
  description: string;
  /**
   * Faixa de percentis [min, max] da playlist (0..1), ordenada por streams.
   * Ex.: hits = [0.75, 1] → as 25% mais tocadas DAQUELA playlist.
   */
  percentileRange: [number, number];
  /** "soon" até os dados de streams serem injetados no catálogo. */
  status: "available" | "soon";
}

/**
 * Escolha combinada da aba Dificuldade: as duas dimensões são independentes
 * (pode ativar só tempo, só popularidade, as duas ou nenhuma).
 */
export interface DifficultySelection {
  time: { difficultyId: DifficultyId };
  popularity: { enabled: boolean; filterId: PopularityFilterId | null };
}

export const DEFAULT_DIFFICULTY_SELECTION: DifficultySelection = {
  time: { difficultyId: "normal" },
  popularity: { enabled: false, filterId: null },
};