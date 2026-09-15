import type { Song } from "../types/song";
import type { GuessOutcome } from "../types/game";
import { normalizeText } from "./normalizeText";

export interface Guess {
  /** Nome da música chutada — obrigatório (é o palpite de verdade). */
  title: string;
  /** Quem canta a música chutada — opcional; alimenta a dica amarela. */
  artist?: string;
}

export interface GuessEvaluation {
  outcome: GuessOutcome;
  /** No caso "artist": quais artistas do alvo foram confirmados. */
  matchedArtists: string[];
}

/** Corta enfeites de título: "Música (feat. X)", "Música prod. Y"… */
const TITLE_DECORATION = /\b(?:feat|ft|part|prod)\b.*$/;

/** Separa artistas compostos: "A feat. B", "A & B", "A e B", "A, B"… */
function splitArtistRaw(raw: string): string[] {
  return raw
    .replace(/\b(?:feat|ft|part)\b\.?\s*/gi, "&")
    .replace(/\s+\b(?:and|with|com)\b\s*/gi, "&")
    .replace(/\s+\be\b\s*/gi, "&")
    .split(/[&/,;]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

interface ArtistName {
  display: string;
  norm: string;
}

/** Formas de um artista: o texto inteiro + cada nome individual (sem duplicar). */
function toNames(raws: readonly string[]): ArtistName[] {
  const names: ArtistName[] = [];
  const seen = new Set<string>();
  for (const raw of raws) {
    if (typeof raw !== "string" || raw.trim() === "") continue;
    for (const candidate of [raw, ...splitArtistRaw(raw)]) {
      const norm = normalizeText(candidate);
      if (norm === "" || seen.has(norm)) continue;
      seen.add(norm);
      names.push({ display: candidate.trim(), norm });
    }
  }
  return names;
}

export function compareTitle(guess: string, expected: string): boolean {
  const g = normalizeText(guess);
  const e = normalizeText(expected);
  if (g === "" || e === "") return false;
  if (g === e) return true;
  const stripped = g.replace(TITLE_DECORATION, "").trim();
  return stripped !== "" && stripped === e;
}

export function compareArtist(guess: string, expected: string | readonly string[]): boolean {
  const expectedRaws = typeof expected === "string" ? [expected] : [...expected];
  const expectedNorms = new Set(toNames(expectedRaws).map((name) => name.norm));
  return toNames([guess]).some((name) => expectedNorms.has(name.norm));
}

/**
 * Mecânica do palpite (v2):
 * 1. O palpite é sempre uma MÚSICA. Sem título, NUNCA vira amarelo
 *    (bloqueia "acertar só o artista").
 * 2. Título igual ao alvo → "correct" (verde; encerra a rodada).
 * 3. Título diferente, mas o palpite é de um artista que PARTICIPA do
 *    alvo (campo artista e/ou título presente no catálogo) → "artist" (amarelo).
 * 4. Caso contrário → "wrong" (vermelho).
 */
export function evaluateGuess(
  guess: Guess,
  song: Song,
  catalog: readonly Song[] = []
): GuessEvaluation {
  if (normalizeText(guess.title) === "") {
    return { outcome: "wrong", matchedArtists: [] };
  }

  if (compareTitle(guess.title, song.title)) {
    return { outcome: "correct", matchedArtists: [] };
  }

  // Quem "assina" o palpite: artista digitado + artistas inferidos do catálogo.
  const attributionRaws: string[] = [guess.artist ?? ""];
  const guessNorm = normalizeText(guess.title);
  for (const candidate of catalog) {
    if (candidate.id === song.id) continue;
    if (normalizeText(candidate.title) === guessNorm) {
      attributionRaws.push(candidate.artist, ...(candidate.artistAliases ?? []));
    }
  }

  const targetNames = toNames([song.artist, ...(song.artistAliases ?? [])]);
  const attrNorms = new Set(toNames(attributionRaws).map((name) => name.norm));
  const matchedArtists = targetNames
    .filter((name) => attrNorms.has(name.norm))
    .map((name) => name.display);

  if (matchedArtists.length > 0) {
    return { outcome: "artist", matchedArtists };
  }
  return { outcome: "wrong", matchedArtists: [] };
}