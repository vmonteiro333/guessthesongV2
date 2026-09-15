import { useCallback, useEffect, useRef, useState } from "react";
import { SoundCloudPlayer } from "../services/audio/SoundCloudPlayer";
import { delay } from "../utils/async";

export type SoundCloudServiceStatus = "waiting_iframe" | "initializing" | "ready" | "error";
export type SnippetResult = "completed" | "stopped";

/** Pequena espera após seekTo(0) para o comando atravessar o iframe. */
const SEEK_SETTLE_MS = 120;
/** Polling de getPosition: PLAY_PROGRESS sozinho é grosso demais p/ 0,1–1s. */
const POLL_INTERVAL_MS = 50;
/** Tolerância de relógio caso a posição não avance (buffering lento). */
const HARD_ELAPSED_SLACK_MS = 2_000;
/** Rede de segurança final caso eventos e polling falhem. */
const ABSOLUTE_FAILSAFE_MS = 5_000;

export interface UseSoundCloudResult {
  attachIframe: (element: HTMLIFrameElement | null) => void;
  serviceStatus: SoundCloudServiceStatus;
  serviceError: string | null;
  whenReady: () => Promise<void>;
  loadTrack: (url: string) => Promise<void>;
  playSnippet: (limitSeconds: number) => Promise<SnippetResult>;
  stopPlayback: () => void;
}

/**
 * Controla TODO o áudio do jogo. Nenhuma chamada a SC.Widget sai daqui.
 * Concorrência: um "sessionRef" (token) invalida monitoramentos/timers antigos;
 * apenas uma reprodução e um monitoramento existem por vez.
 */
export function useSoundCloud(): UseSoundCloudResult {
  const [iframeEl, setIframeEl] = useState<HTMLIFrameElement | null>(null);
  const [serviceStatus, setServiceStatus] = useState<SoundCloudServiceStatus>("waiting_iframe");
  const [serviceError, setServiceError] = useState<string | null>(null);

  const playerRef = useRef<SoundCloudPlayer | null>(null);
  const sessionRef = useRef(0);
  const readyWaitersRef = useRef<Array<{ resolve: () => void; reject: (error: Error) => void }>>([]);

  const attachIframe = useCallback((element: HTMLIFrameElement | null) => {
    setIframeEl(element);
  }, []);

  // Cria o player UMA vez por iframe; limpa tudo na desmontagem.
  useEffect(() => {
    if (!iframeEl) {
      setServiceStatus("waiting_iframe");
      return;
    }

    const player = new SoundCloudPlayer(iframeEl);
    playerRef.current = player;
    setServiceStatus("initializing");
    setServiceError(null);

    let cancelled = false;
    let settled = false;

    const unsubscribeError = player.onError((message) => {
      if (cancelled || settled) return;
      settled = true;
      setServiceError(message);
      setServiceStatus("error");
    });

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
          error instanceof Error ? error.message : "Falha ao inicializar o player do SoundCloud."
        );
      });

    return () => {
      cancelled = true;
      unsubscribeError();
      sessionRef.current += 1; // invalida snippets pendentes
      player.destroy();
      if (playerRef.current === player) playerRef.current = null;
    };
  }, [iframeEl]);

  // Libera quem estava esperando o serviço ficar pronto (ou reporta erro).
  useEffect(() => {
    if (serviceStatus !== "ready" && serviceStatus !== "error") return;
    const waiters = readyWaitersRef.current;
    readyWaitersRef.current = [];
    waiters.forEach((waiter) => {
      if (serviceStatus === "ready") waiter.resolve();
      else waiter.reject(new Error(serviceError ?? "Player do SoundCloud indisponível."));
    });
  }, [serviceStatus, serviceError]);

  const whenReady = useCallback((): Promise<void> => {
    if (serviceStatus === "ready") return Promise.resolve();
    if (serviceStatus === "error") {
      return Promise.reject(new Error(serviceError ?? "Player do SoundCloud indisponível."));
    }
    return new Promise<void>((resolve, reject) => {
      readyWaitersRef.current.push({ resolve, reject });
    });
  }, [serviceStatus, serviceError]);

  const loadTrack = useCallback(async (url: string): Promise<void> => {
    const player = playerRef.current;
    if (!player) throw new Error("O player ainda não foi inicializado.");
    sessionRef.current += 1; // interrompe qualquer snippet em curso
    try {
      player.pause();
    } catch {
      /* noop */
    }
    await player.load(url);
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

  /**
   * Toca o trecho DO INÍCIO e interrompe no limite do estágio.
   * Estratégia (reflete as limitações reais do iframe):
   *   1. pause + seekTo(0) + pequena espera (comando assíncrono);
   *   2. confere posição; se o seek não pegou, tenta mais uma vez;
   *   3. play() e monitoramento TRIPLO:
   *        - evento PLAY_PROGRESS (mecanismo principal);
   *        - polling de getPosition a cada 50ms;
   *        - tolerância de relógio (limitMs + 2s) e failsafe absoluto
   *          (limitMs + 5s) contra eventos atrasados/buffering.
   *   4. pause() assim que o limite é detectado; todos os mecanismos são
   *      limpos; retornos obsoletos são descartados pelo token de sessão.
   * Não prometemos precisão de milissegundos: o iframe responde com latência.
   */
  const playSnippet = useCallback(async (limitSeconds: number): Promise<SnippetResult> => {
    const player = playerRef.current;
    if (!player) throw new Error("O player ainda não foi inicializado.");

    const session = ++sessionRef.current;
    const limitMs = Math.max(50, Math.round(limitSeconds * 1000));

    try {
      player.pause();
    } catch {
      /* noop */
    }
    player.seekTo(0);
    await delay(SEEK_SETTLE_MS);
    if (session !== sessionRef.current) return "stopped";

    try {
      const position = await player.getPosition();
      if (session !== sessionRef.current) return "stopped";
      if (position > limitMs) {
        player.seekTo(0);
        await delay(SEEK_SETTLE_MS);
        if (session !== sessionRef.current) return "stopped";
      }
    } catch {
      /* getPosition falhou: segue — o monitoramento lida com falhas */
    }

    const startedAt = performance.now();
    player.play();
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

      pollTimer = window.setInterval(() => {
        if (settled) return;
        const elapsed = performance.now() - startedAt;
        if (elapsed >= limitMs + HARD_ELAPSED_SLACK_MS) {
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

  return {
    attachIframe,
    serviceStatus,
    serviceError,
    whenReady,
    loadTrack,
    playSnippet,
    stopPlayback,
  };
}