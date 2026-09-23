import { useCallback, useEffect, useRef, useState } from "react";
import { SpotifyWebPlayer } from "../services/audio/SpotifyWebPlayer";
import {
  handleAuthRedirect,
  isNotLoggedInError,
  loadTokens,
  startLogin,
} from "../services/audio/spotifyAuth";

export type PlayerServiceStatus = "boot" | "needs_login" | "connecting" | "ready" | "error";
export type SnippetResult = "completed" | "stopped";

const POLL_INTERVAL_MS = 50;
const HARD_ELAPSED_SLACK_MS = 2_000;
const ABSOLUTE_FAILSAFE_MS = 5_000;
const PLAYBACK_START_TIMEOUT_MS = 10_000;

export interface UseAudioResult {
  serviceStatus: PlayerServiceStatus;
  serviceError: string | null;
  login: () => void;
  loadTrack: (url: string) => Promise<void>;
  playSnippet: (limitSeconds: number) => Promise<SnippetResult>;
  stopPlayback: () => void;
}

/**
 * Sessão de áudio do jogo via Web Playback SDK (áudio completo, Premium).
 * Fluxo de boot: processa retorno do login → tem tokens? → conecta device.
 */
export function useAudio(): UseAudioResult {
  const [serviceStatus, setServiceStatus] = useState<PlayerServiceStatus>("boot");
  const [serviceError, setServiceError] = useState<string | null>(null);
  const playerRef = useRef<SpotifyWebPlayer | null>(null);
  const sessionRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const player = new SpotifyWebPlayer();
    playerRef.current = player;
    const unsubscribeFatal = player.onError((message) => {
      setServiceError(message);
    });

    (async () => {
      setServiceStatus("connecting");
      try {
        await handleAuthRedirect();
      } catch (error) {
        if (cancelled) return;
        setServiceStatus("needs_login");
        setServiceError(error instanceof Error ? error.message : "Falha no login do Spotify.");
        return;
      }
      if (cancelled) return;
      if (!loadTokens()) {
        setServiceStatus("needs_login");
        return;
      }
      try {
        await player.init();
        if (cancelled) return;
        setServiceStatus("ready");
      } catch (error) {
        if (cancelled) return;
        if (isNotLoggedInError(error)) {
          setServiceStatus("needs_login");
        } else {
          setServiceStatus("error");
          setServiceError(
            error instanceof Error ? error.message : "Falha ao conectar ao Spotify."
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      unsubscribeFatal();
      sessionRef.current += 1;
      player.destroy();
      if (playerRef.current === player) playerRef.current = null;
    };
  }, []);

  const login = useCallback(() => {
    void startLogin();
  }, []);

  const loadTrack = useCallback(async (url: string): Promise<void> => {
    const player = playerRef.current;
    if (!player) throw new Error("O player do Spotify ainda não está pronto.");
    sessionRef.current += 1; // interrompe qualquer snippet em curso
    await player.load(url);
  }, []);

  /**
   * Toca a música DO ZERO (comando de play com position_ms=0) e corta no
   * limite do estágio. O corte usa a posição interpolada localmente — muito
   * mais precisa que o iframe — com redes de segurança de relógio.
   */
  const playSnippet = useCallback(async (limitSeconds: number): Promise<SnippetResult> => {
    const player = playerRef.current;
    if (!player) throw new Error("O player do Spotify ainda não está pronto.");

    const session = ++sessionRef.current;
    const limitMs = Math.max(50, Math.round(limitSeconds * 1000));

    await player.playFromStart();
    if (session !== sessionRef.current) {
      player.pause();
      return "stopped";
    }

    // Espera o Connect começar a tocar de fato (buffering), sem travar.
    await player.waitForPlaybackStart(PLAYBACK_START_TIMEOUT_MS);
    if (session !== sessionRef.current) {
      player.pause();
      return "stopped";
    }

    return new Promise<SnippetResult>((resolve) => {
      let settled = false;
      let pollTimer = 0;
      let failsafeTimer = 0;
      let unsubscribeProgress: () => void = () => {};
      let unsubscribeFinish: () => void = () => {};

      const finish = (result: SnippetResult) => {
        if (settled) return;
        settled = true;
        window.clearInterval(pollTimer);
        window.clearTimeout(failsafeTimer);
        unsubscribeProgress();
        unsubscribeFinish();
        if (result === "completed") player.pause();
        resolve(result);
      };

      const check = (position: number) => {
        if (settled) return;
        if (session !== sessionRef.current) {
          finish("stopped");
          return;
        }
        if (position >= limitMs) finish("completed");
      };

      unsubscribeProgress = player.onProgress(check);
      unsubscribeFinish = player.onFinish(() => finish("completed"));

      const startedAt = performance.now();
      pollTimer = window.setInterval(() => {
        if (settled) return;
        if (performance.now() - startedAt >= limitMs + HARD_ELAPSED_SLACK_MS) {
          finish("completed");
          return;
        }
        void player.getPosition().then(check).catch(() => {});
      }, POLL_INTERVAL_MS);

      failsafeTimer = window.setTimeout(() => finish("completed"), limitMs + ABSOLUTE_FAILSAFE_MS);
    });
  }, []);

  const stopPlayback = useCallback((): void => {
    sessionRef.current += 1;
    playerRef.current?.pause();
  }, []);

  return { serviceStatus, serviceError, login, loadTrack, playSnippet, stopPlayback };
}