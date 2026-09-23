import { useCallback, useEffect, useRef, useState } from "react";
import { songs as catalog } from "../data/songs";
import type { Song } from "../types/song";
import type { GameStatus, SongRoundResult } from "../types/game";
import { getStageSeconds, isLastStage, STAGES } from "../utils/gameRules";
import { computeRoundPoints } from "../utils/score";
import { evaluateGuess } from "../utils/compareAnswer";
import { normalizeText } from "../utils/normalizeText";
import { shuffle } from "../utils/shuffle";
import { isSpotifyTrackUrl } from "../utils/spotifyUrl";
import { loadBestScore, saveBestScore } from "../utils/storage";
import type { UseAudioResult } from "./useAudio";

const ERROR_ADVANCE_DELAY_MS = 3_000;

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
export function useGame(audio: UseAudioResult): UseGameResult {
  const [gameStatus, setGameStatus] = useState<GameStatus>("idle");
  const [queue, setQueue] = useState<Song[]>([]);
  const [currentSongIndex, setCurrentSongIndex] = useState(0);
  const [stageIndex, setStageIndex] = useState(0);
  const [answer, setAnswer] = useState({ artist: "", title: "" });
  const [feedback, setFeedback] = useState<GuessFeedback | null>(null);
  const [score, setScore] = useState(0);
  const [history, setHistory] = useState<SongRoundResult[]>([]);

  /** Estado da rodada em andamento (artista descoberto antes do título). */
  const roundRef = useRef<{ artistCorrect: boolean; artistAtStage: number | null }>({
    artistCorrect: false,
    artistAtStage: null,
  });
  /** Invalida conclusões antigas de listen() (skip/restart/finalize). */
  const playTokenRef = useRef(0);
  /** Invalida loads antigos (troca de música / restart). */
  const loadSeqRef = useRef(0);
  /** Trava curta contra duplo-SKIP acidental. */
  const skipLockRef = useRef(false);
  /** Timer de avanço automático após erro de carga. */
  const advanceTimerRef = useRef(0);

  const currentSong = queue[currentSongIndex] ?? null;

  const clearAdvanceTimer = useCallback(() => {
    if (advanceTimerRef.current !== 0) {
      window.clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = 0;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (advanceTimerRef.current !== 0) window.clearTimeout(advanceTimerRef.current);
    };
  }, []);

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

  // Ref indireto para quebrar dependência circular entre callbacks.
  const goToNextSongRef = useRef<() => void>(() => {});

  const handleSongError = useCallback(
    (song: Song, message: string) => {
      upsertHistory(song, {
        error: true,
        solved: false,
        titleCorrect: false,
        artistCorrect: false,
        artistAtStage: null,
        solvedAtStage: null,
        points: 0,
        finalized: true,
      });
      setFeedback({
        kind: "info",
        message: "Não foi possível carregar esta música. Pulando para a próxima.",
        detail: message,
      });
      setGameStatus("error");
      clearAdvanceTimer();
      advanceTimerRef.current = window.setTimeout(() => {
        advanceTimerRef.current = 0;
        goToNextSongRef.current();
      }, ERROR_ADVANCE_DELAY_MS);
    },
    [upsertHistory, clearAdvanceTimer]
  );

  const loadCurrentSong = useCallback(
    async (song: Song, token: number) => {
      setGameStatus("loading");
      try {
        const url = song.spotifyUrl?.trim() ?? "";
        if (!isSpotifyTrackUrl(url)) {
          handleSongError(song, "Sem spotifyUrl válida cadastrada para esta música.");
          return;
        }
        await audio.loadTrack(url);
        if (token !== loadSeqRef.current) return;
        setFeedback(null);
        setGameStatus("ready");
      } catch (error) {
        if (token !== loadSeqRef.current) return;
        handleSongError(
          song,
          error instanceof Error ? error.message : "Erro desconhecido ao carregar a faixa."
        );
      }
    },
    [audio, handleSongError]
  );

  const goToNextSong = useCallback(() => {
    clearAdvanceTimer();
    const next = currentSongIndex + 1;
    if (next >= queue.length) {
      setGameStatus("game_over");
      return;
    }
    roundRef.current = { artistCorrect: false, artistAtStage: null };
    setCurrentSongIndex(next);
    setStageIndex(0);
    setAnswer({ artist: "", title: "" });
    setFeedback(null);
    loadSeqRef.current += 1;
    const token = loadSeqRef.current;
    void loadCurrentSong(queue[next], token);
  }, [currentSongIndex, queue, clearAdvanceTimer, loadCurrentSong]);

  useEffect(() => {
    goToNextSongRef.current = goToNextSong;
  }, [goToNextSong]);

  const startGame = useCallback(() => {
    if (catalog.length === 0) return;
    if (gameStatus !== "idle" && gameStatus !== "game_over") return;
    clearAdvanceTimer();
    audio.stopPlayback();

    const shuffled = shuffle(catalog); // cópia; original intacto; sem repetições
    roundRef.current = { artistCorrect: false, artistAtStage: null };
    playTokenRef.current += 1;
    setQueue(shuffled);
    setCurrentSongIndex(0);
    setStageIndex(0);
    setAnswer({ artist: "", title: "" });
    setScore(0);
    setHistory([]);
    setFeedback(null);
    loadSeqRef.current += 1;
    const token = loadSeqRef.current;
    setGameStatus("loading");
    void loadCurrentSong(shuffled[0], token);
  }, [gameStatus, audio, clearAdvanceTimer, loadCurrentSong]);

  /** OUVIR: toca do início e para no limite do estágio atual. */
  const listen = useCallback(async () => {
    if (gameStatus !== "ready" && gameStatus !== "waiting_answer") return;
    const song = currentSong;
    if (!song) return;
    const token = ++playTokenRef.current;
    setFeedback(null);
    setGameStatus("playing");
    try {
      const result = await audio.playSnippet(STAGES[stageIndex]);
      if (token !== playTokenRef.current) return; // skip/restart invalidou
      if (result === "completed") {
        setGameStatus("waiting_answer");
      } else {
        setGameStatus((prev) => (prev === "playing" ? "ready" : prev));
      }
    } catch (error) {
      if (token !== playTokenRef.current) return;
      setFeedback({
        kind: "info",
        message: "Não foi possível reproduzir o trecho. Tente ouvir novamente.",
        detail: error instanceof Error ? error.message : undefined,
      });
      setGameStatus("ready");
    }
  }, [gameStatus, currentSong, stageIndex, audio]);

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
        setFeedback({
          kind: "correct",
          message: `Acertou! ${song.artist} — ${song.title}`,
          detail: `+${points} ponto${points === 1 ? "" : "s"}`,
        });
      } else {
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
    const status = gameStatus;
    if (status !== "ready" && status !== "waiting_answer" && status !== "playing") return;
    if (skipLockRef.current) return; // sem SKIPs concorrentes
    skipLockRef.current = true;
    window.setTimeout(() => {
      skipLockRef.current = false;
    }, 300);

    audio.stopPlayback();
    playTokenRef.current += 1;

    if (isLastStage(stageIndex)) {
      // Último estágio: SKIP = "não sei" → encerra a rodada.
      finalizeRound(false);
      return;
    }

    setStageIndex((prev) => Math.min(prev + 1, STAGES.length - 1));
    setAnswer({ artist: "", title: "" });
    setFeedback(null);
    setGameStatus("ready");
  }, [gameStatus, stageIndex, audio, finalizeRound]);

  const submitAnswer = useCallback(() => {
    if (gameStatus !== "waiting_answer") return;
    const song = currentSong;
    if (!song) return;

    // REGRA: o palpite é sempre uma música.
    if (normalizeText(answer.title) === "") {
      setFeedback({ kind: "invalid", message: "Digite o nome da música antes de tentar." });
      return;
    }

    const evaluation = evaluateGuess({ title: answer.title }, song, catalog);

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

    if (isLastStage(stageIndex)) {
      finalizeRound(false);
      return;
    }

    setFeedback({ kind: "wrong", message: "Não é essa. Ouça novamente ou avance o trecho." });
  }, [gameStatus, currentSong, answer, stageIndex, finalizeRound, upsertHistory]);

  const setAnswerField = useCallback((value: string) => {
    setAnswer((prev) => ({ ...prev, title: value }));
  }, []);

  // Recorde pessoal em localStorage (best-effort).
  useEffect(() => {
    if (gameStatus !== "game_over") return;
    if (score > loadBestScore()) saveBestScore(score);
  }, [gameStatus, score]);

  return {
    gameStatus,
    queue,
    currentSong,
    currentSongIndex,
    stageIndex,
    stageSeconds: getStageSeconds(stageIndex),
    isLastStage: isLastStage(stageIndex),
    answer,
    feedback,
    score,
    history,
    completedSongs: history.filter((entry) => entry.finalized).length,
    startGame,
    listen,
    skip,
    submitAnswer,
    setAnswerField,
    nextSong: goToNextSong,
  };
}