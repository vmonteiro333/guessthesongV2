import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HookHarness } from "../test/hookHarness";
import { memoryStorage, playlist, session } from "../test/gameFixtures";
import type { UseAudioResult } from "./useAudio";
import { useGame } from "./useGame";
import { getDifficulty } from "../data/difficulties";
import { AudioFailure } from "../services/audio/errors";
import { saveGameSession, SESSION_KEY, validateSession } from "../utils/gameSession";

vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  ...(await import("../test/hookHarness")).hooks,
}));

let audio: UseAudioResult;
let host: HookHarness<ReturnType<typeof useGame>>;
const difficulty = getDifficulty("easy");

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { resolve, promise };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("window", { setTimeout, clearTimeout, localStorage: memoryStorage(), sessionStorage: memoryStorage() });
  audio = {
    serviceStatus: "ready", serviceError: null, failure: null, snippetPhase: "idle", trackMeta: null,
    loadTrack: vi.fn().mockResolvedValue(undefined), playSnippet: vi.fn().mockResolvedValue("completed"),
    stopPlayback: vi.fn(), retry: vi.fn().mockResolvedValue(true), login: vi.fn().mockResolvedValue(undefined),
  };
});
afterEach(() => { host?.unmount(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("pausa e recuperação da partida", () => {
  it.each(["load", "play"])("NOT_LOGGED_IN durante %s preserva rodada e não avança após três segundos", async (where) => {
    const error = new AudioFailure("auth", "NOT_LOGGED_IN");
    if (where === "load") vi.mocked(audio.loadTrack).mockRejectedValue(error);
    else vi.mocked(audio.playSnippet).mockRejectedValue(error);
    host = new HookHarness(() => useGame(audio, playlist, difficulty));
    host.current.startGame();
    await host.settle();
    if (where === "play") { host.current.listen(); await host.settle(); }
    expect(host.current.gameStatus).toBe("paused");
    expect(host.current.recovery?.kind).toBe("auth");
    host.current.skip(); host.current.submitAnswer(); host.current.nextSong(); host.current.skipUnavailable();
    await vi.advanceTimersByTimeAsync(10_000); await host.settle();
    expect(host.current.currentSongIndex).toBe(0);
    expect(host.current.stageIndex).toBe(0);
    expect(host.current.score).toBe(0);
    expect(host.current.history).toEqual([]);
    expect(audio.stopPlayback).toHaveBeenCalled();
  });

  it("falha temporária permite tentar a mesma rodada novamente, inclusive durante connecting", async () => {
    host = new HookHarness(() => useGame(audio, playlist, difficulty, session()));
    await host.settle();
    const before = host.current.getProgress();
    vi.mocked(audio.playSnippet).mockRejectedValueOnce(new AudioFailure("temporary", "HTTP 503", 503));
    host.current.listen(); await host.settle();
    expect(host.current.gameStatus).toBe("paused");
    vi.mocked(audio.retry).mockImplementationOnce(async () => {
      audio.serviceStatus = "connecting"; host.rerender();
      await Promise.resolve();
      audio.serviceStatus = "ready"; host.rerender();
      return true;
    });
    await host.current.retryRecovery(); await host.settle();
    expect(host.current.gameStatus).toBe("waiting_answer");
    expect(host.current.getProgress()).toEqual(before);
    expect(audio.playSnippet).toHaveBeenCalledTimes(1);
  });

  it("no list preserva palpite, etapa, pontos, fila e snapshot durante falha e recuperação", async () => {
    host = new HookHarness(() => useGame(audio, playlist, difficulty, session()));
    await host.settle();
    const before = host.current.getProgress();
    const snapshot = session();
    saveGameSession(snapshot, [playlist]);
    const stored = window.sessionStorage.getItem(SESSION_KEY);
    const failure = new AudioFailure("temporary", "Cannot perform operation; no list was loaded.");
    audio.failure = failure; audio.serviceStatus = "error";
    host.rerender(); await host.settle();
    expect(host.current.gameStatus).toBe("paused");
    expect(host.current.getProgress()).toEqual(before);
    vi.mocked(audio.retry).mockResolvedValueOnce(false);
    await host.current.retryRecovery(); await host.settle();
    expect(host.current.gameStatus).toBe("paused");
    expect(window.sessionStorage.getItem(SESSION_KEY)).toBe(stored);
    audio.failure = null; audio.serviceStatus = "ready";
    await host.current.retryRecovery(); await host.settle();
    expect(host.current.getProgress()).toEqual(before);
    expect(window.sessionStorage.getItem(SESSION_KEY)).toBe(stored);
    expect(audio.login).not.toHaveBeenCalled();
  });

  it.each(["load", "play"])("ignora conclusão antiga de %s depois da pausa", async (where) => {
    const pending = deferred<"completed">();
    host = new HookHarness(() => useGame(audio, playlist, difficulty));
    if (where === "load") vi.mocked(audio.loadTrack).mockReturnValueOnce(pending.promise.then(() => undefined));
    host.current.startGame(); await host.settle();
    if (where === "play") {
      vi.mocked(audio.playSnippet).mockReturnValueOnce(pending.promise);
      host.current.listen(); host.flush();
    }
    host.current.pauseForReconnect(); host.flush();
    pending.resolve("completed"); await host.settle();
    expect(host.current.gameStatus).toBe("paused");
    expect(host.current.history).toEqual([]);
    expect(host.current.currentSongIndex).toBe(0);
  });

  it("faixa sem link só é consumida por uma ação explícita", async () => {
    const invalid = { ...playlist, songs: playlist.songs.map((s) => ({ ...s, spotifyUrl: "" })) };
    host = new HookHarness(() => useGame(audio, invalid, difficulty));
    host.current.startGame(); await host.settle();
    expect(host.current.recovery?.kind).toBe("unavailable");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(host.current.history).toEqual([]);
    host.current.skipUnavailable(); await host.settle();
    expect(host.current.currentSongIndex).toBe(1);
    expect(host.current.history).toHaveLength(1);
    expect(host.current.history[0]).toMatchObject({ finalized: true, error: true, points: 0 });
  });

  it("cancela o timer de skip ao pausar e impede alterações nas dicas e palpite", async () => {
    host = new HookHarness(() => useGame(audio, playlist, difficulty));
    host.current.startGame(); await host.settle();
    host.current.skip(); host.flush();
    expect(vi.getTimerCount()).toBe(1);
    host.current.pauseForReconnect(); host.flush();
    expect(vi.getTimerCount()).toBe(0);
    host.current.revealHint("artist"); host.current.setAnswerField("alterado"); host.current.skip();
    expect(host.current.stageIndex).toBe(1);
    expect(host.current.answer.title).toBe("");
    expect(host.current.hints.artist).toBe(false);
  });

  it("restaura o progresso uma vez e conserva o artista parcial para a pontuação posterior", async () => {
    const value = session();
    saveGameSession(value, [playlist]);
    host = new HookHarness(() => useGame(audio, playlist, difficulty, value));
    await host.settle();
    expect(host.current.getProgress()).toEqual(expect.objectContaining({
      queueIds: value.queueIds, stageIndex: 2, score: 7, streak: 1, maxStreak: 1,
      hints: value.hints, answer: value.answer, round: value.round, status: "waiting_answer",
    }));
    expect(window.sessionStorage.getItem(SESSION_KEY)).toBeNull();
    expect(audio.playSnippet).not.toHaveBeenCalled();
    host.current.setAnswerField("novo palpite"); host.flush();
    host.rerender();
    expect(host.current.answer.title).toBe("novo palpite");
    expect(audio.loadTrack).toHaveBeenCalledTimes(1);
    host.current.skip(); host.flush();
    expect(host.current.getProgress().round).toEqual(value.round);
  });

  it("uma partida interrompida enquanto tocava volta pronta, sem autoplay", async () => {
    host = new HookHarness(() => useGame(audio, playlist, difficulty));
    host.current.startGame(); await host.settle();
    vi.mocked(audio.playSnippet).mockReturnValueOnce(deferred<"completed">().promise);
    host.current.listen(); host.flush();
    expect(host.current.gameStatus).toBe("playing");
    const progress = host.current.getProgress();
    const valid = validateSession({ ...session(), ...progress }, [playlist]);
    expect(valid?.status).toBe("ready");
    host.unmount();
    vi.mocked(audio.playSnippet).mockClear();
    host = new HookHarness(() => useGame(audio, playlist, difficulty, valid!));
    await host.settle();
    expect(host.current.gameStatus).toBe("ready");
    expect(audio.playSnippet).not.toHaveBeenCalled();
  });

  it("restaura finished sem duplicar pontos, mesmo com repetição de efeitos do StrictMode", async () => {
    const value = session();
    value.status = "finished";
    value.history[1] = { ...value.history[1], solved: true, titleCorrect: true, finalized: true, solvedAtStage: 2, points: 5 };
    value.score = 12; value.streak = 2; value.maxStreak = 2;
    host = new HookHarness(() => useGame(audio, playlist, difficulty, value));
    host.replayEffects(); await host.settle();
    expect(host.current.gameStatus).toBe("finished");
    expect(host.current.score).toBe(12);
    host.current.submitAnswer(); host.current.listen(); await host.settle();
    expect(audio.playSnippet).not.toHaveBeenCalled();
    expect(host.current.history).toHaveLength(2);
    host.current.nextSong(); await host.settle();
    expect(host.current.currentSongIndex).toBe(2);
    expect(host.current.score).toBe(12);
  });
});
