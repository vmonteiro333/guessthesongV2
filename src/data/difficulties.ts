import type { Difficulty, DifficultyId } from "../types/difficulty";
import { STAGES } from "../utils/gameRules";

export const difficulties: Difficulty[] = [
  {
    id: "easy",
    name: "Fácil",
    description: "Tudo liberado + dicas de artista e capa do álbum.",
    stages: [...STAGES],
    allowHints: true,
    allowArtistSearch: true,
    color: "#00e676",
  },
  {
    id: "normal",
    name: "Médio",
    description: "O jogo padrão: 7 trechos, sem dicas.",
    stages: [...STAGES],
    allowHints: false,
    allowArtistSearch: true,
    color: "#fde047",
  },
  {
    id: "hard",
    name: "Difícil",
    description: "Sem o trecho de 16s e sem buscar por artista no palpite.",
    stages: [0.1, 0.5, 1, 2, 4, 8],
    allowHints: false,
    allowArtistSearch: false,
    color: "#f87171",
  },
  {
    id: "very-hard",
    name: "Muito difícil",
    description: "Sem 16s, 8s e 4s — só quatro chances.",
    stages: [0.1, 0.5, 1, 2],
    allowHints: false,
    allowArtistSearch: false,
    color: "#b91c1c",
  },
  {
    id: "hardcore",
    name: "Hardcore",
    description: "0,1s. Uma única chance por música.",
    stages: [0.1],
    allowHints: false,
    allowArtistSearch: false,
    color: "#6d28d9",
  },
];

/** Fallback seguro: id inválido cai no Médio (comportamento padrão). */
export function getDifficulty(id: DifficultyId | string | null): Difficulty {
  return difficulties.find((d) => d.id === id) ?? difficulties[1];
}