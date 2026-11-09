import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SpotifyWebPlayer } from "./SpotifyWebPlayer";

const TOKEN_URL = "https://accounts.spotify.com/api/token";
const TOKENS_KEY = "gts:spotify:tokens:v2";
const OLD_TOKEN = "fake-access-old";
const NEW_TOKEN = "fake-access-new";
let player: SpotifyWebPlayer;
let storage: Map<string, string>;
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

function tokenResponse(): Response {
  return new Response(JSON.stringify({ access_token: NEW_TOKEN, expires_in: 3600 }), { status: 200 });
}

function authHeaders(): (string | null)[] {
  return fetchMock.mock.calls
    .filter(([url]) => url !== TOKEN_URL)
    .map(([, options]) => new Headers(options?.headers).get("Authorization"));
}

class FakeSdkPlayer {
  private ready?: (event: { device_id: string }) => void;

  addListener(event: string, callback: (event: { device_id: string }) => void): boolean {
    if (event === "ready") this.ready = callback;
    return true;
  }

  async connect(): Promise<boolean> {
    setTimeout(() => this.ready?.({ device_id: "fake-device" }), 0);
    return true;
  }

  async activateElement(): Promise<void> {}
  disconnect(): void {}
}

beforeEach(async () => {
  vi.resetModules();
  storage = new Map([[TOKENS_KEY, JSON.stringify({
    accessToken: OLD_TOKEN, refreshToken: "fake-refresh", expiresAt: Date.now() + 600_000,
  })]]);
  vi.stubGlobal("window", {
    setTimeout,
    clearTimeout,
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, value); },
      removeItem: (key: string) => { storage.delete(key); },
    },
    Spotify: { Player: FakeSdkPlayer },
  });
  // Todas as chamadas ficam no mock, inclusive as não previstas pelo teste.
  fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new Error("Unexpected mock request"));
  vi.stubGlobal("fetch", fetchMock);
  const { SpotifyWebPlayer } = await import("./SpotifyWebPlayer");
  player = new SpotifyWebPlayer();
  await player.init();
  fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
  await player.load("https://open.spotify.com/track/0000000000000000000000");
  fetchMock.mockClear();
});

afterEach(() => {
  player?.destroy();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("recuperação de autenticação do SpotifyWebPlayer", () => {
  it.each([true, false])("indisponibilidade explícita só se aplica à faixa atual (%s)", async (sameTrack) => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      item: { uri: sameTrack ? "spotify:track:0000000000000000000000" : "spotify:track:1111111111111111111111", is_playable: false },
    }), { status: 200 }));
    const result = await player.fetchWebPlaybackState();
    if (sameTrack) expect(result).toMatchObject({ ok: false, error: { kind: "unavailable" } });
    else expect(result.ok).toBe(true);
  });
  it("polling propaga causa de invalid_grant sem mascará-la como falha temporária", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }));
    await expect(player.fetchWebPlaybackState()).resolves.toMatchObject({ ok: false, error: { kind: "auth" } });
    expect(storage.has(TOKENS_KEY)).toBe(false);
  });
  it("play recupera de 401 e repete o mesmo comando com o token novo", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(player.playFromStart()).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1][0]).toBe(TOKEN_URL);
    expect(authHeaders()).toEqual([`Bearer ${OLD_TOKEN}`, `Bearer ${NEW_TOKEN}`]);
    expect(fetchMock.mock.calls[2][0]).toBe(fetchMock.mock.calls[0][0]);
    expect(fetchMock.mock.calls[2][1]?.body).toBe(fetchMock.mock.calls[0][1]?.body);
    expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body))).toEqual({
      uris: ["spotify:track:0000000000000000000000"], position_ms: 0,
    });
  });

  it("consulta de estado recupera de 401 usando o token novo", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({
        is_playing: true, progress_ms: 250,
        item: { name: "Faixa fictícia", duration_ms: 100_000 },
      }), { status: 200 }));
    await expect(player.fetchWebPlaybackState()).resolves.toMatchObject({
      ok: true, snapshot: { isPlaying: true, progressMs: 250, trackName: "Faixa fictícia" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(authHeaders()).toEqual([`Bearer ${OLD_TOKEN}`, `Bearer ${NEW_TOKEN}`]);
  });

  it("play para após um único retry quando o novo token também recebe 401", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(new Response(null, { status: 401 }));
    await expect(player.playFromStart()).rejects.toThrow("Falha ao iniciar a reprodução (401)");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("consulta de estado para após um único retry de 401", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(new Response(null, { status: 401 }));
    await expect(player.fetchWebPlaybackState()).resolves.toMatchObject({ ok: false, error: { kind: "temporary", status: 401 } });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each([
    [403, "O Spotify recusou o comando de tocar"],
    [404, "O device do jogo não está mais ativo"],
    [500, "Falha ao iniciar a reprodução (500)"],
  ])("play preserva tratamento de HTTP %i sem refresh", async (status, message) => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: Number(status) }));
    await expect(player.playFromStart()).rejects.toThrow(String(message));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([403, 404, 500])("consulta preserva tratamento de HTTP %i sem refresh", async (status) => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status }));
    await expect(player.fetchWebPlaybackState()).resolves.toMatchObject({ ok: false, error: { kind: "temporary", status } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retry de 429 na consulta não força renovação de token", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 429, headers: { "Retry-After": "1" } }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const result = player.fetchWebPlaybackState();
    await vi.runAllTimersAsync();
    await expect(result).resolves.toEqual({ ok: true, snapshot: null });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(authHeaders()).toEqual([`Bearer ${OLD_TOKEN}`, `Bearer ${OLD_TOKEN}`]);
  });

  it("falha temporária no refresh interrompe play e permite nova tentativa", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 500 }));
    await expect(player.playFromStart()).rejects.toThrow("HTTP 500");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(storage.has(TOKENS_KEY)).toBe(true);
    fetchMock.mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(player.playFromStart()).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(authHeaders()).toEqual([`Bearer ${OLD_TOKEN}`, `Bearer ${NEW_TOKEN}`]);
  });

  it("invalid_grant durante recuperação de play exige novo login", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }));
    await expect(player.playFromStart()).rejects.toThrow("NOT_LOGGED_IN");
    expect(storage.has(TOKENS_KEY)).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("falha temporária no refresh da consulta preserva a sessão", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 500 }));
    await expect(player.fetchWebPlaybackState()).resolves.toMatchObject({ ok: false, error: { kind: "temporary" } });
    expect(storage.has(TOKENS_KEY)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("401 atrasado da consulta aproveita a renovação já feita pelo play", async () => {
    let resolveState!: (response: Response) => void;
    const oldState = new Promise<Response>((resolve) => { resolveState = resolve; });
    fetchMock.mockImplementation(async (url, options) => {
      if (url === TOKEN_URL) return tokenResponse();
      const token = new Headers(options?.headers).get("Authorization");
      if (String(url).includes("additional_types") && token === `Bearer ${OLD_TOKEN}`) return oldState;
      return new Response(null, { status: token === `Bearer ${OLD_TOKEN}` ? 401 : 204 });
    });
    const stateResult = player.fetchWebPlaybackState();
    await player.playFromStart();
    resolveState(new Response(null, { status: 401 }));
    await expect(stateResult).resolves.toEqual({ ok: true, snapshot: null });
    expect(fetchMock.mock.calls.filter(([url]) => url === TOKEN_URL)).toHaveLength(1);
    expect(authHeaders()).toEqual([
      `Bearer ${OLD_TOKEN}`, `Bearer ${OLD_TOKEN}`, `Bearer ${NEW_TOKEN}`, `Bearer ${NEW_TOKEN}`,
    ]);
  });
});
