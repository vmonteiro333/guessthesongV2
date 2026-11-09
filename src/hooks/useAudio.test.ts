import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HookHarness } from "../test/hookHarness";
import { useAudio } from "./useAudio";
import { AudioFailure } from "../services/audio/errors";

const mocks = vi.hoisted(() => ({
  auth: {
    handleAuthRedirect: vi.fn(), loadTokens: vi.fn(), startLogin: vi.fn(), getValidAccessToken: vi.fn(),
  },
  player: {
    init: vi.fn(), recover: vi.fn(), onError: vi.fn(), stopNow: vi.fn(), enforceStop: vi.fn(), load: vi.fn(),
    playFromStart: vi.fn(), waitForPlaybackEvidence: vi.fn(), refreshDevice: vi.fn(), fetchWebPlaybackState: vi.fn(),
  },
}));

vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(), ...(await import("../test/hookHarness")).hooks,
}));
vi.mock("../services/audio/spotifyAuth", () => mocks.auth);
vi.mock("../services/audio/SpotifyWebPlayer", () => ({ getSpotifyWebPlayer: () => mocks.player }));

let host: HookHarness<ReturnType<typeof useAudio>>;
let sdkError: (error: AudioFailure) => void;

beforeEach(async () => {
  vi.useFakeTimers(); vi.resetAllMocks();
  vi.stubGlobal("window", { setTimeout, clearTimeout });
  mocks.auth.loadTokens.mockReturnValue({ accessToken: "fake" });
  mocks.auth.getValidAccessToken.mockResolvedValue("fake");
  mocks.auth.handleAuthRedirect.mockResolvedValue(false);
  mocks.player.init.mockResolvedValue(undefined);
  mocks.player.recover.mockResolvedValue(undefined);
  mocks.player.enforceStop.mockResolvedValue(undefined);
  mocks.player.onError.mockImplementation((callback) => { sdkError = callback; return vi.fn(); });
  mocks.player.load.mockResolvedValue(undefined);
  mocks.player.playFromStart.mockResolvedValue(undefined);
  mocks.player.waitForPlaybackEvidence.mockImplementation(async () => performance.now());
  mocks.player.fetchWebPlaybackState.mockResolvedValue({ ok: true, snapshot: { isPlaying: true, progressMs: 50 } });
  host = new HookHarness(useAudio);
  await host.settle();
});
afterEach(() => { host.unmount(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("recuperação de áudio", () => {
  it.each(["load", "play"])("NOT_LOGGED_IN em %s solicita login e encerra buffering", async (operation) => {
    const error = new AudioFailure("auth", "NOT_LOGGED_IN");
    if (operation === "load") mocks.player.load.mockRejectedValueOnce(error);
    else mocks.player.playFromStart.mockRejectedValueOnce(error);
    await expect(operation === "load" ? host.current.loadTrack("url") : host.current.playSnippet(16)).rejects.toBe(error);
    expect(host.current.serviceStatus).toBe("needs_login");
    expect(host.current.failure?.kind).toBe("auth");
    expect(host.current.snippetPhase).toBe("idle");
  });

  it("preserva autenticação inválida no polling sem concluir o trecho", async () => {
    mocks.player.fetchWebPlaybackState.mockResolvedValueOnce({ ok: false, error: new AudioFailure("auth", "NOT_LOGGED_IN") });
    await expect(host.current.playSnippet(16)).rejects.toMatchObject({ kind: "auth" });
    expect(host.current.serviceStatus).toBe("needs_login");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("verifica a sessão antes de preparar a faixa e preserva a causa", async () => {
    mocks.auth.getValidAccessToken.mockRejectedValueOnce(new AudioFailure("auth", "NOT_LOGGED_IN"));
    await expect(host.current.loadTrack("url")).rejects.toMatchObject({ kind: "auth" });
    expect(mocks.player.load).not.toHaveBeenCalled();
    expect(host.current.serviceStatus).toBe("needs_login");
  });

  it("cancela todos os timers do trecho quando o SDK exige reconexão", async () => {
    const playing = host.current.playSnippet(16);
    await host.settle();
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    sdkError(new AudioFailure("auth", "Sessão expirada"));
    await expect(playing).resolves.toBe("stopped");
    expect(host.current.serviceStatus).toBe("needs_login");
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(host.current.snippetPhase).toBe("idle");
  });

  it("falha de rede oferece retry sem login nem áudio automático", async () => {
    mocks.player.playFromStart.mockRejectedValueOnce(new Error("rede"));
    await expect(host.current.playSnippet(16)).rejects.toMatchObject({ kind: "temporary" });
    expect(host.current.serviceStatus).toBe("error");
    await expect(host.current.retry()).resolves.toBe(true);
    expect(host.current.serviceStatus).toBe("ready");
    expect(host.current.failure).toBeNull();
    expect(mocks.auth.startLogin).not.toHaveBeenCalled();
    expect(mocks.player.playFromStart).toHaveBeenCalledTimes(1);
    expect(mocks.player.recover).toHaveBeenCalledTimes(1);
  });

  it("retry não aceita init em cache se a recuperação do device falha", async () => {
    sdkError(new AudioFailure("temporary", "device offline"));
    mocks.player.recover.mockRejectedValueOnce(new AudioFailure("temporary", "transferência recusada", 503));
    await expect(host.current.retry()).resolves.toBe(false);
    expect(host.current.serviceStatus).toBe("error");
    expect(mocks.auth.startLogin).not.toHaveBeenCalled();
    await expect(host.current.retry()).resolves.toBe(true);
    expect(host.current.serviceStatus).toBe("ready");
  });

  it("retry com autenticação realmente inválida continua exigindo reconexão", async () => {
    mocks.player.recover.mockRejectedValueOnce(new AudioFailure("auth", "NOT_LOGGED_IN"));
    await expect(host.current.retry()).resolves.toBe(false);
    expect(host.current.serviceStatus).toBe("needs_login");
    expect(mocks.auth.startLogin).not.toHaveBeenCalled();
  });

  it("ignora erro de um carregamento antigo após stop", async () => {
    let reject!: (reason: unknown) => void;
    mocks.player.load.mockReturnValueOnce(new Promise((_resolve, fail) => { reject = fail; }));
    const loading = host.current.loadTrack("url");
    await host.settle();
    host.current.stopPlayback();
    reject(new AudioFailure("auth", "NOT_LOGGED_IN"));
    await expect(loading).rejects.toMatchObject({ kind: "auth" });
    expect(host.current.serviceStatus).toBe("ready");
  });

  it("retorno OAuth com erro mantém login disponível e não inicializa o player", async () => {
    host.unmount(); mocks.player.init.mockClear();
    mocks.auth.handleAuthRedirect.mockRejectedValueOnce(new Error("Login cancelado"));
    host = new HookHarness(useAudio); await host.settle();
    expect(host.current.serviceStatus).toBe("needs_login");
    expect(host.current.serviceError).toBe("Login cancelado");
    expect(mocks.player.init).not.toHaveBeenCalled();
  });

  it("falha ao iniciar login não gera rejeição não tratada", async () => {
    mocks.auth.startLogin.mockRejectedValueOnce(new Error("Armazenamento bloqueado"));
    await expect(host.current.login()).resolves.toBeUndefined();
    expect(host.current.serviceError).toBe("Armazenamento bloqueado");
  });
});
