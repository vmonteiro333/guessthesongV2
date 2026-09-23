import { useCallback, useEffect, useRef, useState } from "react";
import { getSpotifyWebPlayer } from "../services/audio/SpotifyWebPlayer";
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
const PLAYBACK_EVIDENCE_TIMEOUT_MS = 8_000;

export interface UseAudioResult {
  serviceStatus: PlayerServiceStatus;
  serviceError: string | null;
  login: () => void;
  loadTrack: (url: string) => Promise<void>;
  playSnippet: (limitSeconds: number) => Promise<SnippetResult>;
  stopPlayback: () => void;
}

/**
 * Sessão de áudio via Web Playback SDK (áudio completo, Premium).
 * O player é um SINGLETON de página (sobrevive ao remount do StrictMode).
 */
export function useAudio(): UseAudioResult {
  const [serviceStatus, setServiceStatus] = useState<PlayerServiceStatus>("boot");
  const [serviceError, setServiceError] = useState<string | null>(null);
  const sessionRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const player = getSpotifyWebPlayer();
    const unsubscribeFatal = player.onError((message) => {
      setServiceError(message);
    });

    void (async () => {
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
          setServiceError(error instanceof Error ? error.message : "Falha ao conectar ao Spotify.");
        }
      }
    })();

    return () => {
      cancelled = true;
      unsubscribeFatal();
      sessionRef.current += 1;
    };
  }, []);

  const login = useCallback(() => {
    void startLogin();
  }, []);

  /** Carrega a faixa da rodada e PRÉ-BUFFERIZA (priming) em volume mudo. */
  const loadTrack = useCallback(async (url: string): Promise<void> => {
    const player = getSpotifyWebPlayer();
    sessionRef.current += 1;
    await player.load(url);
    try {
      await player.prime();
    } catch {
      /* sem priming: o buffer acontece no primeiro play */
    }
  }, []);

  /**
   * Toca a música DO ZERO e corta no limite do estágio. O corte monitora
   * desde já e usa a posição real do áudio; com o priming, a evidência chega
   * rápido e o corte fica preciso até no primeiro play.
   */
  const playSnippet = useCallback(async (limitSeconds: number): Promise<SnippetResult> => {
    const player = getSpotifyWebPlayer();

    const session = ++sessionRef.current;
    const limitMs = Math.max(50, Math.round(limitSeconds * 1000));

    await player.playFromStart();
    if (session !== sessionRef.current) {
      player.pause();
      return "stopped";
    }

    await player.waitForPlaybackEvidence(PLAYBACK_EVIDENCE_TIMEOUT_MS);
    if (session !== sessionRef.current) {
      player.pause();
      return "stopped";
    }

    return new Promise<SnippetResult>((resolve) => {
      let settled = false;
      let pollTimer = 0;
      let slackTimer = 0;
      let failsafeTimer = 0;
      let unsubscribeFinish: () => void = () => {};

      const finish = (result: SnippetResult) => {
        if (settled) return;
        settled = true;
        window.clearInterval(pollTimer);
        window.clearTimeout(slackTimer);
        window.clearTimeout(failsafeTimer);
        unsubscribeFinish();
        if (result === "completed") {
          player.pause();
          const mySession = sessionRef.current;
          void player.enforceStop(4_000, () => sessionRef.current !== mySession);
        }
        resolve(result);
      };

      // O corte usa a posição real/interpolada — se o áudio já passou do
      // limite quando a evidência chega, corta no primeiro tick.
      pollTimer = window.setInterval(() => {
        if (settled) return;
        void player
          .getPosition()
          .then((position) => {
            if (settled) return;
            if (session !== sessionRef.current) {
              finish("stopped");
              return;
            }
            if (position >= limitMs) finish("completed");
          })
          .catch(() => {});
      }, POLL_INTERVAL_MS);

      unsubscribeFinish = player.onFinish(() => finish("completed"));

      // Redes de segurança finais (contadas desde já, generosas de propósito).
      slackTimer = window.setTimeout(() => finish("completed"), limitMs + HARD_ELAPSED_SLACK_MS);
      failsafeTimer = window.setTimeout(() => finish("completed"), limitMs + ABSOLUTE_FAILSAFE_MS);
    });
  }, []);

  const stopPlayback = useCallback((): void => {
    sessionRef.current += 1;
    const player = getSpotifyWebPlayer();
    const mySession = sessionRef.current;
    player.pause();
    void player.enforceStop(4_000, () => sessionRef.current !== mySession);
  }, []);

  return { serviceStatus, serviceError, login, loadTrack, playSnippet, stopPlayback };
}