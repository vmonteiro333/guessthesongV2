import type { PopularityFilter, PopularityFilterId } from "../types/difficulty";

export const popularityFilters: PopularityFilter[] = [
  {
    id: "hits",
    name: "Hits",
    description: "Só as faixas mais tocadas da playlist — as que todo mundo conhece.",
    percentileRange: [0.75, 1],
    status: "soon",
  },
  {
    id: "mid",
    name: "Meio-termo",
    description: "O miolo da playlist: nem mega-hit, nem obscuridade total.",
    percentileRange: [0.25, 0.75],
    status: "soon",
  },
  {
    id: "niche",
    name: "Nicho",
    description: "Só as menos tocadas — para os ouvidos mais treinados.",
    percentileRange: [0, 0.25],
    status: "soon",
  },
];

/** Fallback seguro: id inválido → sem filtro (pool completo). */
export function getPopularityFilter(
  id: PopularityFilterId | string | null
): PopularityFilter | null {
  return popularityFilters.find((f) => f.id === id) ?? null;
}