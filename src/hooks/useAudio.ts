import { useCallback, useEffect, useRef, useState } from "react";
import { SpotifyPlayer } from "../services/audio/SpotifyPlayer";
import { isSpotifyTrackUrl } from "../utils/spotifyUrl";

export type PlayerServiceStatus = "waiting_player" | "initializing" | "ready" | "error";
export type SnippetResult = "completed" | "stopped";

const POLL_INTERVAL_MS = 50;
const HARD_ELAPSED_SLACK_MS = 2_000;
const ABSOLUTE_FAILSAFE_MS = 5_000;

export interface UseAudioResult {
  attachContainer: (element: HTMLDivElement | null) => void;
  serviceStatus: PlayerServiceStatus;
  serviceError: string | null;
  loadTrack: (url: string) => Promise<void>;
  playSnippet: (limitSeconds: number) => Promise<SnippetResult>;
  stopPlayback: () => void;
}

/**
 * Controla TODO o áudio do jogo via Spotify embed. Nenhuma chamada à IFrame
 * API sai daqui. Token de sessão invalida monitoramentos antigos; apenas
 * uma reprodução e um monitoramento existem por vez.
 */
export function useAudio(): UseAudioResult {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [serviceStatus, setServiceStatus] = useState<PlayerServiceStatus>("waiting_player");
  const [serviceError, setServiceError] = useState<string | null>(null);

  const playerRef = useRef<SpotifyPlayer | null>(null);
  const sessionRef = useRef(0);

  const attachContainer = useCallback((element: HTMLDivElement | null) => {
    setContainer(element);
  }, []);

  // Cria o player UMA vez por container; limpa tudo na desmontagem.
  useEffect(() => {
    if (!container) return;
    const player = new SpotifyPlayer(container);
    playerRef.current = player;
    setServiceStatus("initializing");
    setServiceError(null);

    let cancelled = false;
    let settled = false;
    player
      .init()
      .then(() => {
        if (cancelled || settled) return;
        settled = true;
        setServiceStatus("ready");
      })
      .catch((error: unknown) => {
        if (cancelled || settled) return;
        settled = true;
        setServiceStatus("error");
        setServiceError(
          error instanceof Error ? error.message : "Falha ao inicializar o player do Spotify."
        );
      });

    return () => {
      cancelled = true;
      sessionRef.current += 1;
      player.destroy();
      if (playerRef.current === player) playerRef.current = null;
    };
  }, [container]);

  const loadTrack = useCallback(async (url: string): Promise<void> => {
    const player = playerRef.current;
    if (!player) throw new Error("O player do Spotify ainda não foi montado na página.");
    if (!isSpotifyTrackUrl(url)) {
      throw new Error("URL do Spotify inválida (use o link open.spotify.com/track/...).");
    }
    sessionRef.current += 1; // interrompe qualquer snippet em curso
    try {
      player.pause();
    } catch {
      /* noop */
    }
    await player.load(url);
  }, []);

  /**
   * Toca o trecho DO INÍCIO e interrompe no limite do estágio.
   * Monitoramento triplo (playback_update + polling + redes de segurança de
   * relógio). Não prometemos precisão de milissegundos: iframe remoto.
   */
  const playSnippet = useCallback(async (limitSeconds: number): Promise<SnippetResult> => {
    const player = playerRef.current;
    if (!player) throw new Error("Nenhuma música carregada para reproduzir.");

    const session = ++sessionRef.current;
    const limitMs = Math.max(50, Math.round(limitSeconds * 1000));

    await player.playFromStart();
    if (session !== sessionRef.current) {
      try {
        player.pause();
      } catch {
        /* noop */
      }
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
        if (result === "completed") {
          try {
            player.pause();
          } catch {
            /* noop */
          }
        }
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
        player
          .getPosition()
          .then(check)
          .catch(() => {
            /* tenta de novo no próximo tick */
          });
      }, POLL_INTERVAL_MS);

      failsafeTimer = window.setTimeout(() => finish("completed"), limitMs + ABSOLUTE_FAILSAFE_MS);
    });
  }, []);

  const stopPlayback = useCallback((): void => {
    sessionRef.current += 1;
    const player = playerRef.current;
    if (!player) return;
    try {
      player.pause();
    } catch {
      /* noop */
    }
  }, []);

  return {
    attachContainer,
    serviceStatus,
    serviceError,
    loadTrack,
    playSnippet,
    stopPlayback,
  };
}