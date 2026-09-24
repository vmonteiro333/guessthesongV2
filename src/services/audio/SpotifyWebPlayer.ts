import type {
  SpotifyWebPlaybackPlayer,
  SpotifyWebPlaybackState,
} from "../../types/spotify";
import type { AudioPlayer, Unsubscribe } from "./types";
import { toSpotifyUri } from "../../utils/spotifyUrl";
import { getValidAccessToken, isNotLoggedInError } from "./spotifyAuth";

const SDK_SCRIPT_URL = "https://sdk.scdn.co/spotify-player.js";
const SDK_READY_TIMEOUT_MS = 15_000;
const CONNECT_TIMEOUT_MS = 15_000;
const DEVICE_NAME = "Guess the Song";

interface SpotifySdk {
  Player: new (options: {
    name: string;
    getOAuthToken: (cb: (token: string) => void) => void;
    volume?: number;
  }) => SpotifyWebPlaybackPlayer;
}

let sdkPromise: Promise<SpotifySdk> | null = null;

function loadSdk(): Promise<SpotifySdk> {
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise<SpotifySdk>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      sdkPromise = null;
      reject(new Error("O SDK do Spotify demorou demais para carregar."));
    }, SDK_READY_TIMEOUT_MS);

    window.onSpotifyWebPlaybackSDKReady = () => {
      window.clearTimeout(timer);
      if (window.Spotify?.Player) {
        resolve(window.Spotify);
      } else {
        sdkPromise = null;
        reject(new Error("SDK do Spotify carregado sem a API esperada."));
      }
    };

    if (window.Spotify) {
      window.clearTimeout(timer);
      resolve(window.Spotify);
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${SDK_SCRIPT_URL}"]`
    );
    if (existing) return;

    const script = document.createElement("script");
    script.src = SDK_SCRIPT_URL;
    script.async = true;
    script.addEventListener("error", () => {
      window.clearTimeout(timer);
      sdkPromise = null;
      reject(new Error("Falha de rede ao carregar o SDK do Spotify."));
    });
    document.head.appendChild(script);
  });
  return sdkPromise;
}

function safeCall<A extends unknown[]>(fn: (...args: A) => void, ...args: A): void {
  try {
    fn(...args);
  } catch (error) {
    console.error("[SpotifyWebPlayer] listener falhou:", error);
  }
}

/**
 * Player via Web Playback SDK (Premium). SINGLETON.
 *
 * v5 — "corte no áudio real":
 * - Evidência de reprodução = posição AVANÇANDO entre duas amostras (eventos
 *   + polling). Snapshot otimista congelado (pausado=false, pos=0) é ignorado.
 * - Âncora do corte = (agora − posição) na evidência ⇒ o corte conta TEMPO DE
 *   ÁUDIO: buffering atrasa o trecho sem consumi-lo; o pause SEMPRE cai com
 *   áudio fluindo, então é honrado pelo Connect.
 * - enforceStop NUNCA desiste cedo: repete pause local + Web API até o estado
 *   local confirmar pausa (ou cancelado por época / esgotar o prazo).
 */
export class SpotifyWebPlayer implements AudioPlayer {
  private player: SpotifyWebPlaybackPlayer | null = null;
  private deviceId: string | null = null;
  private trackUri: string | null = null;
  private destroyed = false;
  private connectPromise: Promise<void> | null = null;

  private positionMs = 0;
  private durationMs = 0;
  private paused = true;
  private snapshotAt = 0;
  private tickTimer = 0;
  private suppressFinishUntil = 0;
  private wasPlaying = false;
  private playCommandAt = 0;
  private stopEpoch = 0;

  /** Detector de avanço: última amostra (posição, instante). */
  private lastSample: { pos: number; at: number } | null = null;
  /** Âncora do zero do áudio quando a evidência é encontrada (ou null). */
  private evidenceAnchor: number | null = null;

  private readyWaiters: Array<{ resolve: () => void; reject: (e: Error) => void }> = [];

  private readonly listeners = {
    ready: new Set<() => void>(),
    play: new Set<() => void>(),
    pause: new Set<() => void>(),
    progress: new Set<(positionMs: number) => void>(),
    finish: new Set<() => void>(),
    error: new Set<(message: string) => void>(),
  };

  init(): Promise<void> {
    if (!this.connectPromise) {
      this.connectPromise = this.doInit().catch((error) => {
        this.connectPromise = null;
        throw error;
      });
    }
    return this.connectPromise;
  }

  private async doInit(): Promise<void> {
    this.destroyed = false;
    const Spotify = await loadSdk();
    if (!Spotify?.Player) {
      throw new Error("SDK do Spotify carregado de forma inválida.");
    }

    if (!this.player) {
      const player = new Spotify.Player({
        name: DEVICE_NAME,
        getOAuthToken: (cb) => {
          getValidAccessToken()
            .then(cb)
            .catch((error) => {
              if (isNotLoggedInError(error)) {
                this.failConnection("Sessão do Spotify expirada — conecte-se novamente.");
              } else {
                this.emitError(
                  error instanceof Error ? error.message : "Falha ao obter o token do Spotify."
                );
              }
            });
        },
        volume: 1,
      });
      this.player = player;

      player.addListener("ready", ({ device_id }) => {
        this.deviceId = device_id;
        const waiters = this.readyWaiters;
        this.readyWaiters = [];
        waiters.forEach((w) => w.resolve());
        this.listeners.ready.forEach((fn) => safeCall(fn));
      });
      player.addListener("player_state_changed", (state) => this.handleState(state));
      player.addListener("initialization_error", ({ message }) =>
        this.failConnection("Falha ao iniciar o player do Spotify: " + message)
      );
      player.addListener("authentication_error", ({ message }) =>
        this.failConnection("Autenticação do Spotify falhou (" + message + "). Conecte-se novamente.")
      );
      player.addListener("account_error", () =>
        this.failConnection("Esta conta não é Premium — o áudio completo exige Spotify Premium.")
      );
      player.addListener("playback_error", ({ message }) =>
        this.emitError("Erro de reprodução do Spotify: " + message)
      );
    }

    if (this.deviceId) return;

    const player = this.player;
    const connected = await player.connect();
    if (!connected) throw new Error("Não foi possível conectar o device do Spotify.");

    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(
        () => reject(new Error("O Spotify não confirmou a conexão do device a tempo.")),
        CONNECT_TIMEOUT_MS
      );
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

  private getLocalState(): SpotifyWebPlaybackState | null {
    try {
      return this.player?.getCurrentState() ?? null;
    } catch {
      return null;
    }
  }

  /** Alimenta o detector de avanço e o relógio de posição. */
  private ingestPlaybackSample(pos: number, at: number): void {
    const last = this.lastSample;
    if (
      this.evidenceAnchor === null &&
      last !== null &&
      pos > last.pos &&
      at - last.at >= 150
    ) {
      this.evidenceAnchor = at - pos;
    }
    this.lastSample = { pos, at };
    this.positionMs = pos;
    this.snapshotAt = at;
    this.paused = false;
  }

  private handleState(state: SpotifyWebPlaybackState | null): void {
    if (!state) {
      const sinceCommand = performance.now() - this.playCommandAt;
      if (this.wasPlaying && sinceCommand > 3000) {
        this.wasPlaying = false;
        this.paused = true;
        this.stopTicker();
        this.listeners.finish.forEach((fn) => safeCall(fn));
      }
      return;
    }
    if (state.duration > 0) this.durationMs = state.duration;

    if (!state.paused) {
      this.wasPlaying = true;
      this.ingestPlaybackSample(state.position, performance.now());
      this.startTicker();
      this.listeners.play.forEach((fn) => safeCall(fn));
    } else {
      // Estado pausado: reseta o detector (para o próximo play não parear
      // com amostras velhas) e congela o relógio de posição.
      this.lastSample = null;
      this.positionMs = state.position;
      this.snapshotAt = performance.now();
      this.paused = true;
      this.stopTicker();
      this.listeners.pause.forEach((fn) => safeCall(fn));
      const selfPaused = Date.now() < this.suppressFinishUntil;
      const nearEnd = this.durationMs > 0 && state.position >= this.durationMs - 1000;
      if (!selfPaused && this.wasPlaying && nearEnd) {
        this.wasPlaying = false;
        this.listeners.finish.forEach((fn) => safeCall(fn));
      }
    }
    this.listeners.progress.forEach((fn) => safeCall(fn, this.currentPosition()));
  }

  private currentPosition(): number {
    if (this.paused) return this.positionMs;
    const interpolated = this.positionMs + (performance.now() - this.snapshotAt);
    return this.durationMs > 0 ? Math.min(interpolated, this.durationMs) : interpolated;
  }

  private tick(): void {
    if (!this.paused) {
      const state = this.getLocalState();
      if (state && !state.paused) {
        this.ingestPlaybackSample(state.position, performance.now());
      }
    }
    this.listeners.progress.forEach((fn) => safeCall(fn, this.currentPosition()));
  }

  private startTicker(): void {
    if (this.tickTimer !== 0) return;
    this.tickTimer = window.setInterval(() => this.tick(), 100);
  }

  private stopTicker(): void {
    if (this.tickTimer !== 0) {
      window.clearInterval(this.tickTimer);
      this.tickTimer = 0;
    }
  }

  async load(url: string): Promise<void> {
    if (this.destroyed) throw new Error("O player foi encerrado.");
    const uri = toSpotifyUri(url);
    if (!uri) {
      throw new Error("URL do Spotify inválida (esperado https://open.spotify.com/track/...).");
    }
    if (!this.paused) {
      this.suppressFinishUntil = Date.now() + 2500;
      try {
        await this.player?.pause();
      } catch {
        /* noop */
      }
      void this.sendPauseCommand().catch(() => {});
    }
    this.trackUri = uri;
    this.positionMs = 0;
    this.paused = true;
    this.snapshotAt = performance.now();
    this.wasPlaying = false;
    this.lastSample = null;
    this.evidenceAnchor = null;
  }

  async playFromStart(): Promise<void> {
    if (!this.player) throw new Error("Player do Spotify não inicializado — recarregue a página.");
    if (!this.trackUri) throw new Error("Nenhuma música carregada.");
    if (!this.deviceId) {
      throw new Error("Device do Spotify desconectado — recarregue a página.");
    }

    // SÍNCRONO, antes de qualquer await: cancela enforceStops antigos.
    this.stopEpoch += 1;

    try {
      await this.player.activateElement();
    } catch {
      /* navegadores que dispensam o unlock */
    }

    this.playCommandAt = performance.now();
    this.wasPlaying = false;
    this.lastSample = null;
    this.evidenceAnchor = null;
    this.positionMs = 0;
    this.snapshotAt = performance.now();
    this.paused = true;

    await this.sendPlayCommand(0, 0);
  }

  private async sendPlayCommand(positionMs: number, attempt: number): Promise<void> {
    const token = await getValidAccessToken();
    const res = await fetch(
      "https://api.spotify.com/v1/me/player/play?device_id=" +
        encodeURIComponent(this.deviceId ?? ""),
      {
        method: "PUT",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ uris: [this.trackUri], position_ms: positionMs }),
      }
    );
    if (res.status === 401 && attempt === 0) {
      await this.sendPlayCommand(positionMs, attempt + 1);
      return;
    }
    if (res.status === 403) {
      throw new Error("O Spotify recusou o comando de tocar (verifique Premium e os escopos do app).");
    }
    if (res.status === 404) {
      throw new Error("O device do jogo não está mais ativo — recarregue a página.");
    }
    if (!res.ok) {
      throw new Error("Falha ao iniciar a reprodução (" + res.status + ").");
    }
  }

  private async sendPauseCommand(): Promise<void> {
    if (!this.deviceId) return;
    const token = await getValidAccessToken();
    await fetch(
      "https://api.spotify.com/v1/me/player/pause?device_id=" +
        encodeURIComponent(this.deviceId),
      { method: "PUT", headers: { Authorization: "Bearer " + token } }
    );
  }

  /**
   * Espera EVIDÊNCIA DE ÁUDIO REAL (posição avançando). Retorna a âncora do
   * zero do áudio. O cronômetro do corte só começa daí — buffering não conta.
   */
  async waitForPlaybackEvidence(timeoutMs: number): Promise<number> {
    const start = performance.now();
    this.lastSample = null;
    this.evidenceAnchor = null;
    for (;;) {
      if (this.destroyed) throw new Error("O player foi encerrado.");
      const state = this.getLocalState();
      if (state && !state.paused) {
        this.ingestPlaybackSample(state.position, performance.now());
      }
      if (this.evidenceAnchor !== null) return this.evidenceAnchor;
      if (performance.now() - start >= timeoutMs) {
        throw new Error("O Spotify não começou a tocar a tempo. Tente ouvir novamente.");
      }
      await new Promise((r) => setTimeout(r, 120));
    }
  }

  /**
   * GARANTIDOR: repete pause até o estado local CONFIRMAR pausa. Estado nulo
   * NÃO encerra (pode ser buffering): mantém pause via Web API a cada ~1,5s
   * até o prazo — o pause que pegar o áudio fluindo será honrado.
   */
  async enforceStop(maxMs: number, isCancelled?: () => boolean): Promise<void> {
    const myEpoch = this.stopEpoch;
    const cancelled = (): boolean => this.stopEpoch !== myEpoch || (isCancelled?.() ?? false);
    const deadline = performance.now() + maxMs;
    let lastWebApiPause = 0;
    while (performance.now() < deadline) {
      if (cancelled()) return;
      const state = this.getLocalState();
      if (state && state.paused) return; // confirmado: parado
      if (state && !state.paused) {
        try {
          await this.player?.pause();
        } catch {
          /* noop */
        }
      }
      if (cancelled()) return;
      if (this.deviceId && performance.now() - lastWebApiPause > 1500) {
        void this.sendPauseCommand().catch(() => {});
        lastWebApiPause = performance.now();
      }
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  play(): void {
    this.player?.resume().catch(() => {});
  }

  pause(): void {
    this.suppressFinishUntil = Date.now() + 2500;
    this.player?.pause().catch(() => {});
  }

  seekTo(milliseconds: number): void {
    this.player?.seek(Math.max(0, Math.round(milliseconds))).catch(() => {});
  }

  async getPosition(): Promise<number> {
    return this.currentPosition();
  }

  async getDuration(): Promise<number> {
    return this.durationMs;
  }

  destroy(): void {
    this.stopTicker();
    try {
      this.player?.disconnect();
    } catch {
      /* noop */
    }
    const readyWaiters = this.readyWaiters;
    this.readyWaiters = [];
    readyWaiters.forEach((w) => w.reject(new Error("O player foi encerrado.")));
    this.player = null;
    this.deviceId = null;
    this.trackUri = null;
    this.connectPromise = null;
    this.destroyed = true;
  }

  private failConnection(message: string): void {
    const waiters = this.readyWaiters;
    this.readyWaiters = [];
    waiters.forEach((w) => w.reject(new Error(message)));
    this.connectPromise = null;
    this.emitError(message);
  }

  private emitError(message: string): void {
    this.listeners.error.forEach((fn) => safeCall(fn, message));
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

// ---- Singleton de vida útil da página ----
let singleton: SpotifyWebPlayer | null = null;

export function getSpotifyWebPlayer(): SpotifyWebPlayer {
  if (!singleton) singleton = new SpotifyWebPlayer();
  return singleton;
}