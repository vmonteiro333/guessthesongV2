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
const TICK_INTERVAL_MS = 100;
const PRIME_HOLD_MS = 600;
const DEVICE_NAME = "Guess the Song";

interface SpotifySdk {
  Player: new (options: {
    name: string;
    getOAuthToken: (cb: (token: string) => void) => void;
    volume?: number;
  }) => SpotifyWebPlaybackPlayer;
}

let sdkPromise: Promise<SpotifySdk> | null = null;

/** Carrega o Web Playback SDK OFICIAL uma única vez (idempotente). */
function loadSdk(): Promise<SpotifySdk> {
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise<SpotifySdk>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      sdkPromise = null;
      reject(new Error("O SDK do Spotify demorou demais para carregar."));
    }, SDK_READY_TIMEOUT_MS);

    // O SDK chama este callback SEM argumentos; o objeto fica em window.Spotify.
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
 * Player de áudio completo via Web Playback SDK (Spotify Connect + Premium).
 * SINGLETON de vida útil da página. Controle de trechos:
 * - Ticker local (100ms) emite a posição interpolada e re-ancora com
 *   getCurrentState() quando ele traz posição real (> 0).
 * - "Fim de faixa" só é aceito com posição no fim real (position ≈ duration)
 *   ou estado nulo longe de um comando de play — elimina falsos finais
 *   disparados por estados intermediários de buffering.
 * - prime(): pré-bufferiza a faixa em volume 0 no carregamento da rodada,
 *   para o primeiro play do usuário ser imediato e o corte ser preciso.
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

  /** Idempotente: chamadas repetidas compartilham a mesma conexão. */
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

  private handleState(state: SpotifyWebPlaybackState | null): void {
    if (!state) {
      // Estado nulo normalmente significa "fim da faixa/fila" — mas também
      // aparece em transições. Guard: só aceita como fim se estamos longe
      // de um comando de play recente.
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
    this.positionMs = state.position;
    this.snapshotAt = performance.now();
    this.paused = state.paused;

    if (!state.paused) {
      this.wasPlaying = true;   
      const waiters = this.playbackStartWaiters;
      this.playbackStartWaiters = [];
      waiters.forEach((w) => w.resolve());
      this.startTicker();
      this.listeners.play.forEach((fn) => safeCall(fn));
    } else {
      this.stopTicker();
      this.listeners.pause.forEach((fn) => safeCall(fn));
      // Fim de faixa REAL: posição no fim. Estados intermediários de
      // buffering (position ~0 logo após um play) NÃO são fim.
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

  /** Emite progresso e re-ancora com o estado real quando ele traz posição. */
  private tick(): void {
    if (!this.paused) {
      const state = this.getLocalState();
      if (state && !state.paused && state.position > 0) {
        this.positionMs = state.position;
        this.snapshotAt = performance.now();
      }
    }
    this.listeners.progress.forEach((fn) => safeCall(fn, this.currentPosition()));
  }

  private startTicker(): void {
    if (this.tickTimer !== 0) return;
    this.tickTimer = window.setInterval(() => this.tick(), TICK_INTERVAL_MS);
  }

  private stopTicker(): void {
    if (this.tickTimer !== 0) {
      window.clearInterval(this.tickTimer);
      this.tickTimer = 0;
    }
  }

  /** Valida e guarda a faixa da rodada. */
  async load(url: string): Promise<void> {
    if (this.destroyed) throw new Error("O player foi encerrado.");
    const uri = toSpotifyUri(url);
    if (!uri) {
      throw new Error("URL do Spotify inválida (esperado https://open.spotify.com/track/...).");
    }
    this.trackUri = uri;
  }

  /**
   * PRIMING: pré-bufferiza a faixa em volume 0 (best-effort). Chamar logo
   * após load(), no contexto do clique que trocou a música. Com o buffer
   * pronto, o play do usuário começa quase instantâneo e o corte do trecho
   * fica preciso já no primeiro play.
   */
  async prime(): Promise<void> {
    if (this.destroyed || !this.player || !this.deviceId || !this.trackUri) return;
    try {
      await this.player.setVolume(0);
      await this.sendPlayCommand(0, 0);
      await new Promise((r) => setTimeout(r, PRIME_HOLD_MS));
      this.suppressFinishUntil = Date.now() + 4000;
      await this.sendPauseCommand();
    } catch {
      /* priming é best-effort: falha = comportamento antigo (buffer no play) */
    }
    try {
      await this.player.setVolume(1);
    } catch {
      /* noop */
    }
  }

  async playFromStart(): Promise<void> {
    if (!this.player) throw new Error("Player do Spotify não inicializado — recarregue a página.");
    if (!this.trackUri) throw new Error("Nenhuma música carregada.");
    if (!this.deviceId) {
      throw new Error("Device do Spotify desconectado — recarregue a página.");
    }

    try {
      await this.player.activateElement();
    } catch {
      /* navegadores que dispensam o unlock */
    }

    this.playCommandAt = performance.now();
    this.wasPlaying = false;
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
   * Espera evidência de playback não-pausado (evento ou getCurrentState).
   * Retorna a âncora do "zero" do áudio (performance.now correspondente à
   * posição 0). Timeout longo: com buffering, a evidência só chega quando o
   * áudio de fato roda; o corte usa a posição real, então corta assim que
   * detecta que o limite já foi atingido.
   */
  async waitForPlaybackEvidence(timeoutMs: number): Promise<number> {
    const start = performance.now();
    for (;;) {
      if (this.destroyed) throw new Error("O player foi encerrado.");
      const state = this.getLocalState();
      if (state && !state.paused) {
        this.positionMs = state.position;
        this.snapshotAt = performance.now();
        this.paused = false;
        return performance.now() - Math.max(0, state.position);
      }
      if (performance.now() - start >= timeoutMs) {
        // Fallback: assume início agora (enforceStop cobre excessos).
        this.paused = false;
        this.snapshotAt = performance.now();
        this.positionMs = 0;
        return performance.now();
      }
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  /** Garante que o áudio PAROU (pause local pode cair no buffering). */
  async enforceStop(maxMs: number, isCancelled?: () => boolean): Promise<void> {
    const deadline = performance.now() + maxMs;
    let webApiPauses = 0;
    if (this.deviceId) {
      void this.sendPauseCommand().catch(() => {});
      webApiPauses += 1;
    }
    while (performance.now() < deadline) {
      if (isCancelled?.()) return;
      const state = this.getLocalState();
      if (state && state.paused) return;
      if (state && !state.paused) {
        try {
          await this.player?.pause();
        } catch {
          /* noop */
        }
        if (webApiPauses < 3 && this.deviceId) {
          void this.sendPauseCommand().catch(() => {});
          webApiPauses += 1;
        }
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
    const startWaiters = this.playbackStartWaiters;
    this.playbackStartWaiters = [];
    startWaiters.forEach((w) => w.reject(new Error("O player foi encerrado.")));
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