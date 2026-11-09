import { useCallback, useEffect, useRef, useState } from "react";
import { getSpotifyWebPlayer } from "../services/audio/SpotifyWebPlayer";
import {
  handleAuthRedirect,
  loadTokens,
  startLogin,
  getValidAccessToken,
} from "../services/audio/spotifyAuth";
import { AudioFailure, audioFailure } from "../services/audio/errors";

export type PlayerServiceStatus = "boot" | "needs_login" | "connecting" | "ready" | "error";
export type SnippetResult = "completed" | "stopped";
export type SnippetPhase = "idle" | "buffering" | "playing";

export interface TrackMeta {
  coverUrl: string | null;
  trackName: string | null;
  artistName: string | null;
}

const EVIDENCE_TIMEOUT_MS = 12_000;
const ENFORCE_STOP_MS = 12_000;
const POLL_MS = 150;
const POLL_FAST_MS = 90;
const CLOCK_SAFETY_MS = 350;
const PAUSE_LEAD_MS = 300;
const HARD_CAP_EXTRA_MS = 700;

export interface UseAudioResult {
  serviceStatus: PlayerServiceStatus;
  serviceError: string | null;
  failure: AudioFailure | null;
  snippetPhase: SnippetPhase;
  trackMeta: TrackMeta | null;
  login: () => Promise<void>;
  retry: () => Promise<boolean>;
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
  const [snippetPhase, setSnippetPhase] = useState<SnippetPhase>("idle");
  const [trackMeta, setTrackMeta] = useState<TrackMeta | null>(null);
  const sessionRef = useRef(0);
  const [failure, setFailure] = useState<AudioFailure | null>(null);
  const cancelSnippetRef = useRef<((error?: AudioFailure) => void) | null>(null);
  const connectionSeq = useRef(0);

  const reportFailure = useCallback((cause: unknown) => {
    const error = audioFailure(cause);
    connectionSeq.current += 1;
    cancelSnippetRef.current?.(error);
    sessionRef.current += 1;
    setSnippetPhase("idle");
    getSpotifyWebPlayer().stopNow();
    setFailure(error);
    setServiceError(error.kind === "auth" ? "Sua sessão do Spotify precisa ser reconectada." : error.message);
    if (error.kind !== "unavailable") setServiceStatus(error.kind === "auth" ? "needs_login" : "error");
  }, []);

  const retry = useCallback(async (): Promise<boolean> => {
    const operation = ++connectionSeq.current;
    setServiceStatus("connecting");
    try {
      await getValidAccessToken();
      await getSpotifyWebPlayer().recover();
      if (operation !== connectionSeq.current) return false;
      setFailure(null);
      setServiceError(null);
      setServiceStatus("ready");
      return true;
    } catch (error) {
      if (operation === connectionSeq.current) reportFailure(error);
      return false;
    }
  }, [reportFailure]);

  useEffect(() => {
    let cancelled = false;
    const operation = ++connectionSeq.current;
    const player = getSpotifyWebPlayer();
    const unsubscribeFatal = player.onError(reportFailure);

    void (async () => {
      setServiceStatus("connecting");
      try {
        await handleAuthRedirect();
      } catch (error) {
        if (cancelled || operation !== connectionSeq.current) return;
        setServiceStatus("needs_login");
        setFailure(new AudioFailure("auth", "Falha no retorno do login do Spotify."));
        setServiceError(error instanceof Error ? error.message : "Falha no login do Spotify.");
        return;
      }
      if (cancelled || operation !== connectionSeq.current) return;
      if (!loadTokens()) {
        setServiceStatus("needs_login");
        return;
      }
      try {
        await player.init();
        if (cancelled || operation !== connectionSeq.current) return;
        setServiceStatus("ready");
      } catch (error) {
        if (cancelled || operation !== connectionSeq.current) return;
        reportFailure(error);
      }
    })();

    return () => {
      cancelled = true;
      unsubscribeFatal();
      connectionSeq.current += 1;
      cancelSnippetRef.current?.();
      sessionRef.current += 1;
    };
  }, [reportFailure]);

  const login = useCallback(async () => {
    try { await startLogin(); } catch (error) { reportFailure(error); }
  }, [reportFailure]);

  const loadTrack = useCallback(async (url: string): Promise<void> => {
    const player = getSpotifyWebPlayer();
    cancelSnippetRef.current?.();
    const session = ++sessionRef.current;
    setTrackMeta(null); // capa antiga não vaza na rodada nova
    setSnippetPhase("idle");
    try {
      await getValidAccessToken();
      if (session !== sessionRef.current) return;
      await player.load(url);
    } catch (error) {
      const failure = audioFailure(error);
      if (session === sessionRef.current) reportFailure(failure);
      throw failure;
    }
  }, [reportFailure]);

  /**
   * Toca do zero e corta no limite da etapa. Estratégia:
   * 1. Evidência = 1 amostra com progresso > 0 (âncora do zero do áudio);
   *    device travado → refreshDevice + 1 retry automático.
   * 2. Pause AGENDADO em (âncora + limite − PAUSE_LEAD) — chega no tempo.
   * 3. Cap absoluto em (âncora + limite + 700ms) — mata qualquer "infinito".
   * 4. Polling como rede de segurança (posição + pausa vinda de fora).
   * snippetPhase dirige a UI (buffering → playing → idle).
   */
  const playSnippet = useCallback(async (limitSeconds: number): Promise<SnippetResult> => {
    const player = getSpotifyWebPlayer();
    cancelSnippetRef.current?.();
    const session = ++sessionRef.current;
    const mySession = session;
    const limitMs = Math.max(50, Math.round(limitSeconds * 1000));
    const cancelled = (): boolean => sessionRef.current !== mySession;

    setSnippetPhase("buffering");

    try {
      await player.playFromStart();
      if (cancelled()) {
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
        } catch (error) {
          if (cancelled()) {
            return "stopped";
          }
          if (error instanceof AudioFailure) throw error;
          if (attempt === 0) {
            await player.refreshDevice();
            await player.playFromStart();
          }
        }
      }
      if (cancelled()) {
        return "stopped";
      }
      if (anchor === null) {
        player.stopNow();
        setSnippetPhase("idle");
        void player.enforceStop(ENFORCE_STOP_MS, cancelled);
        throw new Error("O Spotify não começou a tocar a tempo. Tente ouvir novamente.");
      }
      const audioZeroAt: number = anchor;
      if (!cancelled()) setSnippetPhase("playing");

      return await new Promise<SnippetResult>((resolve, reject) => {
        let settled = false;
        let pollTimer = 0;
        let leadTimer = 0;
        let hardTimer = 0;
        const startedAt = performance.now();

        const cleanup = (): void => {
          window.clearTimeout(pollTimer);
          window.clearTimeout(leadTimer);
          window.clearTimeout(hardTimer);
          cancelSnippetRef.current = null;
        };

        cancelSnippetRef.current = (error) => {
          if (settled) return;
          if (!error) { finish("stopped"); return; }
          settled = true;
          cleanup();
          reject(error);
        };

        const finish = (result: SnippetResult): void => {
          if (settled) return;
          settled = true;
          cleanup();
          setSnippetPhase("idle");
          if (result === "completed") {
            player.stopNow();
            void player.enforceStop(ENFORCE_STOP_MS, cancelled);
          }
          resolve(result);
        };

        // Pause agendado: dispara ANTES do limite para aterrissar nele.
        leadTimer = window.setTimeout(
          () => { if (!cancelled()) player.stopNow(); },
          Math.max(0, audioZeroAt + limitMs - PAUSE_LEAD_MS - performance.now())
        );
        // Cap absoluto: mesmo se toda a cadeia falhar, corta aqui.
        hardTimer = window.setTimeout(
          () => finish(cancelled() ? "stopped" : "completed"),
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
          if (!st.ok) {
            cancelSnippetRef.current?.(st.error);
            return;
          }
          const now = performance.now();

          if (st.ok && st.snapshot && st.snapshot.isPlaying && st.snapshot.progressMs !== null) {
            const pos = st.snapshot.progressMs;
            if (pos >= limitMs + CLOCK_SAFETY_MS) {
              finish("completed");
              return;
            }
          } else if (st.ok && (st.snapshot === null || !st.snapshot.isPlaying)) {
            finish("completed");
            return;
          }

          // Meta para a UI (capa/artista) — só atualiza quando muda (sem spam de render).
          if (st.ok && st.snapshot && st.snapshot.trackName) {
            const snap = st.snapshot;
            setTrackMeta((prev) =>
              prev && prev.trackName === snap.trackName
                ? prev
                : { coverUrl: snap.coverUrl, trackName: snap.trackName, artistName: snap.artistName }
            );
          }

          if (!settled && now - startedAt >= EVIDENCE_TIMEOUT_MS + limitMs + 8_000) {
            finish("completed");
            return;
          }

          const nearEnd = now >= audioZeroAt + limitMs - 500;
          pollTimer = window.setTimeout(() => void loop(), nearEnd ? POLL_FAST_MS : POLL_MS);
        };

        void loop();
      });
    } catch (error) {
      if (cancelled()) return "stopped";
      const failure = audioFailure(error);
      reportFailure(failure);
      throw failure;
    }
  }, [reportFailure]);

  const stopPlayback = useCallback((): void => {
    cancelSnippetRef.current?.();
    sessionRef.current += 1;
    setSnippetPhase("idle");
    const player = getSpotifyWebPlayer();
    const mySession = sessionRef.current;
    player.stopNow();
    void player.enforceStop(ENFORCE_STOP_MS, () => sessionRef.current !== mySession);
  }, []);

  return { serviceStatus, serviceError, failure, snippetPhase, trackMeta, login, retry, loadTrack, playSnippet, stopPlayback };
}
