import type {
  SpotifyWebPlaybackPlayer,
  SpotifyWebPlaybackState,
} from "../../types/spotifySdk";
import type { AudioPlayer, Unsubscribe } from "./types";
import { toSpotifyUri } from "../../utils/spotifyUrl";
import { getValidAccessToken, isNotLoggedInError } from "./spotifyAuth";

const SDK_SCRIPT_URL = "https://sdk.scdn.co/spotify-player.js";
const SDK_READY_TIMEOUT_MS = 15_000;
const CONNECT_TIMEOUT_MS = 15_000;
const TICK_INTERVAL_MS = 100;
const DEVICE_NAME = "Guess the Song";

let sdkPromise: Promise<{
  Player: new (options: {
    name: string;
    getOAuthToken: (cb: (token: string) => void) => void;
    volume?: number;
  }) => SpotifyWebPlaybackPlayer;
} | null> | null = null;

function loadSdk(): Promise<NonNullable<typeof sdkPromise>> {
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      sdkPromise = null;
      reject(new Error("O SDK do Spotify demorou demais para carregar."));
    }, SDK_READY_TIMEOUT_MS);
    window.onSpotifyWebPlaybackSDKReady = (Spotify) => {
      window.clearTimeout(timer);
      resolve(Spotify);
    };
    if (window.Spotify) {
      window.clearTimeout(timer);
      resolve(window.Spotify);
      return;
    }
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
 * Player de áudio completo via Web Playback SDK (Spotify Connect + Premium).
 * - Posição monitorada LOCALMENTE (snapshot do estado + relógio), então o
 *   corte do trecho é preciso (~100ms), sem latência de iframe.
 * - playFromStart usa a Web API (PUT /me/player/play, position_ms=0): o
 *   reinício do zero é comandado pelo servidor, não depende de seek.
 */
export class SpotifyWebPlayer implements AudioPlayer {
  private player: SpotifyWebPlaybackPlayer | null = null;
  private deviceId: string | null = null;
  private trackUri: string | null = null;
  private destroyed = false;

  private positionMs = 0;
  private durationMs = 0;
  private paused = true;
  private snapshotAt = 0;
  private tickTimer = 0;
  private seenPlayingAfterPlay = false;
  private suppressFinishUntil = 0;
  private wasPlaying = false;

  private readyWaiters: Array<{ resolve: () => void; reject: (e: Error) => void }> = [];
  private playbackStartWaiters: Array<{ resolve: () => void; reject: (e: Error) => void }> = [];

  private readonly listeners = {
    ready: new Set<() => void>(),
    play: new Set<() => void>(),
    pause: new Set<() => void>(),
    progress: new Set<(positionMs: number) => void>(),
    finish: new Set<() => void>(),
    error: new Set<(message: string) => void>(),
  };

  async init(): Promise<void> {
    if (this.destroyed) throw new Error("O player foi encerrado.");
    if (this.player) return;

    const Spotify = await loadSdk();
    if (this.destroyed || !Spotify?.Player) return;

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

    const connected = await player.connect();
    if (this.destroyed) return;
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

  private handleState(state: SpotifyWebPlaybackState | null): void {
    if (!state) {
      if (this.wasPlaying) {
        this.wasPlaying = false;
        this.paused = true;
        this.stopTicker();
        this.listeners.finish.forEach((fn) => safeCall(fn));
      }
      return;
    }
    if (state.duration > 0) this.durationMs = state.duration;
    this.positionMs = state.position;
    this.snapshotAt = performance.now();
    this.paused = state.paused;

    if (!state.paused) {
      this.wasPlaying = true;
      this.seenPlayingAfterPlay = true;
      const waiters = this.playbackStartWaiters;
      this.playbackStartWaiters = [];
      waiters.forEach((w) => w.resolve());
      this.startTicker();
      this.listeners.play.forEach((fn) => safeCall(fn));
    } else {
      this.stopTicker();
      this.listeners.pause.forEach((fn) => safeCall(fn));
      const selfPaused = Date.now() < this.suppressFinishUntil;
      if (!selfPaused && this.wasPlaying && state.position <= 60 && this.durationMs > 30_000) {
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

  private startTicker(): void {
    if (this.tickTimer !== 0) return;
    this.tickTimer = window.setInterval(() => {
      this.listeners.progress.forEach((fn) => safeCall(fn, this.currentPosition()));
    }, TICK_INTERVAL_MS);
  }

  private stopTicker(): void {
    if (this.tickTimer !== 0) {
      window.clearInterval(this.tickTimer);
      this.tickTimer = 0;
    }
  }

  /** Valida e guarda a faixa da rodada (sem rede — Connect não tem preload). */
  async load(url: string): Promise<void> {
    if (this.destroyed) throw new Error("O player foi encerrado.");
    const uri = toSpotifyUri(url);
    if (!uri) {
      throw new Error("URL do Spotify inválida (esperado https://open.spotify.com/track/...).");
    }
    this.trackUri = uri;
  }

  async playFromStart(): Promise<void> {
    if (this.destroyed) throw new Error("O player foi encerrado.");
    if (!this.player) throw new Error("Player do Spotify não inicializado.");
    if (!this.trackUri) throw new Error("Nenhuma música carregada.");
    if (!this.deviceId) {
      throw new Error("Device do Spotify desconectado — recarregue a página.");
    }

    // Primeiro comando do clique: desbloqueia o áudio do navegador.
    try {
      await this.player.activateElement();
    } catch {
      /* navegadores que dispensam o unlock */
    }

    this.seenPlayingAfterPlay = false;
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

  /** Resolve quando o Connect COMEÇA a tocar de fato (após o buffering). */
  async waitForPlaybackStart(timeoutMs: number): Promise<void> {
    if (this.seenPlayingAfterPlay) return;
    await new Promise<void>((resolve) => {
      const timer = window.setTimeout(() => resolve(), timeoutMs);
      this.playbackStartWaiters.push({
        resolve: () => {
          window.clearTimeout(timer);
          resolve();
        },
        reject: () => {
          window.clearTimeout(timer);
          resolve();
        },
      });
    });
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
    if (this.destroyed) return;
    this.destroyed = true;
    this.stopTicker();
    try {
      this.player?.disconnect();
    } catch {
      /* noop */
    }
    const readyWaiters = this.readyWaiters;
    this.readyWaiters = [];
    readyWaiters.forEach((w) => w.reject(new Error("O player foi encerrado.")));
    const startWaiters = this.playbackStartWaiters;
    this.playbackStartWaiters = [];
    startWaiters.forEach((w) => w.reject(new Error("O player foi encerrado.")));
    (Object.keys(this.listeners) as Array<keyof typeof this.listeners>).forEach((key) => {
      this.listeners[key].clear();
    });
    this.player = null;
    this.deviceId = null;
  }

  private failConnection(message: string): void {
    const waiters = this.readyWaiters;
    this.readyWaiters = [];
    waiters.forEach((w) => w.reject(new Error(message)));
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