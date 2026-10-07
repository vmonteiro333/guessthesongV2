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