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

const EVIDENCE_TIMEOUT_MS = 15_000;
const ENFORCE_STOP_MS = 12_000;
const POLL_MS = 150;
const POLL_FAST_MS = 90;
const CLOCK_SAFETY_MS = 350; // folga do failsafe de rede (não interfere no corte normal)

export interface UseAudioResult {
  serviceStatus: PlayerServiceStatus;
  serviceError: string | null;
  login: () => void;
  loadTrack: (url: string) => Promise<void>;
  playSnippet: (limitSeconds: number) => Promise<SnippetResult>;
  stopPlayback: () => void;
}

/**
 * Sessão de áudio via Web Playback SDK + Web API (áudio completo, Premium).
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
   * Toca do zero e corta no limite da etapa. Corte decidido pela POSIÇÃO
   * reportada pela Web API (polling) — se o progresso não chegar, o relógio
   * ancorado na evidência corta com folga; se a evidência não chegar em 15s,
   * falha limpando (pause + enforce).
   */
  const playSnippet = useCallback(async (limitSeconds: number): Promise<SnippetResult> => {
    const player = getSpotifyWebPlayer();
    const session = ++sessionRef.current;
    const mySession = session;
    const limitMs = Math.max(50, Math.round(limitSeconds * 1000));
    const cancelled = (): boolean => sessionRef.current !== mySession;

    await player.playFromStart();
    if (cancelled()) {
      void player.enforceStop(ENFORCE_STOP_MS, cancelled);
      return "stopped";
    }

    return new Promise<SnippetResult>((resolve, reject) => {
      let settled = false;
      let timer = 0;
      let failsafeTimer = 0;
      let anchor: number | null = null;
      let evidenceSeen = false;
      let last: { pos: number; at: number } | null = null;
      const startedAt = performance.now();

      const cleanup = (): void => {
        window.clearTimeout(timer);
        window.clearTimeout(failsafeTimer);
      };

      const finish = (result: SnippetResult): void => {
        if (settled) return;
        settled = true;
        cleanup();
        if (result === "completed") {
          void player.enforceStop(ENFORCE_STOP_MS, cancelled);
        }
        resolve(result);
      };

      const fail = (message: string): void => {
        if (settled) return;
        settled = true;
        cleanup();
        void player.enforceStop(ENFORCE_STOP_MS, cancelled);
        reject(new Error(message));
      };

      // Failsafe absoluto: se NADA decidir até aqui, corta.
      failsafeTimer = window.setTimeout(() => {
        fail("A reprodução do Spotify travou. Tente ouvir novamente.");
      }, EVIDENCE_TIMEOUT_MS + limitMs + 8_000);

      const loop = async (): Promise<void> => {
        if (settled) return;
        const st = await player.fetchWebPlaybackState();
        if (settled) return;
        if (cancelled()) {
          finish("stopped");
          return;
        }
        const now = performance.now();

        if (st.ok && st.snapshot && st.snapshot.isPlaying && st.snapshot.progressMs !== null) {
          const pos = st.snapshot.progressMs;
          const advanced = last !== null && pos > last.pos && now - last.at >= 150;

          // Evidência: primeira amostra confiável de áudio jovem (pos pequena).
          if (!evidenceSeen && (advanced || pos > 500) && pos <= 1000) {
            evidenceSeen = true;
            anchor = now - pos;
          }
          last = { pos, at: now };

          if (evidenceSeen && anchor !== null) {
            const audioElapsed = now - anchor;
            // CORTE ÚNICO por relógio ancorado (sem subtração no limite).
            if (audioElapsed >= limitMs) {
              finish("completed");
              return;
            }
            // Failsafe por posição (rede atrasando o relógio da aba).
            if (pos >= limitMs + CLOCK_SAFETY_MS) {
              finish("completed");
              return;
            }
          }
        } else if (st.ok && st.snapshot && !st.snapshot.isPlaying && last !== null) {
          // O Spotify reportou PAUSE que não veio do jogo: o áudio morreu
          // (ex.: device despejado). Corta como fim para não ficar cego.
          if (evidenceSeen) {
            finish("completed");
            return;
          }
          last = null;
        }

        if (!evidenceSeen && now - startedAt >= EVIDENCE_TIMEOUT_MS) {
          fail("O Spotify não começou a tocar a tempo. Tente ouvir novamente.");
          return;
        }

        const nearEnd =
          evidenceSeen && anchor !== null && now >= anchor + limitMs - 400;
        timer = window.setTimeout(() => void loop(), nearEnd ? POLL_FAST_MS : POLL_MS);
      };

      void loop();
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