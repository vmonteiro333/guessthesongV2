import { useCallback, useEffect, useRef, useState } from "react";
import type { Playlist } from "../types/playlist";
import type { Song } from "../types/song";
import type { GameStatus, SongRoundResult } from "../types/game";
import type { Difficulty } from "../types/difficulty";
import { computeRoundPoints } from "../utils/score";
import { evaluateGuess } from "../utils/compareAnswer";
import { normalizeText } from "../utils/normalizeText";
import { shuffle } from "../utils/shuffle";
import { isSpotifyTrackUrl } from "../utils/spotifyUrl";
import { loadBestScore, saveBestScore } from "../utils/storage";
import type { UseAudioResult } from "./useAudio";
import { AudioFailure, audioFailure } from "../services/audio/errors";
import { clearGameSession, resumedStatus } from "../utils/gameSession";
import type { GameProgress, ResumeStatus } from "../utils/gameSession";

export type FeedbackKind =
  | "correct"
  | "artist"
  | "wrong"
  | "round_failed"
  | "invalid"
  | "info";

export interface GuessFeedback {
  kind: FeedbackKind;
  message: string;
  detail?: string;
}

export interface UseGameResult {
  recovery: AudioFailure | null;
  retrying: boolean;
  hintCoverUrl: string | null;
  retryRecovery: () => Promise<void>;
  skipUnavailable: () => void;
  pauseForReconnect: () => void;
  getProgress: () => GameProgress;
  gameStatus: GameStatus;
  queue: Song[];
  currentSong: Song | null;
  currentSongIndex: number;
  stageIndex: number;
  stageSeconds: number;
  isLastStage: boolean;
  answer: { artist: string; title: string };
  feedback: GuessFeedback | null;
  score: number;
  history: SongRoundResult[];
  completedSongs: number;
  listenSeq: number;
  streak: number;
  activeResult: SongRoundResult | null;
  maxStreak: number;
  lastBrokenCombo: number;
  stages: number[];
  hints: { artist: boolean; cover: boolean };
  revealHint: (kind: "artist" | "cover") => void;
  startGame: () => void;
  listen: () => void;
  skip: () => void;
  submitAnswer: () => void;
  setAnswerField: (value: string) => void;
  nextSong: () => void;
}

/**
 * Estado central do jogo. Não executa NENHUMA chamada direta às APIs de
 * áudio: toda a reprodução passa por useAudio.
 */
export function useGame(audio: UseAudioResult, playlist: Playlist, difficulty: Difficulty, initialProgress?: GameProgress): UseGameResult {
  const [gameStatus, setGameStatus] = useState<GameStatus>(initialProgress?.status ?? "idle");
  const [queue, setQueue] = useState<Song[]>(() => initialProgress?.queueIds.map((id) => playlist.songs.find((s) => s.id === id)!) ?? []);
  const [currentSongIndex, setCurrentSongIndex] = useState(initialProgress?.currentSongIndex ?? 0);
  const [stageIndex, setStageIndex] = useState(initialProgress?.stageIndex ?? 0);
  const [answer, setAnswer] = useState(initialProgress?.answer ?? { artist: "", title: "" });
  const [feedback, setFeedback] = useState<GuessFeedback | null>(null);
  const [score, setScore] = useState(initialProgress?.score ?? 0);
  const [history, setHistory] = useState<SongRoundResult[]>(initialProgress?.history ?? []);
  const [listenSeq, setListenSeq] = useState(0);
  const [streak, setStreak] = useState(initialProgress?.streak ?? 0);
  const [maxStreak, setMaxStreak] = useState(initialProgress?.maxStreak ?? 0);
  const [lastBrokenCombo, setLastBrokenCombo] = useState(initialProgress?.lastBrokenCombo ?? 0);
  const streakRef = useRef(initialProgress?.streak ?? 0);
  const [recovery, setRecovery] = useState<AudioFailure | null>(null);
  const recoveryRef = useRef<AudioFailure | null>(null);
  const [retrying, setRetrying] = useState(false);
  const retryingRef = useRef(false);
  const resumeRef = useRef<ResumeStatus>(initialProgress?.status ?? "ready");
  const statusRef = useRef(gameStatus);
  statusRef.current = gameStatus;
  const [hintCoverUrl, setHintCoverUrl] = useState(initialProgress?.hintCoverUrl ?? null);
  const stages = difficulty.stages;

  /** Estado da rodada em andamento (artista descoberto antes do título). */
  const roundRef = useRef<{ artistCorrect: boolean; artistAtStage: number | null }>(initialProgress?.round ?? {
    artistCorrect: false,
    artistAtStage: null,
  });
  /** Invalida conclusões antigas de listen() (skip/restart/finalize). */
  const playTokenRef = useRef(0);
  /** Invalida loads antigos (troca de música / restart). */
  const loadSeqRef = useRef(0);
  /** Trava curta contra duplo-SKIP acidental. */
  const skipLockRef = useRef(false);
  const skipTimerRef = useRef(0);

  const currentSong = queue[currentSongIndex] ?? null;

  const invalidateOperations = useCallback(() => {
    playTokenRef.current += 1;
    loadSeqRef.current += 1;
    window.clearTimeout(skipTimerRef.current);
    skipLockRef.current = false;
    audio.stopPlayback();
  }, [audio.stopPlayback]);

  useEffect(() => {
    return invalidateOperations;
  }, [invalidateOperations]);

  const [hints, setHints] = useState<{ artist: boolean; cover: boolean }>(initialProgress?.hints ?? {
    artist: false,
    cover: false,
  });

  const revealHint = useCallback(
    (kind: "artist" | "cover") => {
      if (!difficulty.allowHints || recoveryRef.current || audio.serviceStatus !== "ready") return;
      // Decisão documentada: dica NÃO marca artistCorrect/artistAtStage —
      // pontos parciais continuam vindo só de PALPITE (score intocado).
      setHints((prev) => (prev[kind] ? prev : { ...prev, [kind]: true }));
    },
    [difficulty.allowHints, audio.serviceStatus]
  );

  /** UMA entrada por música (atualizável) — nunca cards duplicados. */
  const upsertHistory = useCallback((song: Song, patch: Partial<SongRoundResult>): void => {
    setHistory((prev) => {
      const index = prev.findIndex((entry) => entry.songId === song.id);
      const base: SongRoundResult =
        index >= 0
          ? prev[index]
          : {
              songId: song.id,
              artist: song.artist,
              title: song.title,
              artistCorrect: false,
              titleCorrect: false,
              solved: false,
              solvedAtStage: null,
              artistAtStage: null,
              points: 0,
              finalized: false,
            };
      const entry: SongRoundResult = { ...base, ...patch };
      if (index >= 0) {
        const copy = prev.slice();
        copy[index] = entry;
        return copy;
      }
      return [...prev, entry];
    });
  }, []);

  const pause = useCallback((cause: unknown) => {
    const error = audioFailure(cause);
    if (statusRef.current !== "paused" && statusRef.current !== "loading" && statusRef.current !== "playing") {
      resumeRef.current = resumedStatus(statusRef.current);
    }
    recoveryRef.current = error;
    setRecovery(error);
    invalidateOperations();
    setGameStatus("paused");
  }, [invalidateOperations]);

  useEffect(() => {
    if (audio.serviceStatus === "connecting" && retryingRef.current) return;
    if (queue.length && gameStatus !== "idle" && gameStatus !== "game_over" && audio.serviceStatus !== "ready") {
      if (gameStatus !== "paused" || (audio.failure && audio.failure !== recoveryRef.current)) {
        pause(audio.failure ?? new AudioFailure("temporary", "Conectando ao Spotify…"));
      }
    }
  }, [audio.serviceStatus, audio.failure, pause, queue.length, gameStatus]);

  const loadCurrentSong = useCallback(
    async (song: Song, token: number, resume: ResumeStatus = "ready") => {
      resumeRef.current = resume;
      setGameStatus("loading");
      try {
        const url = song.spotifyUrl?.trim() ?? "";
        if (!isSpotifyTrackUrl(url)) {
          throw new AudioFailure("unavailable", "Esta música não tem um link válido do Spotify cadastrado.");
        }
        await audio.loadTrack(url);
        if (token !== loadSeqRef.current) return;
        setFeedback(null);
        recoveryRef.current = null;
        setRecovery(null);
        setGameStatus(resume);
      } catch (error) {
        if (token !== loadSeqRef.current) return;
        pause(error);
      }
    },
    [audio.loadTrack, pause]
  );

  const goToNextSong = useCallback(() => {
    invalidateOperations();
    recoveryRef.current = null;
    setRecovery(null);
    const next = currentSongIndex + 1;
    if (next >= queue.length) {
      setGameStatus("game_over");
      clearGameSession();
      return;
    }
    roundRef.current = { artistCorrect: false, artistAtStage: null };
    setLastBrokenCombo(0);
    setCurrentSongIndex(next);
    setStageIndex(0);
    setAnswer({ artist: "", title: "" });
    setFeedback(null);
    setHints({ artist: false, cover: false });
    setHintCoverUrl(null);
    loadSeqRef.current += 1;
    const token = loadSeqRef.current;
    void loadCurrentSong(queue[next], token);
  }, [currentSongIndex, queue, invalidateOperations, loadCurrentSong]);

  const retryRecovery = useCallback(async () => {
    if (!currentSong || !recoveryRef.current || retryingRef.current) return;
    retryingRef.current = true;
    setRetrying(true);
    const token = ++loadSeqRef.current;
    try {
      if (await audio.retry() && token === loadSeqRef.current) {
        await loadCurrentSong(currentSong, token, resumeRef.current);
      }
    } finally { retryingRef.current = false; setRetrying(false); }
  }, [audio.retry, currentSong, loadCurrentSong]);

  const skipUnavailable = useCallback(() => {
    if (recoveryRef.current?.kind !== "unavailable" || !currentSong || retryingRef.current) return;
    upsertHistory(currentSong, { error: true, finalized: true, points: 0 });
    goToNextSong();
  }, [currentSong, upsertHistory, goToNextSong]);

  // A hidratação ocorre nos inicializadores. O efeito só prepara o áudio, sem tocar ou pontuar.
  const restoreRef = useRef(initialProgress);
  useEffect(() => {
    const progress = restoreRef.current;
    if (!progress) return;
    clearGameSession();
    const song = playlist.songs.find((s) => s.id === progress.queueIds[progress.currentSongIndex]);
    if (song) void loadCurrentSong(song, ++loadSeqRef.current, progress.status);
    return () => { loadSeqRef.current += 1; };
  }, [loadCurrentSong, playlist]);

  const startGame = useCallback(() => {
    if (playlist.songs.length === 0) return;                    // ← mudou (era catalog.length)
    if (gameStatus !== "idle" && gameStatus !== "game_over") return;
    clearGameSession();
    if (audio.serviceStatus !== "ready") return;
    recoveryRef.current = null;
    setRecovery(null);
    audio.stopPlayback();

    const shuffled = shuffle(playlist.songs);                   // ← mudou (era shuffle(catalog))
    roundRef.current = { artistCorrect: false, artistAtStage: null };
    playTokenRef.current += 1;
    setHints({ artist: false, cover: false });
    setHintCoverUrl(null);
    setQueue(shuffled);
    setCurrentSongIndex(0);
    setStageIndex(0);
    setAnswer({ artist: "", title: "" });
    setScore(0);
    setHistory([]);
    setFeedback(null);
    streakRef.current = 0;
    setStreak(0);
    setMaxStreak(0);
    setLastBrokenCombo(0);
    loadSeqRef.current += 1;
    const token = loadSeqRef.current;
    setGameStatus("loading");
    void loadCurrentSong(shuffled[0], token);
  }, [gameStatus, audio, loadCurrentSong, playlist]);

  /** OUVIR: toca do início e para no limite do estágio atual. */
  const listen = useCallback(async () => {
    if (recoveryRef.current || audio.serviceStatus !== "ready") return;
    if (gameStatus !== "ready" && gameStatus !== "waiting_answer") return;
    const song = currentSong;
    if (!song) return;
    setListenSeq((n) => n + 1);
    const token = ++playTokenRef.current;
    setFeedback(null);
    resumeRef.current = resumedStatus(gameStatus);
    setGameStatus("playing");
    try {
      const result = await audio.playSnippet(stages[stageIndex]); 
      if (token !== playTokenRef.current) return; // skip/restart invalidou
      if (result === "completed") {
        setGameStatus("waiting_answer");
      } else {
        setGameStatus((prev) => (prev === "playing" ? "ready" : prev));
      }
    } catch (error) {
      if (token !== playTokenRef.current) return;
      pause(error);
    }
  }, [gameStatus, currentSong, stageIndex, audio, pause]);

  /** Encerra a rodada UMA vez, com pontuação única e sem dupla contagem. */
  const finalizeRound = useCallback(
    (solved: boolean) => {
      const song = currentSong;
      if (!song) return;
      audio.stopPlayback();
      playTokenRef.current += 1;

      const solvedAtStage = solved ? stageIndex : null;
      const { artistCorrect, artistAtStage } = roundRef.current;
      const points = computeRoundPoints({ solved, solvedAtStage, artistCorrect, artistAtStage });

      upsertHistory(song, {
        artistCorrect,
        artistAtStage,
        titleCorrect: solved,
        solved,
        solvedAtStage,
        points,
        finalized: true,
        error: false,
      });
      setScore((prev) => prev + points);
      setAnswer({ artist: "", title: "" });

      if (solved) {
        const nextStreak = streakRef.current + 1;
        streakRef.current = nextStreak;
        setStreak(nextStreak);
        setMaxStreak((m) => Math.max(m, nextStreak));
        setFeedback({
          kind: "correct",
          message: `Acertou! ${song.artist} — ${song.title}`,
          detail: `+${points} ponto${points === 1 ? "" : "s"}`,
        });
      } else {
        setLastBrokenCombo(streakRef.current >= 2 ? streakRef.current : 0);
        streakRef.current = 0;
        setStreak(0);        
        setFeedback({
          kind: "round_failed",
          message: `Fim da rodada. A música era ${song.artist} — ${song.title}.`,
          detail:
            points > 0
              ? `+${points} ponto${points === 1 ? "" : "s"} pelo artista`
              : "Sem pontos nesta rodada.",
        });
      }
      setGameStatus("finished");
    },
    [currentSong, stageIndex, audio, upsertHistory]
  );

  const skip = useCallback(() => {
    if (recoveryRef.current || audio.serviceStatus !== "ready") return;
    const status = gameStatus;
    if (status !== "ready" && status !== "waiting_answer" && status !== "playing") return;
    if (skipLockRef.current) return; // sem SKIPs concorrentes
    skipLockRef.current = true;
    skipTimerRef.current = window.setTimeout(() => {
      skipLockRef.current = false;
    }, 300);

    audio.stopPlayback();
    playTokenRef.current += 1;

    if (stageIndex >= stages.length - 1) {
      // Último estágio: SKIP = "não sei" → encerra a rodada.
      finalizeRound(false);
      return;
    }

    setStageIndex((prev) => Math.min(prev + 1, stages.length - 1));
    setAnswer({ artist: "", title: "" });
    setFeedback(null);
    setGameStatus("ready");
  }, [gameStatus, stageIndex, audio, finalizeRound]);

  const submitAnswer = useCallback(() => {
    if (recoveryRef.current || audio.serviceStatus !== "ready") return;
    if (gameStatus !== "waiting_answer") return;
    const song = currentSong;
    if (!song) return;

    // REGRA: o palpite é sempre uma música.
    if (normalizeText(answer.title) === "") {
      setFeedback({ kind: "invalid", message: "Digite o nome da música antes de tentar." });
      return;
    }

    const evaluation = evaluateGuess({ title: answer.title }, song, playlist.songs);

    if (evaluation.outcome === "correct") {
      finalizeRound(true);
      return;
    }

    if (evaluation.outcome === "artist") {
      if (!roundRef.current.artistCorrect) {
        roundRef.current = { artistCorrect: true, artistAtStage: stageIndex };
        upsertHistory(song, {
          artistCorrect: true,
          artistAtStage: stageIndex,
          points: 0,
          finalized: false,
        });
      }
      const revealed = evaluation.matchedArtists.join(" e ");
      setFeedback({
        kind: "artist",
        message: `Boa! ${revealed} participa dessa música. Falta acertar o título!`,
      });
      setAnswer({ artist: "", title: "" });
      return; // permanece em waiting_answer
    }

    if (stageIndex >= stages.length - 1) {
      finalizeRound(false);
      return;
    }

    setFeedback({ kind: "wrong", message: "Não é essa. Ouça novamente ou avance o trecho." });
  }, [gameStatus, currentSong, answer, stageIndex, finalizeRound, upsertHistory, playlist]);

  const setAnswerField = useCallback((value: string) => {
    if (recoveryRef.current || audio.serviceStatus !== "ready") return;
    setAnswer((prev) => ({ ...prev, title: value }));
  }, [audio.serviceStatus]);

  // Recorde pessoal em localStorage (best-effort).
  useEffect(() => {
    if (gameStatus !== "game_over") return;
    if (score > loadBestScore()) saveBestScore(score);
  }, [gameStatus, score]);

  return {
    recovery,
    retrying,
    hintCoverUrl,
    retryRecovery,
    skipUnavailable,
    pauseForReconnect: () => pause(new AudioFailure("auth", "Reconecte sua sessão do Spotify.")),
    getProgress: () => ({
      queueIds: queue.map((song) => song.id), currentSongIndex, stageIndex,
      status: gameStatus === "paused" || gameStatus === "loading" || gameStatus === "playing" ? resumeRef.current : resumedStatus(gameStatus),
      score, history, streak, maxStreak, lastBrokenCombo, hints,
      hintCoverUrl: hints.cover ? audio.trackMeta?.coverUrl ?? hintCoverUrl : null,
      answer, round: { ...roundRef.current },
    }),
    activeResult: history.find((entry) => entry.songId === currentSong?.id && entry.finalized) ?? null,
    listenSeq,
    gameStatus,
    queue,
    currentSong,
    currentSongIndex,
    stageIndex,
    stageSeconds: stages[stageIndex] ?? stages[0] ?? 0.1,
    isLastStage: stageIndex >= stages.length - 1,
    stages,
    hints,
    revealHint,
    answer,
    feedback,
    score,
    history,
    completedSongs: history.filter((entry) => entry.finalized).length,
    streak,
    maxStreak,
    lastBrokenCombo,
    startGame,
    listen,
    skip,
    submitAnswer,
    setAnswerField,
    nextSong: () => {
      if (gameStatus === "finished" && !recoveryRef.current && audio.serviceStatus === "ready") goToNextSong();
    },
  };
}
