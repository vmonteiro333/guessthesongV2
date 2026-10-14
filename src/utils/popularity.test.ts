import { describe, expect, it } from "vitest";
import { filterByPopularity } from "./popularity";
import type { PopularityFilter } from "../types/difficulty";
import type { Song } from "../types/song";

function song(id: string, streams?: number): Song {
  return { id, title: id, artist: "A", spotifyUrl: `https://open.spotify.com/track/${id}`, streams };
}

const hitsFilter: PopularityFilter = {
  id: "hits",
  name: "Hits",
  description: "",
  percentileRange: [0.75, 1],
  status: "available",
};
const midFilter: PopularityFilter = { ...hitsFilter, id: "mid", percentileRange: [0.25, 0.75] };
const nicheFilter: PopularityFilter = { ...hitsFilter, id: "niche", percentileRange: [0, 0.25] };

function catalog10(): Song[] {
  // streams: 100, 200, ..., 1000 (ordem embaralhada de propósito)
  const streams = [500, 100, 900, 300, 700, 200, 1000, 400, 800, 600];
  return streams.map((s, i) => song(`t${i}`, s));
}

describe("filterByPopularity", () => {
  it("hits = as 25% mais tocadas", () => {
    const result = filterByPopularity(catalog10(), hitsFilter);
    expect(result).toHaveLength(3);
    expect(result.map((s) => s.streams).sort((a, b) => (a as number) - (b as number))).toEqual([
      800, 900, 1000,
    ]);
  });

  it("meio-termo = o miolo (arredondamento p/ fora: no mínimo a proporção pedida)", () => {
    const result = filterByPopularity(catalog10(), midFilter);
    // n=10, faixa [0.25, 0.75]: floor(2.5)=2 até ceil(7.5)=8 → 6 itens (60%).
    // Arredondar para fora garante "no menos" a proporção pedida.
    expect(result).toHaveLength(6);
    const streams = result.map((s) => s.streams).sort((a, b) => (a as number) - (b as number));
    expect(streams).toEqual([300, 400, 500, 600, 700, 800]);
  });

  it("nicho = as 25% menos tocadas", () => {
    const result = filterByPopularity(catalog10(), nicheFilter);
    expect(result).toHaveLength(3);
    expect(result.map((s) => s.streams).sort((a, b) => (a as number) - (b as number))).toEqual([
      100, 200, 300,
    ]);
  });

  it("sem streams em nenhuma música → pool completo (fallback seguro)", () => {
    const noData = [song("a"), song("b"), song("c")];
    expect(filterByPopularity(noData, hitsFilter)).toEqual(noData);
  });

  it("músicas SEM streams (quando outras têm) ficam de fora", () => {
    const mixed = [...catalog10(), song("sem-streams")];
    const result = filterByPopularity(mixed, nicheFilter);
    expect(result.some((s) => s.id === "sem-streams")).toBe(false);
  });

  it("funciona com catálogo pequeno (n=4, hits → 1 música)", () => {
    const four = [song("a", 10), song("b", 20), song("c", 30), song("d", 40)];
    const result = filterByPopularity(four, hitsFilter);
    expect(result).toEqual([song("d", 40)]);
  });
});