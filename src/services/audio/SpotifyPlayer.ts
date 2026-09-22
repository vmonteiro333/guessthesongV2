import type { SpotifyEmbedController, SpotifyIframeApi } from "../../types/spotify";
import type { AudioPlayer, Unsubscribe } from "./types";
import { toSpotifyUri } from "../../utils/spotifyUrl";

const API_SCRIPT_URL = "https://open.spotify.com/embed/iframe-api/v1";
const API_TIMEOUT_MS = 15_000;
const CREATE_TIMEOUT_MS = 15_000;
const LOAD_TIMEOUT_MS = 12_000;
/** Se o 1º update após play() indicar posição alta, o seek(0) não pegou. */
const START_CORRECTION_THRESHOLD_MS = 500;

let apiPromise: Promise<SpotifyIframeApi> | null = null;

/** Carrega o script OFICIAL da IFrame API do Spotify uma única vez (idempotente). */
function loadSpotifyIframeApi(): Promise<SpotifyIframeApi> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.reject(new Error("O player do Spotify só funciona no navegador."));
  }
  if (apiPromise) return apiPromise;

  apiPromise = new Promise<SpotifyIframeApi>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      apiPromise = null;
      reject(new Error("O player do Spotify demorou demais para carregar."));
    }, API_TIMEOUT_MS);

    window.onSpotifyIframeApiReady = (api: SpotifyIframeApi) => {
      window.clearTimeout(timer);
      resolve(api);
    };

    const script = document.createElement("script");
    script.src = API_SCRIPT_URL;
    script.async = true;
    script.addEventListener("error", () => {
      window.clearTimeout(timer);
      apiPromise = null;
      reject(new Error("Falha de rede ao carregar o player do Spotify."));
    });
    document.head.appendChild(script);
  });

  return apiPromise;
}

function safeCall<A extends unknown[]>(fn: (...args: A) => void, ...args: A): void {
  try {
    fn(...args);
  } catch (error) {
    console.error("[SpotifyPlayer] listener falhou:", error);
  }
}

/**
 * Implementação de AudioPlayer sobre o embed OFICIAL do Spotify (IFrame API).
 * - Sem credenciais: toca a prévia pública de 30s (as etapas vão até 16s).
 * - UM controller por sessão; troca de faixa via controller.loadUri().
 * - Limitação honesta: faixa sem prévia fica muda → o jogo a marca como
 *   indisponível e pula. "ready" pós-loadUri não é garantido pela
 *   documentação — por isso o load resolve por timeout de segurança.
 */
export class SpotifyPlayer implements AudioPlayer {
  private api: SpotifyIframeApi | null = null;
  private controller: SpotifyEmbedController | null = null;
  private readonly container: HTMLElement;
  private destroyed = false;
  private loadSequence = 0;
  private lastPositionMs = 0;
  private lastDurationMs = 0;
  private finishEmitted = false;
  private startCorrectionArmed = false;
  private readyWaiters: Array<{ resolve: () => void; reject: (error: Error) => void }> = [];

  private readonly listeners = {
    ready: new Set<() => void>(),
    play: new Set<() => void>(),
    pause: new Set<() => void>(),
    progress: new Set<(positionMs: number) => void>(),
    finish: new Set<() => void>(),
    error: new Set<(message: string) => void>(),
  };

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async init(): Promise<void> {
    if (this.destroyed) throw new Error("O player foi encerrado.");
    if (!this.api) this.api = await loadSpotifyIframeApi();
  }

  private bindController(controller: SpotifyEmbedController): void {
    controller.addListener("ready", () => {
      const waiters = this.readyWaiters;
      this.readyWaiters = [];
      waiters.forEach((waiter) => waiter.resolve());
      this.listeners.ready.forEach((fn) => safeCall(fn));
    });

    controller.addListener("playback_update", (event) => {
      const data = (event as { data?: { position?: number; duration?: number } })?.data;
      const position = typeof data?.position === "number" ? data.position : 0;
      const duration = typeof data?.duration === "number" ? data.duration : 0;
      this.lastPositionMs = Math.max(0, position);
      if (duration > 0) this.lastDurationMs = duration;

      if (this.startCorrectionArmed) {
        this.startCorrectionArmed = false;
        if (this.lastPositionMs > START_CORRECTION_THRESHOLD_MS) {
          try {
            controller.seek(0);
          } catch {
            /* noop */
          }
          this.lastPositionMs = 0;
        }
      }

      if (duration > 0 && position > 0 && position >= duration - 100 && !this.finishEmitted) {
        this.finishEmitted = true;
        this.listeners.finish.forEach((fn) => safeCall(fn));
      }

      this.listeners.progress.forEach((fn) => safeCall(fn, this.lastPositionMs));
    });
  }

  async load(url: string): Promise<void> {
    if (this.destroyed) throw new Error("O player foi encerrado.");
    const uri = toSpotifyUri(url);
    if (!uri) {
      throw new Error("URL do Spotify inválida (esperado https://open.spotify.com/track/...).");
    }

    await this.init();
    if (this.destroyed) return;

    const sequence = ++this.loadSequence;
    this.lastPositionMs = 0;
    this.lastDurationMs = 0;
    this.finishEmitted = false;
    this.startCorrectionArmed = false;

    if (!this.controller) {
      const api = this.api;
      if (!api) throw new Error("Iframe API do Spotify indisponível.");
      await new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(() => {
          reject(new Error("Tempo excedido ao criar o embed do Spotify."));
        }, CREATE_TIMEOUT_MS);
        api.createController(this.container, { uri }, (controller, error) => {
          window.clearTimeout(timer);
          if (error || !controller) {
            reject(new Error("Não foi possível criar o embed do Spotify para esta faixa."));
            return;
          }
          this.controller = controller;
          this.bindController(controller);
          resolve();
        });
      });
    } else {
      this.controller.loadUri(uri);
    }

    if (sequence !== this.loadSequence || this.destroyed) return;

    // Rede de segurança: aguarda "ready", mas resolve por timeout para não
    // travar o catálogo (limitação conhecida da IFrame API).
    await new Promise<void>((resolve) => {
      const timer = window.setTimeout(() => resolve(), LOAD_TIMEOUT_MS);
      const unsubscribe = this.onReady(() => {
        window.clearTimeout(timer);
        unsubscribe();
        resolve();
      });
    });
  }

  async playFromStart(): Promise<void> {
    const controller = this.controller;
    if (!controller) throw new Error("Nenhuma faixa carregada no player do Spotify.");
    this.finishEmitted = false;
    this.startCorrectionArmed = true;
    this.lastPositionMs = 0;
    try {
      controller.pause();
    } catch {
      /* noop */
    }
    try {
      controller.seek(0);
    } catch {
      /* noop */
    }
    controller.play();
  }

  play(): void {
    this.controller?.play();
  }

  pause(): void {
    try {
      this.controller?.pause();
    } catch {
      /* noop */
    }
  }

  seekTo(milliseconds: number): void {
    try {
      this.controller?.seek(Math.max(0, Math.round(milliseconds / 1000)));
    } catch {
      /* noop */
    }
  }

  async getPosition(): Promise<number> {
    return this.lastPositionMs;
  }

  async getDuration(): Promise<number> {
    return this.lastDurationMs;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.loadSequence += 1;
    try {
      this.controller?.pause();
    } catch {
      /* noop */
    }
    const waiters = this.readyWaiters;
    this.readyWaiters = [];
    waiters.forEach((waiter) => waiter.reject(new Error("O player foi encerrado.")));
    (Object.keys(this.listeners) as Array<keyof typeof this.listeners>).forEach((key) => {
      this.listeners[key].clear();
    });
    this.controller = null;
  }

  onReady(listener: () => void): Unsubscribe {
    return this.subscribe(this.listeners.ready, listener);
  }
  onPlay(listener: () => void): Unsubscribe {
    return this.subscribe(this.listeners.play, listener);
  }
  onPause(listener: () => void): Unsubscribe {
    return this.subscribe(this.listeners.pause, listener);
  }
  onProgress(listener: (positionMs: number) => void): Unsubscribe {
    return this.subscribe(this.listeners.progress, listener);
  }
  onFinish(listener: () => void): Unsubscribe {
    return this.subscribe(this.listeners.finish, listener);
  }
  onError(listener: (message: string) => void): Unsubscribe {
    return this.subscribe(this.listeners.error, listener);
  }

  private subscribe<V>(set: Set<V>, listener: V): Unsubscribe {
    set.add(listener);
    return () => {
      set.delete(listener);
    };
  }
}