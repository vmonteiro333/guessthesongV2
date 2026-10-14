import type { GameModeId } from "../types/gameMode";
import type { DifficultyId, DifficultySelection } from "../types/difficulty";
import { DEFAULT_DIFFICULTY_SELECTION } from "../types/difficulty";

const BEST_SCORE_KEY = "guessthesong:best-score";

/** Recorde pessoal (best-effort; localStorage pode estar indisponível). */
export function loadBestScore(): number {
  try {
    const raw = window.localStorage.getItem(BEST_SCORE_KEY);
    if (!raw) return 0;
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  } catch {
    return 0;
  }
}

export function saveBestScore(score: number): void {
  try {
    window.localStorage.setItem(BEST_SCORE_KEY, String(Math.floor(score)));
  } catch {
    /* localStorage indisponível: ignora silenciosamente */
  }
}

const PLAYLIST_KEY = "guessthesong:selected-playlist";

/** Última playlist escolhida (best-effort). */
export function loadSelectedPlaylistId(): string | null {
  try {
    return window.localStorage.getItem(PLAYLIST_KEY);
  } catch {
    return null;
  }
}

export function saveSelectedPlaylistId(id: string): void {
  try {
    window.localStorage.setItem(PLAYLIST_KEY, id);
  } catch {
    /* noop */
  }
}

const MODE_KEY = "guessthesong:selected-mode";

export function loadSelectedModeId(): GameModeId | null {
  try {
    const raw = window.localStorage.getItem(MODE_KEY);
    if (raw === "classic" || raw === "blitz" || raw === "hardcore" || raw === "daily") {
      return raw;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveSelectedModeId(id: GameModeId): void {
  try {
    window.localStorage.setItem(MODE_KEY, id);
  } catch {
    /* noop */
  }
}

// ==================== Seleção de dificuldade (combinada) ====================

const SELECTION_KEY = "guessthesong:difficulty-selection";
const LEGACY_DIFFICULTY_KEY = "guessthesong:selected-difficulty";

const TIME_IDS: DifficultyId[] = ["easy", "normal", "hard", "very-hard", "hardcore"];

function isValidSelection(value: unknown): value is DifficultySelection {
  if (typeof value !== "object" || value === null) return false;
  const v = value as DifficultySelection;
  return (
    typeof v.time === "object" &&
    v.time !== null &&
    typeof v.time.enabled === "boolean" &&
    TIME_IDS.includes(v.time.difficultyId) &&
    typeof v.popularity === "object" &&
    v.popularity !== null &&
    typeof v.popularity.enabled === "boolean"
  );
}

/**
 * Seleção combinada (tempo + popularidade). Migra automaticamente da chave
 * antiga (só-tempo) para o novo formato.
 */
export function loadDifficultySelection(): DifficultySelection {
  try {
    const raw = window.localStorage.getItem(SELECTION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (isValidSelection(parsed)) return parsed;
    }
    // Migração da chave antiga
    const legacy = window.localStorage.getItem(LEGACY_DIFFICULTY_KEY);
    if (
      legacy === "easy" ||
      legacy === "normal" ||
      legacy === "hard" ||
      legacy === "very-hard" ||
      legacy === "hardcore"
    ) {
      return {
        time: { enabled: true, difficultyId: legacy },
        popularity: { enabled: false, filterId: null },
      };
    }
  } catch {
    /* noop */
  }
  return DEFAULT_DIFFICULTY_SELECTION;
}

export function saveDifficultySelection(selection: DifficultySelection): void {
  try {
    window.localStorage.setItem(SELECTION_KEY, JSON.stringify(selection));
  } catch {
    /* noop */
  }
}