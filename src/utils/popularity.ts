import type { Song } from "../types/song";
import type { PopularityFilter } from "../types/difficulty";

/**
 * Filtra a playlist por POPULARIDADE RELATIVA (percentis da própria playlist,
 * não valores absolutos de streams — assim "Nicho" funciona em qualquer
 * playlist, de hits nacionais a coleção obscura).
 *
 * Regras:
 * - Ordena por streams (crescente) e fatia pela faixa de percentis,
 *   arredondando as bordas PARA FORA (garante no mínimo a proporção pedida);
 * - Faixas SEgadas: em empates de streams a fronteira pode variar ±1 faixa;
 * - Se NENHUMA música tiver streams → pool completo (fallback seguro, o jogo
 *   nunca quebra por falta de dados);
 * - Músicas sem streams, quando outras têm, ficam de fora do filtro.
 */
export function filterByPopularity(songs: Song[], filter: PopularityFilter): Song[] {
  const withStreams = songs.filter(
    (song) => typeof song.streams === "number" && song.streams >= 0
  );
  if (withStreams.length === 0) return songs;

  const sorted = [...withStreams].sort(
    (a, b) => (a.streams as number) - (b.streams as number)
  );
  const n = sorted.length;
  const lo = Math.max(0, Math.floor(filter.percentileRange[0] * n));
  const hi = Math.min(n, Math.ceil(filter.percentileRange[1] * n));
  if (hi <= lo) return sorted.slice(0, Math.max(1, n)); // faixa degenerada: tudo

  return sorted.slice(lo, hi);
}

/** Menor pool aceitável para uma partida com filtro (aviso na UI quando abaixo). */
export const MIN_POOL_SIZE = 5;