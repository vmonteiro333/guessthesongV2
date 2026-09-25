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

const EVIDENCE_TIMEOUT_MS = 12_000;
const ENFORCE_STOP_MS = 12_000;
const POLL_MS = 150;
const POLL_FAST_MS = 90;
const CLOCK_SAFETY_MS = 350;
const PAUSE_LEAD_MS = 300;     // antecipação do pause (compensa latência do PUT)
const HARD_CAP_EXTRA_MS = 700; // cap absoluto depois do limite

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
   * Toca do zero e corta no limite da etapa. Estratégia:
   * 1. Evidência = 1 amostra com progresso > 0 (âncora do zero do áudio);
   *    se o device travar, reativa-o (refreshDevice) e tenta 1x de novo.
   * 2. Pause AGENDADO em (âncora + limite − PAUSE_LEAD) — chega no tempo.
   * 3. Cap absoluto em (âncora + limite + 700ms) — mata qualquer "infinito".
   * 4. Polling como rede de segurança (posição + pausa vinda de fora).
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

    let anchor: number | null = null;
    for (let attempt = 0; attempt < 2 && !cancelled() && anchor === null; attempt += 1) {
      try {
        anchor = await player.waitForPlaybackEvidence(
          attempt === 0 ? EVIDENCE_TIMEOUT_MS : 8_000,
          limitMs + 2_000,
          cancelled
        );
      } catch {
        if (cancelled()) return "stopped";
        if (attempt === 0) {
          // Device provavelmente "zumbi": reativa e joga de novo (1 retry).
          await player.refreshDevice();
          await player.playFromStart();
        }
      }
    }
    if (cancelled()) {
      void player.enforceStop(ENFORCE_STOP_MS, cancelled);
      return "stopped";
    }
    if (anchor === null) {
      player.stopNow();
      void player.enforceStop(ENFORCE_STOP_MS, cancelled);
      throw new Error("O Spotify não começou a tocar a tempo. Tente ouvir novamente.");
    }
    const audioZeroAt: number = anchor;

    return new Promise<SnippetResult>((resolve) => {
      let settled = false;
      let pollTimer = 0;
      let leadTimer = 0;
      let hardTimer = 0;
      const startedAt = performance.now();

      const cleanup = (): void => {
        window.clearTimeout(pollTimer);
        window.clearTimeout(leadTimer);
        window.clearTimeout(hardTimer);
      };

      const finish = (result: SnippetResult): void => {
        if (settled) return;
        settled = true;
        cleanup();
        if (result === "completed") {
          player.stopNow();
          void player.enforceStop(ENFORCE_STOP_MS, cancelled);
        }
        resolve(result);
      };

      // Pause agendado: dispara ANTES do limite para aterrissar nele.
      leadTimer = window.setTimeout(
        () => player.stopNow(),
        Math.max(0, audioZeroAt + limitMs - PAUSE_LEAD_MS - performance.now())
      );
      // Cap absoluto: mesmo se toda a cadeia falhar, corta aqui.
      hardTimer = window.setTimeout(
        () => finish("completed"),
        Math.max(0, audioZeroAt + limitMs + HARD_CAP_EXTRA_MS - performance.now())
      );

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
          // Failsafe por posição (rede atrasando o agendado).
          if (pos >= limitMs + CLOCK_SAFETY_MS) {
            finish("completed");
            return;
          }
        } else if (st.ok && (st.snapshot === null || !st.snapshot.isPlaying)) {
          // Pausa vinda de fora = nosso stopNow agendado OU device morreu;
          // nos dois casos o trecho acabou.
          finish("completed");
          return;
        }

        if (!settled && now - startedAt >= EVIDENCE_TIMEOUT_MS + limitMs + 8_000) {
          finish("completed"); // rede de segurança final do loop
          return;
        }

        const nearEnd = now >= audioZeroAt + limitMs - 500;
        pollTimer = window.setTimeout(() => void loop(), nearEnd ? POLL_FAST_MS : POLL_MS);
      };

      void loop();
    });
  }, []);

  const stopPlayback = useCallback((): void => {
    sessionRef.current += 1;
    const player = getSpotifyWebPlayer();
    const mySession = sessionRef.current;
    player.stopNow();
    void player.enforceStop(ENFORCE_STOP_MS, () => sessionRef.current !== mySession);
  }, []);

  return { serviceStatus, serviceError, login, loadTrack, playSnippet, stopPlayback };
}