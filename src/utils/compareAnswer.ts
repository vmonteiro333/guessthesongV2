import type { Song } from "../types/song";
import type { GuessOutcome } from "../types/game";
import { normalizeText } from "./normalizeText";

export interface Guess {
  artist: string;
  title: string;
}

function equalsNormalized(guess: string, expected: string): boolean {
  const a = normalizeText(guess);
  const b = normalizeText(expected);
  return a.length > 0 && a === b;
}

export function compareArtist(guess: string, expected: string): boolean {
  return equalsNormalized(guess, expected);
}

export function compareTitle(guess: string, expected: string): boolean {
  return equalsNormalized(guess, expected);
}

/**
 * Regra de avaliação (documentada):
 * - artista + música corretos → "correct" (encerra a rodada em verde);
 * - apenas artista correto    → "artist"  (amarelo; a rodada continua);
 * - qualquer outro caso       → "wrong"   (vermelho; respondeu só a música,
 *   sem o artista, NÃO pontua: o verde exige artista E música).
 */
export function evaluateGuess(guess: Guess, song: Song): GuessOutcome {
  const artistOk = compareArtist(guess.artist, song.artist);
  const titleOk = compareTitle(guess.title, song.title);
  if (artistOk && titleOk) return "correct";
  if (artistOk) return "artist";
  return "wrong";
}