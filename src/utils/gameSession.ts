import type { DifficultySelection } from "../types/difficulty";
import type { GameModeId } from "../types/gameMode";
import type { SongRoundResult } from "../types/game";
import type { Playlist } from "../types/playlist";
import { difficulties } from "../data/difficulties";
import { getPopularityFilter } from "../data/popularityFilters";
import { filterByPopularity } from "./popularity";
import { computeRoundPoints } from "./score";

export const SESSION_KEY = "guessthesong:recovery:v1";
export const SESSION_TTL_MS = 4 * 60 * 60 * 1000;
export type ResumeStatus = "ready" | "waiting_answer" | "finished";

export interface GameProgress {
  queueIds: string[];
  currentSongIndex: number;
  stageIndex: number;
  status: ResumeStatus;
  score: number;
  history: SongRoundResult[];
  streak: number;
  maxStreak: number;
  lastBrokenCombo: number;
  hints: { artist: boolean; cover: boolean };
  hintCoverUrl: string | null;
  answer: { artist: string; title: string };
  round: { artistCorrect: boolean; artistAtStage: number | null };
}

export interface GameSession extends GameProgress {
  version: 1;
  savedAt: number;
  playlistId: string;
  modeId: GameModeId;
  selection: DifficultySelection;
}

export function effectiveSongs(playlist: Playlist, selection: DifficultySelection) {
  const filter = selection.popularity.enabled ? getPopularityFilter(selection.popularity.filterId) : null;
  return filter ? filterByPopularity(playlist.songs, filter) : playlist.songs;
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function integer(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function text(value: unknown): value is string {
  return typeof value === "string" && value.length <= 2000;
}

/** Allowlist de campos: nunca serializa objetos de áudio ou credenciais. */
export function validateSession(value: unknown, playlists: Playlist[], now = Date.now()): GameSession | null {
  if (!object(value) || value.version !== 1 || typeof value.savedAt !== "number" ||
      !Number.isFinite(value.savedAt) || value.savedAt > now || now - value.savedAt > SESSION_TTL_MS) return null;
  const playlist = playlists.find((p) => p.id === value.playlistId);
  if (!playlist || !["classic", "blitz", "hardcore", "daily"].includes(String(value.modeId))) return null;
  const selection = value.selection;
  if (!object(selection) || !object(selection.time) || !object(selection.popularity)) return null;
  const difficultyId = selection.time.difficultyId;
  const difficulty = difficulties.find((d) => d.id === difficultyId);
  const pop = selection.popularity;
  if (!difficulty || typeof pop.enabled !== "boolean" ||
      (pop.filterId !== null && !["hits", "mid", "niche"].includes(String(pop.filterId))) ||
      (pop.enabled && pop.filterId === null)) return null;
  const config: DifficultySelection = {
    time: { difficultyId: difficulty.id },
    popularity: { enabled: pop.enabled, filterId: pop.filterId as DifficultySelection["popularity"]["filterId"] },
  };
  const songs = effectiveSongs(playlist, config);
  const catalog = new Map(songs.map((song) => [song.id, song]));
  if (!Array.isArray(value.queueIds) || !value.queueIds.length || value.queueIds.length !== songs.length ||
      value.queueIds.some((id) => typeof id !== "string" || !catalog.has(id)) ||
      new Set(value.queueIds).size !== value.queueIds.length) return null;
  const queueIds = value.queueIds as string[];
  if (!integer(value.currentSongIndex) || value.currentSongIndex >= value.queueIds.length ||
      !integer(value.stageIndex) || value.stageIndex >= difficulty.stages.length ||
      !["ready", "waiting_answer", "finished"].includes(String(value.status))) return null;
  if (![value.score, value.streak, value.maxStreak, value.lastBrokenCombo].every(integer) ||
      (value.streak as number) > (value.maxStreak as number) ||
      (value.maxStreak as number) > value.queueIds.length ||
      (value.lastBrokenCombo as number) > (value.maxStreak as number)) return null;
  if (!object(value.hints) || typeof value.hints.artist !== "boolean" || typeof value.hints.cover !== "boolean" ||
      (!difficulty.allowHints && (value.hints.artist || value.hints.cover)) ||
      !object(value.answer) || !text(value.answer.artist) || !text(value.answer.title) ||
      !object(value.round) || typeof value.round.artistCorrect !== "boolean") return null;
  const stage = (v: unknown): boolean => v === null || (integer(v) && v < difficulty.stages.length);
  if (!stage(value.round.artistAtStage) ||
      value.round.artistCorrect !== (value.round.artistAtStage !== null) ||
      (typeof value.round.artistAtStage === "number" && value.round.artistAtStage > value.stageIndex)) return null;
  if (value.hintCoverUrl !== null && (!text(value.hintCoverUrl) || !value.hintCoverUrl.startsWith("https://"))) return null;
  if (!Array.isArray(value.history) || value.history.length > value.queueIds.length) return null;
  const history: SongRoundResult[] = [];
  const seen = new Set<string>();
  for (const entry of value.history) {
    if (!object(entry) || typeof entry.songId !== "string" || seen.has(entry.songId)) return null;
    const song = catalog.get(entry.songId);
    const index = value.queueIds.indexOf(entry.songId);
    if (!song || index < 0 || index > value.currentSongIndex || !integer(entry.points) ||
        ![entry.artistCorrect, entry.titleCorrect, entry.solved, entry.finalized].every((v) => typeof v === "boolean") ||
        (entry.error !== undefined && typeof entry.error !== "boolean") ||
        !stage(entry.artistAtStage) || !stage(entry.solvedAtStage) ||
        entry.artistCorrect !== (entry.artistAtStage !== null) ||
        entry.solved !== entry.titleCorrect || entry.solved !== (entry.solvedAtStage !== null) ||
        (!entry.finalized && (entry.points !== 0 || entry.solved)) ||
        (entry.error === true && (!entry.finalized || entry.solved || entry.points !== 0)) ||
        (entry.finalized && !entry.error && entry.points !== computeRoundPoints({
          solved: entry.solved as boolean, solvedAtStage: entry.solvedAtStage as number | null,
          artistCorrect: entry.artistCorrect as boolean, artistAtStage: entry.artistAtStage as number | null,
        })) ||
        (index < value.currentSongIndex && !entry.finalized)) return null;
    seen.add(entry.songId);
    history.push({
      songId: song.id, artist: song.artist, title: song.title,
      artistCorrect: entry.artistCorrect as boolean, titleCorrect: entry.titleCorrect as boolean,
      solved: entry.solved as boolean, finalized: entry.finalized as boolean,
      artistAtStage: entry.artistAtStage as number | null, solvedAtStage: entry.solvedAtStage as number | null,
      points: entry.points, error: entry.error === true,
    });
  }
  const current = history.find((entry) => entry.songId === queueIds[value.currentSongIndex as number]);
  if (history.filter((entry) => entry.finalized).reduce((sum, entry) => sum + entry.points, 0) !== value.score ||
      value.queueIds.slice(0, value.currentSongIndex).some((id) => !history.some((h) => h.songId === id && h.finalized)) ||
      (value.status === "finished") !== (current?.finalized === true) ||
      (current?.artistCorrect ?? false) !== value.round.artistCorrect ||
      (typeof current?.solvedAtStage === "number" && current.solvedAtStage > value.stageIndex) ||
      (current?.artistAtStage ?? null) !== value.round.artistAtStage) return null;
  return {
    version: 1, savedAt: value.savedAt, playlistId: playlist.id, modeId: value.modeId as GameModeId,
    selection: config, queueIds: [...value.queueIds], currentSongIndex: value.currentSongIndex,
    stageIndex: value.stageIndex, status: value.status as ResumeStatus,
    score: value.score as number, history, streak: value.streak as number,
    maxStreak: value.maxStreak as number, lastBrokenCombo: value.lastBrokenCombo as number,
    hints: { artist: value.hints.artist, cover: value.hints.cover },
    hintCoverUrl: value.hints.cover ? value.hintCoverUrl as string | null : null,
    answer: { artist: value.answer.artist, title: value.answer.title },
    round: { artistCorrect: value.round.artistCorrect, artistAtStage: value.round.artistAtStage as number | null },
  };
}

export function clearGameSession(): void {
  try { window.sessionStorage.removeItem(SESSION_KEY); } catch { /* armazenamento bloqueado */ }
}

export function readGameSession(playlists: Playlist[]): { session: GameSession | null; notice: string | null } {
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) return { session: null, notice: null };
    const session = validateSession(JSON.parse(raw), playlists);
    return { session, notice: session ? null : "Não foi possível restaurar a partida: os dados expiraram ou são incompatíveis." };
  } catch {
    return { session: null, notice: "Não foi possível ler os dados de recuperação da partida." };
  }
}

export function saveGameSession(session: GameSession, playlists: Playlist[]): boolean {
  try {
    const valid = validateSession(session, playlists);
    if (!valid) return false;
    const raw = JSON.stringify(valid);
    window.sessionStorage.setItem(SESSION_KEY, raw);
    return window.sessionStorage.getItem(SESSION_KEY) === raw;
  } catch { return false; }
}

export function resumedStatus(status: string): ResumeStatus {
  return status === "finished" || status === "waiting_answer" ? status : "ready";
}

export async function reconnectGameSession(
  session: GameSession,
  playlists: Playlist[],
  login: () => Promise<void>,
  confirmLoss: () => boolean,
): Promise<boolean> {
  if (!saveGameSession(session, playlists)) {
    clearGameSession();
    if (!confirmLoss()) return false;
  }
  await login();
  return true;
}
