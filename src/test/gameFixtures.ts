import type { Playlist } from "../types/playlist";
import type { GameSession } from "../utils/gameSession";

export const playlist: Playlist = {
  id: "test", name: "Teste",
  songs: ["a", "b", "c"].map((id) => ({
    id, title: `Música ${id}`, artist: `Artista ${id}`,
    spotifyUrl: "https://open.spotify.com/track/0000000000000000000000",
  })),
};

export function session(): GameSession {
  return {
    version: 1, savedAt: Date.now(), playlistId: playlist.id, modeId: "classic",
    selection: { time: { difficultyId: "easy" }, popularity: { enabled: false, filterId: null } },
    queueIds: ["c", "a", "b"], currentSongIndex: 1, stageIndex: 2, status: "waiting_answer",
    score: 7, streak: 1, maxStreak: 1, lastBrokenCombo: 0,
    history: [
      { songId: "c", title: "Música c", artist: "Artista c", artistCorrect: false, titleCorrect: true,
        solved: true, solvedAtStage: 0, artistAtStage: null, points: 7, finalized: true },
      { songId: "a", title: "Música a", artist: "Artista a", artistCorrect: true, titleCorrect: false,
        solved: false, solvedAtStage: null, artistAtStage: 1, points: 0, finalized: false },
    ],
    hints: { artist: true, cover: true }, hintCoverUrl: "https://example.com/cover.jpg",
    answer: { artist: "", title: "meu palpite" }, round: { artistCorrect: true, artistAtStage: 1 },
  };
}

export function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
  };
}
