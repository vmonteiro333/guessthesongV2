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