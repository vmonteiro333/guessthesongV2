import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StoredTokens } from "./spotifyAuth";

const TOKENS_KEY = "gts:spotify:tokens:v2";
const NOW = 1_800_000_000_000;
const original: StoredTokens = {
  accessToken: "fake-access-old",
  refreshToken: "fake-refresh-old",
  expiresAt: NOW + 60_000,
};
let storage: Map<string, string>;
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
let auth: typeof import("./spotifyAuth");

function store(tokens: StoredTokens = original): void {
  storage.set(TOKENS_KEY, JSON.stringify(tokens));
}

function response(status = 200, data: unknown = {
  access_token: "fake-access-new",
  expires_in: 3600,
}): Response {
  return new Response(JSON.stringify(data), { status });
}

function deferredResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(async () => {
  vi.resetModules();
  vi.spyOn(Date, "now").mockReturnValue(NOW);
  storage = new Map();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, value); },
      removeItem: (key: string) => { storage.delete(key); },
    },
  });
  fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new Error("Unexpected mock request"));
  vi.stubGlobal("fetch", fetchMock);
  auth = await import("./spotifyAuth");
  store();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("renovação de tokens Spotify", () => {
  it("reutiliza token válido sem fazer refresh", async () => {
    await expect(auth.getValidAccessToken()).resolves.toBe(original.accessToken);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("renova token válido quando force=true e preserva a margem de 60 segundos", async () => {
    fetchMock.mockResolvedValueOnce(response());
    await expect(auth.getValidAccessToken(true)).resolves.toBe("fake-access-new");
    expect(auth.loadTokens()?.expiresAt).toBe(NOW + 3_540_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://accounts.spotify.com/api/token");
    expect(options?.method).toBe("POST");
    const body = new URLSearchParams(String(options?.body));
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe(original.refreshToken);
    expect(body.has("client_secret")).toBe(false);
  });

  it("renova ao atingir a expiração armazenada", async () => {
    store({ ...original, expiresAt: NOW });
    fetchMock.mockResolvedValueOnce(response());
    await expect(auth.getValidAccessToken()).resolves.toBe("fake-access-new");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("três chamadas simultâneas compartilham a mesma Promise e um único refresh", async () => {
    store({ ...original, expiresAt: NOW - 1 });
    const pending = deferredResponse();
    fetchMock.mockReturnValueOnce(pending.promise);
    const first = auth.getValidAccessToken();
    const second = auth.getValidAccessToken();
    const third = auth.getValidAccessToken(true);
    expect(second).toBe(first);
    expect(third).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    pending.resolve(response());
    await expect(Promise.all([first, second, third])).resolves.toEqual([
      "fake-access-new", "fake-access-new", "fake-access-new",
    ]);
  });

  it("uma chamada normal aguarda o refresh forçado em andamento", async () => {
    const pending = deferredResponse();
    fetchMock.mockReturnValueOnce(pending.promise);
    const forced = auth.getValidAccessToken(true);
    const normal = auth.getValidAccessToken();
    expect(normal).toBe(forced);
    pending.resolve(response());
    await expect(normal).resolves.toBe("fake-access-new");
  });

  it("armazena o refresh token rotacionado", async () => {
    fetchMock.mockResolvedValueOnce(response(200, {
      access_token: "fake-access-new", refresh_token: "fake-refresh-new", expires_in: 3600,
    }));
    await auth.getValidAccessToken(true);
    expect(auth.loadTokens()?.refreshToken).toBe("fake-refresh-new");
  });

  it("preserva o refresh token anterior quando a resposta não fornece outro", async () => {
    fetchMock.mockResolvedValueOnce(response());
    await auth.getValidAccessToken(true);
    expect(auth.loadTokens()?.refreshToken).toBe(original.refreshToken);
  });

  it.each([429, 500, 503])("HTTP %i preserva a sessão e não expõe o corpo de erro", async (status) => {
    fetchMock.mockResolvedValueOnce(response(status, {
      error: "temporary_error", error_description: "fake-secret-never-display",
    }));
    const result = auth.getValidAccessToken(true);
    await expect(result).rejects.toThrow(`HTTP ${status}`);
    await expect(result).rejects.not.toThrow("fake-secret-never-display");
    expect(auth.loadTokens()).toEqual(original);
  });

  it("falha de rede preserva os tokens e não expõe a mensagem original", async () => {
    fetchMock.mockRejectedValueOnce(new Error("fake-secret-never-display"));
    const result = auth.getValidAccessToken(true);
    await expect(result).rejects.toThrow("Falha de rede");
    await expect(result).rejects.not.toThrow("fake-secret-never-display");
    expect(auth.loadTokens()).toEqual(original);
  });

  it("invalid_grant remove a sessão e exige novo login", async () => {
    fetchMock.mockResolvedValueOnce(response(400, { error: "invalid_grant" }));
    const error = await auth.getValidAccessToken(true).catch((error: unknown) => error);
    expect(auth.isNotLoggedInError(error)).toBe(true);
    expect(auth.loadTokens()).toBeNull();
    await expect(auth.getValidAccessToken()).rejects.toThrow("NOT_LOGGED_IN");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(["invalid_request", "invalid_client", "unknown_error"])(
    "HTTP 400 com %s não apaga a sessão", async (error) => {
      fetchMock.mockResolvedValueOnce(response(400, { error }));
      await expect(auth.getValidAccessToken(true)).rejects.toThrow("HTTP 400");
      expect(auth.loadTokens()).toEqual(original);
    },
  );

  it("HTTP 500 não invalida a sessão mesmo com corpo invalid_grant", async () => {
    fetchMock.mockResolvedValueOnce(response(500, { error: "invalid_grant" }));
    await expect(auth.getValidAccessToken(true)).rejects.toThrow("HTTP 500");
    expect(auth.loadTokens()).toEqual(original);
  });

  it("libera a Promise após falha e não reutiliza o token rejeitado", async () => {
    fetchMock.mockResolvedValueOnce(response(500)).mockResolvedValueOnce(response());
    await expect(auth.getValidAccessToken(true, original.accessToken)).rejects.toThrow("HTTP 500");
    await expect(auth.getValidAccessToken()).resolves.toBe("fake-access-new");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("libera a Promise após sucesso para permitir uma renovação futura", async () => {
    fetchMock.mockResolvedValueOnce(response()).mockResolvedValueOnce(response(200, {
      access_token: "fake-access-next", expires_in: 3600,
    }));
    await auth.getValidAccessToken(true);
    await expect(auth.getValidAccessToken(true)).resolves.toBe("fake-access-next");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("um 401 atrasado reutiliza o token já renovado sem novo refresh", async () => {
    fetchMock.mockResolvedValueOnce(response());
    await auth.getValidAccessToken(true, original.accessToken);
    await expect(auth.getValidAccessToken(true, original.accessToken)).resolves.toBe("fake-access-new");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([200, 400])("resposta antiga HTTP %i não sobrescreve nem apaga sessão nova", async (status) => {
    const pending = deferredResponse();
    fetchMock.mockReturnValueOnce(pending.promise);
    const refreshing = auth.getValidAccessToken(true);
    const newer = { ...original, accessToken: "fake-new-login", refreshToken: "fake-new-login-refresh" };
    store(newer);
    pending.resolve(response(status, status === 400 ? { error: "invalid_grant" } : {
      access_token: "fake-stale-response", refresh_token: "fake-stale-refresh", expires_in: 3600,
    }));
    await expect(refreshing).resolves.toBe(newer.accessToken);
    expect(auth.loadTokens()).toEqual(newer);
  });

  it("uma resposta antiga não restaura sessão removida", async () => {
    const pending = deferredResponse();
    fetchMock.mockReturnValueOnce(pending.promise);
    const refreshing = auth.getValidAccessToken(true);
    auth.clearTokens();
    pending.resolve(response());
    await expect(refreshing).rejects.toThrow("NOT_LOGGED_IN");
    expect(auth.loadTokens()).toBeNull();
  });

  it("refresh antigo aguarda o da sessão nova sem liberar sua Promise", async () => {
    const old = deferredResponse();
    const current = deferredResponse();
    fetchMock.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    const oldRefresh = auth.getValidAccessToken(true);
    store({ ...original, accessToken: "fake-other-session", expiresAt: NOW - 1 });
    const newRefresh = auth.getValidAccessToken();
    old.resolve(response());
    await Promise.resolve();
    expect(auth.getValidAccessToken()).toBe(newRefresh);
    current.resolve(response(200, { access_token: "fake-final-token", expires_in: 3600 }));
    await expect(Promise.all([oldRefresh, newRefresh])).resolves.toEqual([
      "fake-final-token", "fake-final-token",
    ]);
    expect(auth.loadTokens()?.accessToken).toBe("fake-final-token");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([{}, null, { access_token: 123 }, { access_token: "fake-new", expires_in: "invalid" }])(
    "resposta de sucesso malformada preserva a sessão: %j", async (data) => {
      fetchMock.mockResolvedValueOnce(response(200, data));
      await expect(auth.getValidAccessToken(true)).rejects.toThrow("Resposta inválida");
      expect(auth.loadTokens()).toEqual(original);
    },
  );

  it("resposta sem JSON preserva a sessão", async () => {
    fetchMock.mockResolvedValueOnce(new Response("not-json", { status: 200 }));
    await expect(auth.getValidAccessToken(true)).rejects.toThrow("Resposta inválida");
    expect(auth.loadTokens()).toEqual(original);
  });

  it("token expirado sem refresh token exige novo login", async () => {
    store({ ...original, expiresAt: NOW - 1, refreshToken: "" });
    await expect(auth.getValidAccessToken()).rejects.toThrow("NOT_LOGGED_IN");
    expect(auth.loadTokens()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
