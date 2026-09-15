import type { ScWidget } from "../../types/soundcloud";
import type { AudioPlayer, Unsubscribe } from "./types";
import { withTimeout } from "../../utils/async";

const API_SCRIPT_URL = "https://w.soundcloud.com/player/api.js";
const API_SCRIPT_TIMEOUT_MS = 10_000;
const LOAD_TIMEOUT_MS = 15_000;
const GETTER_TIMEOUT_MS = 3_000;

let apiScriptPromise: Promise<void> | null = null;

/** Carrega o script OFICIAL do widget uma única vez (idempotente). */
function loadApiScript(): Promise<void> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.reject(new Error("O player do SoundCloud só funciona no navegador."));
  }
  if (window.SC?.Widget) return Promise.resolve();
  if (apiScriptPromise) return apiScriptPromise;

  apiScriptPromise = new Promise<void>((resolve, reject) => {
    const finish = () => {
      if (window.SC?.Widget) resolve();
      else reject(new Error("O script do SoundCloud carregou sem a API esperada."));
    };

    const script =
      document.querySelector<HTMLScriptElement>(`script[src="${API_SCRIPT_URL}"]`) ??
      document.createElement("script");

    script.addEventListener("load", finish, { once: true });
    script.addEventListener(
      "error",
      () => {
        apiScriptPromise = null; // permite nova tentativa
        reject(new Error("Falha de rede ao carregar o script do SoundCloud."));
      },
      { once: true }
    );

    if (!script.parentElement) {
      script.src = API_SCRIPT_URL;
      script.async = true;
      document.head.appendChild(script);
    }
  });

  return apiScriptPromise;
}

function safeCall<A extends unknown[]>(fn: (...args: A) => void, ...args: A): void {
  try {
    fn(...args);
  } catch (error) {
    console.error("[SoundCloudPlayer] listener falhou:", error);
  }
}

/**
 * Implementação concreta de AudioPlayer sobre o SoundCloud HTML5 Widget.
 * - UM único iframe por sessão; troca de música via widget.load(url, {callback}).
 * - auto_play sempre false (nada toca sem interação do usuário).
 * - Eventos preservados entre loads (comportamento documentado do widget).
 */
export class SoundCloudPlayer implements AudioPlayer {
  private widget: ScWidget | null = null;
  private readonly iframe: HTMLIFrameElement;
  private destroyed = false;
  private loadSequence = 0;
  private isWidgetReady = false;
  private readyWaiters: Array<{ resolve: () => void; reject: (error: Error) => void }> = [];

  private readonly listeners = {
    ready: new Set<() => void>(),
    play: new Set<() => void>(),
    pause: new Set<() => void>(),
    progress: new Set<(positionMs: number) => void>(),
    finish: new Set<() => void>(),
    error: new Set<(message: string) => void>(),
  };

  constructor(iframe: HTMLIFrameElement) {
    this.iframe = iframe;
  }

  async init(): Promise<void> {
    await this.ensureWidget();
  }

  private async ensureWidget(): Promise<ScWidget> {
    if (this.destroyed) throw new Error("O player foi encerrado.");
    if (this.widget) return this.widget;

    await withTimeout(
      loadApiScript(),
      API_SCRIPT_TIMEOUT_MS,
      "O script do SoundCloud demorou demais para carregar."
    );

    const factory = window.SC?.Widget;
    if (!factory) throw new Error("SoundCloud Widget API indisponível.");

    const widget = factory(this.iframe);
    this.widget = widget;
    this.bindWidgetEvents(widget);
    return widget;
  }

  private bindWidgetEvents(widget: ScWidget): void {
    const events = window.SC?.Widget.Events;
    if (!events) return;

    widget.bind(events.READY, () => {
      this.isWidgetReady = true;
      const waiters = this.readyWaiters;
      this.readyWaiters = [];
      waiters.forEach((waiter) => waiter.resolve());
      this.listeners.ready.forEach((fn) => safeCall(fn));
    });

    widget.bind(events.PLAY, () => {
      this.listeners.play.forEach((fn) => safeCall(fn));
    });

    widget.bind(events.PAUSE, () => {
      this.listeners.pause.forEach((fn) => safeCall(fn));
    });

    widget.bind(events.PLAY_PROGRESS, (payload) => {
      const position =
        (payload as { currentPosition?: number } | undefined)?.currentPosition ?? 0;
      this.listeners.progress.forEach((fn) => safeCall(fn, position));
    });

    widget.bind(events.FINISH, () => {
      this.listeners.finish.forEach((fn) => safeCall(fn));
    });

    // Nem toda versão do widget documenta/dispara ERROR; tratamos como opcional.
    const errorEvent = events.ERROR;
    if (errorEvent) {
      widget.bind(errorEvent, () => {
        this.listeners.error.forEach((fn) =>
          safeCall(fn, "O SoundCloud reportou um erro com esta faixa.")
        );
      });
    }
  }

  /** Aguarda o widget terminar de carregar dentro do iframe (1º uso). */
  private waitForReady(): Promise<void> {
    if (this.isWidgetReady) return Promise.resolve();
    if (this.destroyed) return Promise.reject(new Error("O player foi encerrado."));
    return new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        reject(new Error("O widget do SoundCloud não ficou pronto a tempo."));
      }, LOAD_TIMEOUT_MS);
      this.readyWaiters.push({
        resolve: () => {
          window.clearTimeout(timer);
          resolve();
        },
        reject: (error) => {
          window.clearTimeout(timer);
          reject(error);
        },
      });
    });
  }

  /**
   * widget.load(url, {callback}) — recarrega o MESMO iframe preservando listeners.
   * Cargas concorrentes: a mais antiga é invalidada pela sequência interna.
   */
  async load(url: string): Promise<void> {
    const widget = await this.ensureWidget();
    const sequence = ++this.loadSequence;

    try {
      await this.waitForReady();
    } catch (error) {
      if (sequence !== this.loadSequence) return;
      throw error;
    }
    if (this.destroyed || sequence !== this.loadSequence) return;

    await new Promise<void>((resolve, reject) => {
      let timer = 0;
      let settled = false;

      const conclude = (error?: Error) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        unsubscribeError();
        if (error) reject(error);
        else resolve();
      };

      const unsubscribeError = this.onError(() => {
        conclude(new Error("O SoundCloud indicou que esta faixa não pôde ser carregada."));
      });

      // Rede de segurança: faixa removida/bloqueada pode nunca disparar callback.
      timer = window.setTimeout(() => {
        conclude(new Error("Tempo excedido ao carregar a música no SoundCloud."));
      }, LOAD_TIMEOUT_MS);

      widget.load(url, {
        auto_play: false,
        visual: false,
        show_comments: false,
        sharing: false,
        single_active: true,
        callback: () => conclude(),
      });
    });
  }

  play(): void {
    this.widget?.play();
  }

  pause(): void {
    this.widget?.pause();
  }

  seekTo(milliseconds: number): void {
    this.widget?.seekTo(Math.max(0, Math.round(milliseconds)));
  }

  async getPosition(): Promise<number> {
    const widget = await this.ensureWidget();
    return new Promise<number>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        reject(new Error("getPosition excedeu o tempo limite."));
      }, GETTER_TIMEOUT_MS);
      widget.getPosition((position) => {
        window.clearTimeout(timer);
        resolve(typeof position === "number" && position >= 0 ? position : 0);
      });
    });
  }

  async getDuration(): Promise<number> {
    const widget = await this.ensureWidget();
    return new Promise<number>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        reject(new Error("getDuration excedeu o tempo limite."));
      }, GETTER_TIMEOUT_MS);
      widget.getDuration((duration) => {
        window.clearTimeout(timer);
        resolve(typeof duration === "number" && duration >= 0 ? duration : 0);
      });
    });
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.loadSequence += 1; // invalida promises de load pendentes
    try {
      this.widget?.pause();
    } catch {
      /* noop */
    }
    const events = window.SC?.Widget.Events;
    const widget = this.widget;
    if (widget && events) {
      (
        [
          "READY",
          "PLAY",
          "PAUSE",
          "FINISH",
          "PLAY_PROGRESS",
          "LOAD_PROGRESS",
          "SEEK",
          "OPEN",
          "ERROR",
        ] as const
      ).forEach((key) => {
        const name = events[key];
        if (typeof name === "string") {
          try {
            widget.unbind(name);
          } catch {
            /* noop */
          }
        }
      });
    }
    this.widget = null;
    this.isWidgetReady = false;
    const waiters = this.readyWaiters;
    this.readyWaiters = [];
    waiters.forEach((waiter) => waiter.reject(new Error("O player foi encerrado.")));
    (Object.keys(this.listeners) as Array<keyof typeof this.listeners>).forEach((key) => {
      this.listeners[key].clear();
    });
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