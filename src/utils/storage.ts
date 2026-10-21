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

// ⚠️ TEMPO agora é SEMPRE ativo: o campo `time.enabled` deixou de existir.
// Seleções salvas no formato antigo (com `time.enabled`) são lidas e
// migradas automaticamente na carga — ninguém perde a escolha salva.
const SELECTION_KEY = "guessthesong:difficulty-selection";
const LEGACY_DIFFICULTY_KEY = "guessthesong:selected-difficulty";

const TIME_IDS: DifficultyId[] = ["easy", "normal", "hard", "very-hard", "hardcore"];

function isTimeDifficultyId(value: unknown): value is DifficultyId {
  return typeof value === "string" && (TIME_IDS as string[]).includes(value);
}

/**
 * Normaliza qualquer formato já usado pelo jogo para o formato ATUAL:
 * - atual:  { time: { difficultyId }, popularity: { enabled, filterId } }
 * - v1:     { time: { enabled, difficultyId }, popularity: { ... } } → `enabled` descartado
 * - legacy: "very-hard" (string solta da chave antiga)
 */
function normalizeSelection(value: unknown): DifficultySelection {
  const base: DifficultySelection = {
    time: { difficultyId: DEFAULT_DIFFICULTY_SELECTION.time.difficultyId },
    popularity: { ...DEFAULT_DIFFICULTY_SELECTION.popularity },
  };

  if (typeof value === "string") {
    // Formato bem antigo: só o id da dificuldade de tempo
    if (isTimeDifficultyId(value)) base.time.difficultyId = value;
    return base;
  }

  if (typeof value !== "object" || value === null) return base;
  const v = value as Record<string, unknown>;

  // ---- tempo: formato novo { difficultyId } ou antigo { enabled, difficultyId } ----
  const time = (typeof v.time === "object" && v.time !== null ? v.time : v) as Record<string, unknown>;
  if (isTimeDifficultyId(time.difficultyId)) {
    base.time.difficultyId = time.difficultyId;
  }

  // ---- popularidade: mantém o que vier (validado) ----
  if (typeof v.popularity === "object" && v.popularity !== null) {
    const pop = v.popularity as Record<string, unknown>;
    if (typeof pop.enabled === "boolean") {
      base.popularity.enabled = pop.enabled;
    }
    if (typeof pop.filterId === "string") {
      // id inválido não quebra: getPopularityFilter devolve null e o App usa o pool completo
      base.popularity.filterId = pop.filterId as DifficultySelection["popularity"]["filterId"];
    }
  }

  return base;
}

/**
 * Seleção combinada (tempo + popularidade). Migra automaticamente dos
 * formatos antigos (com `time.enabled` ou só-tempo) para o atual.
 */
export function loadDifficultySelection(): DifficultySelection {
  try {
    const raw = window.localStorage.getItem(SELECTION_KEY);
    if (raw) return normalizeSelection(JSON.parse(raw));

    // Migração da chave antiga (só-tempo)
    const legacy = window.localStorage.getItem(LEGACY_DIFFICULTY_KEY);
    if (legacy) return normalizeSelection(legacy);
  } catch {
    /* noop */
  }
  return normalizeSelection(null);
}

export function saveDifficultySelection(selection: DifficultySelection): void {
  try {
    window.localStorage.setItem(SELECTION_KEY, JSON.stringify(normalizeSelection(selection)));
  } catch {
    /* noop */
  }
}