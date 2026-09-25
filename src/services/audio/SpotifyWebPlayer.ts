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

export interface WebPlaybackSnapshot {
  isPlaying: boolean;
  progressMs: number | null;
  durationMs: number;
  coverUrl: string | null;
  trackName: string | null;
  artistName: string | null;
}

export type WebPollResult =
  | { ok: true; snapshot: WebPlaybackSnapshot | null }
  | { ok: false };

/**
 * Player via Web Playback SDK (Premium). SINGLETON.
 *
 * v6 — "controle 100% via Web API": o canal local do SDK (eventos e
 * getCurrentState) mostrou-se não confiável em alguns ambientes (estado
 * nunca chega, com o áudio tocando). Então:
 * - SDK: usado APENAS para criar/manter o device (device_id);
 * - Play/Pause: Web API (PUT /me/player/play|pause) — comprovado;
 * - Estado/posição: POLLING de GET /me/player — fonte única de verdade;
 * - Corte: dispara quando o progresso reportado atinge o limite da etapa
 *   (ou âncora de relógio com folga, como segurança).
 */
export class SpotifyWebPlayer implements AudioPlayer {
  private player: SpotifyWebPlaybackPlayer | null = null;
  private deviceId: string | null = null;
  private trackUri: string | null = null;
  private destroyed = false;
  private connectPromise: Promise<void> | null = null;
  private stopEpoch = 0;

  private positionMs = 0;
  private durationMs = 0;
  private paused = true;
  private snapshotAt = 0;

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

  /** Cache best-effort a partir dos eventos (quando o canal local funciona). */
  private handleState(state: SpotifyWebPlaybackState | null): void {
    if (!state) return;
    if (state.duration > 0) this.durationMs = state.duration;
    this.positionMs = state.position;
    this.snapshotAt = performance.now();
    this.paused = state.paused;
    this.listeners[state.paused ? "pause" : "play"].forEach((fn) => safeCall(fn));
    this.listeners.progress.forEach((fn) => safeCall(fn, this.currentPosition()));
  }

  private currentPosition(): number {
    if (this.paused) return this.positionMs;
    const interpolated = this.positionMs + (performance.now() - this.snapshotAt);
    return this.durationMs > 0 ? Math.min(interpolated, this.durationMs) : interpolated;
  }

  async load(url: string): Promise<void> {
    if (this.destroyed) throw new Error("O player foi encerrado.");
    const uri = toSpotifyUri(url);
    if (!uri) {
      throw new Error("URL do Spotify inválida (esperado https://open.spotify.com/track/...).");
    }
    // Silencia qualquer resíduo antes de trocar a faixa (Web API).
    void this.sendPauseCommand().catch(() => {});
    this.trackUri = uri;
    this.positionMs = 0;
    this.paused = true;
    this.snapshotAt = performance.now();
  }

  async playFromStart(): Promise<void> {
    if (!this.player) throw new Error("Player do Spotify não inicializado — recarregue a página.");
    if (!this.trackUri) throw new Error("Nenhuma música carregada.");
    if (!this.deviceId) {
      throw new Error("Device do Spotify desconectado — recarregue a página.");
    }

    // SÍNCRONO: cancela enforceStops de cortes anteriores.
    this.stopEpoch += 1;

    // Desbloqueia o áudio do navegador (autoplay policy).
    try {
      await this.player.activateElement();
    } catch {
      /* navegadores que dispensam o unlock */
    }

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
   * Estado de playback via Web API. Distingue "nada tocando" (ok, null) de
   * erro (ok:false — inclui 403/404/rede). 401 força renovação de token.
   */
  async fetchWebPlaybackState(): Promise<WebPollResult> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (this.destroyed) return { ok: false };
      try {
        const token = await getValidAccessToken(attempt > 0);
        const res = await fetch(
          "https://api.spotify.com/v1/me/player?additional_types=track",
          { headers: { Authorization: "Bearer " + token } }
        );
        if (res.status === 204) return { ok: true, snapshot: null };
        if (res.status === 401) continue;
        if (res.status === 429) {
          const wait = Number(res.headers.get("Retry-After") ?? "1");
          await new Promise((r) => setTimeout(r, Math.min(5, Math.max(1, wait)) * 1000));
          continue;
        }
        if (!res.ok) return { ok: false };
        const data = (await res.json()) as {
          is_playing?: boolean;
          progress_ms?: number;
          item?: {
            name?: string;
            duration_ms?: number;
            album?: { images?: { url: string }[] };
            artists?: { name: string }[];
          } | null;
        };
        if (!data.item) return { ok: true, snapshot: null };
        const snapshot: WebPlaybackSnapshot = {
          isPlaying: data.is_playing === true,
          progressMs: typeof data.progress_ms === "number" ? data.progress_ms : null,
          durationMs: typeof data.item.duration_ms === "number" ? data.item.duration_ms : 0,
          coverUrl: data.item.album?.images?.[0]?.url ?? null,
          trackName: data.item.name ?? null,
          artistName:
            data.item.artists?.map((a) => a.name).filter(Boolean).join(", ") || null,
        };
        if (snapshot.durationMs > 0) this.durationMs = snapshot.durationMs;
        return { ok: true, snapshot };
      } catch {
        return { ok: false };
      }
    }
    return { ok: false };
  }

    /**
   * Espera EVIDÊNCIA de áudio real: UMA amostra com progresso > 0 (buffering
   * reporta pos=0; qualquer pos>0 significa áudio já passado daquele ponto).
   * maxReasonablePos descarta amostras "vivas" de um playback anterior.
   * Retorna a âncora do zero do áudio.
   */
    async waitForPlaybackEvidence(
      timeoutMs: number,
      maxReasonablePos: number,
      isCancelled?: () => boolean
    ): Promise<number> {
      const start = performance.now();
      for (;;) {
        if (this.destroyed) throw new Error("O player foi encerrado.");
        if (isCancelled?.()) throw new Error("cancelled");
        const poll = await this.fetchWebPlaybackState();
        if (
          poll.ok &&
          poll.snapshot &&
          poll.snapshot.isPlaying &&
          poll.snapshot.progressMs !== null
        ) {
          const pos = poll.snapshot.progressMs;
          if (pos > 0 && pos <= maxReasonablePos) {
            this.positionMs = pos;
            this.snapshotAt = performance.now();
            this.paused = false;
            return performance.now() - pos;
          }
        }
        if (performance.now() - start >= timeoutMs) {
          throw new Error("O Spotify não começou a tocar a tempo. Tente ouvir novamente.");
        }
        await new Promise((r) => setTimeout(r, 200));
      }
    }

  /**
   * GARANTIDOR de parada via Web API: envia pause, confere o estado e repete
   * até is_playing=false (ou cancelado por época / prazo esgotado).
   */
  async enforceStop(maxMs: number, isCancelled?: () => boolean): Promise<void> {
    const myEpoch = this.stopEpoch;
    const cancelled = (): boolean => this.stopEpoch !== myEpoch || (isCancelled?.() ?? false);
    const deadline = performance.now() + maxMs;
    let lastPauseAt = 0;
    let nullCount = 0;
    try {
      this.player?.pause();
    } catch {
      /* noop */
    }
    while (performance.now() < deadline) {
      if (cancelled()) return;
      if (performance.now() - lastPauseAt >= 700) {
        try {
          await this.sendPauseCommand();
        } catch {
          /* rede: tenta de novo no próximo ciclo */
        }
        lastPauseAt = performance.now();
      }
      const poll = await this.fetchWebPlaybackState();
      if (cancelled()) return;
      if (poll.ok) {
        if (poll.snapshot && !poll.snapshot.isPlaying) return; // confirmado
        if (poll.snapshot === null) {
          nullCount += 1;
          if (nullCount >= 2) return; // 2x "nada tocando": aceita
        } else {
          nullCount = 0;
        }
      }
      await new Promise((r) => setTimeout(r, 300));
    }
  }
    /** Corte imediato: pause local + Web API em paralelo. */
    stopNow(): void {
      try {
        this.player?.pause();
      } catch {
        /* noop */
      }
      void this.sendPauseCommand().catch(() => {});
    }
  
    /** Reativa este device no Connect (corrige device "zumbi"/travado). */
    async refreshDevice(): Promise<boolean> {
      if (!this.deviceId) return false;
      try {
        const token = await getValidAccessToken();
        const res = await fetch("https://api.spotify.com/v1/me/player", {
          method: "PUT",
          headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
          body: JSON.stringify({ device_ids: [this.deviceId], play: false }),
        });
        return res.ok || res.status === 204;
      } catch {
        return false;
      }
    }

  play(): void {
    this.player?.resume().catch(() => {});
    void this.sendPlayCommand(0, 0).catch(() => {});
  }

  pause(): void {
    this.player?.pause().catch(() => {});
    void this.sendPauseCommand().catch(() => {});
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