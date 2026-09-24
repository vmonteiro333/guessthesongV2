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
const EVIDENCE_GRACE_MS = 1_500;
const PLAYBACK_EVIDENCE_TIMEOUT_MS = 15_000;
const ENFORCE_STOP_MS = 15_000;

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

  const loadTrack = useCallback(async (url: string): Promise<void> => {
    const player = getSpotifyWebPlayer();
    sessionRef.current += 1;
    await player.load(url);
  }, []);

  /**
   * Toca do zero e corta no limite da etapa. O cronômetro conta só TEMPO DE
   * ÁUDIO (começa na evidência de posição avançando), então o pause sempre
   * cai com som fluindo e é honrado. Failsafe curto cobre travadas do polling.
   */
  const playSnippet = useCallback(async (limitSeconds: number): Promise<SnippetResult> => {
    const player = getSpotifyWebPlayer();

    const session = ++sessionRef.current;
    const limitMs = Math.max(50, Math.round(limitSeconds * 1000));
    const mySession = session;

    const safeStop = (): void => {
      player.pause();
      void player.enforceStop(ENFORCE_STOP_MS, () => sessionRef.current !== mySession);
    };

    await player.playFromStart();
    if (session !== sessionRef.current) {
      safeStop();
      return "stopped";
    }

    let audioZeroAt: number;
    try {
      audioZeroAt = await player.waitForPlaybackEvidence(PLAYBACK_EVIDENCE_TIMEOUT_MS);
    } catch (error) {
      if (session !== sessionRef.current) return "stopped";
      safeStop();
      throw error;
    }
    if (session !== sessionRef.current) {
      safeStop();
      return "stopped";
    }

    return new Promise<SnippetResult>((resolve) => {
      let settled = false;
      let pollTimer = 0;
      let failsafeTimer = 0;
      let unsubscribeFinish: () => void = () => {};

      const finish = (result: SnippetResult) => {
        if (settled) return;
        settled = true;
        window.clearInterval(pollTimer);
        window.clearTimeout(failsafeTimer);
        unsubscribeFinish();
        if (result === "completed") safeStop();
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

      pollTimer = window.setInterval(() => {
        if (settled) return;
        void player.getPosition().then(check).catch(() => {});
      }, POLL_INTERVAL_MS);

      unsubscribeFinish = player.onFinish(() => finish("completed"));

      // Failsafe: âncora + limite + folga curta (o corte normal é por posição;
      // este só cobre travadas do relógio de posição).
      failsafeTimer = window.setTimeout(
        () => finish("completed"),
        Math.max(0, audioZeroAt + limitMs + EVIDENCE_GRACE_MS - performance.now())
      );
    });
  }, []);

  const stopPlayback = useCallback((): void => {
    sessionRef.current += 1;
    const player = getSpotifyWebPlayer();
    const mySession = sessionRef.current;
    player.pause();
    void player.enforceStop(ENFORCE_STOP_MS, () => sessionRef.current !== mySession);
  }, []);

  return { serviceStatus, serviceError, login, loadTrack, playSnippet, stopPlayback };
}