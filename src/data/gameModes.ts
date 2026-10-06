import type { GameMode, GameModeId } from "../types/gameMode";

export const gameModes: GameMode[] = [
  {
    id: "classic",
    name: "Clássico",
    description:
      "A experiência original: 7 trechos de 0,1s a 16s por música. Quanto menos áudio, mais pontos.",
    status: "available",
  },
  {
    id: "blitz",
    name: "Blitz",
    description: "Partidas curtas com um número fixo de músicas. Ideal para o intervalo.",
    status: "soon",
  },
  {
    id: "hardcore",
    name: "Hardcore",
    description: "Sem autocomplete e sem dicas. Só o seu ouvido contra a playlist.",
    status: "soon",
  },
  {
    id: "daily",
    name: "Desafio diário",
    description: "A mesma sequência de músicas para todo mundo — um desafio novo por dia.",
    status: "soon",
  },
];

/** Fallback seguro: se o localStorage tiver lixo, cai no Clássico. */
export function getGameMode(id: GameModeId | string | null): GameMode {
  return gameModes.find((mode) => mode.id === id) ?? gameModes[0];
}