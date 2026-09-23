import {
  SPOTIFY_CLIENT_ID,
  SPOTIFY_SCOPES,
  getSpotifyRedirectUri,
} from "../../config/spotify";

const TOKENS_KEY = "gts:spotify:tokens";
const VERIFIER_KEY = "gts:spotify:verifier";
const STATE_KEY = "gts:spotify:state";
const AUTH_URL = "https://accounts.spotify.com/authorize";
const TOKEN_URL = "https://accounts.spotify.com/api/token";

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomString(length: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const values = crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  for (const value of values) out += chars[value % chars.length];
  return out;
}

export function loadTokens(): StoredTokens | null {
  try {
    const raw = window.localStorage.getItem(TOKENS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredTokens>;
    if (
      typeof parsed.accessToken !== "string" ||
      typeof parsed.refreshToken !== "string" ||
      typeof parsed.expiresAt !== "number"
    ) {
      return null;
    }
    return parsed as StoredTokens;
  } catch {
    return null;
  }
}

function saveTokens(tokens: StoredTokens): void {
  try {
    window.localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
  } catch {
    /* armazenamento bloqueado: sessão não persiste entre recargas */
  }
}

export function clearTokens(): void {
  try {
    window.localStorage.removeItem(TOKENS_KEY);
  } catch {
    /* noop */
  }
}

/** Redireciona o navegador para o login do Spotify (PKCE). */
export async function startLogin(): Promise<void> {
  const verifier = randomString(96);
  const state = randomString(24);
  try {
    window.localStorage.setItem(VERIFIER_KEY, verifier);
    window.localStorage.setItem(STATE_KEY, state);
  } catch {
    throw new Error("Não foi possível iniciar o login (armazenamento bloqueado).");
  }
  const challenge = base64UrlEncode(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)))
  );
  const url = new URL(AUTH_URL);
  url.searchParams.set("client_id", SPOTIFY_CLIENT_ID);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", getSpotifyRedirectUri());
  url.searchParams.set("scope", SPOTIFY_SCOPES.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("code_challenge", challenge);
  window.location.assign(url.toString());
}

/**
 * SINGLETON: o código de autorização é de USO ÚNICO. O React StrictMode (dev)
 * monta o hook duas vezes; sem este guard, duas chamadas trocavam o mesmo
 * código e uma falhava. Aqui a troca acontece exatamente uma vez por página.
 */
let authRedirectPromise: Promise<boolean> | null = null;

export function handleAuthRedirect(): Promise<boolean> {
  if (!authRedirectPromise) {
    authRedirectPromise = doHandleAuthRedirect().catch((error) => {
      authRedirectPromise = null; // falhou: permite nova tentativa de login
      throw error;
    });
  }
  return authRedirectPromise;
}

async function doHandleAuthRedirect(): Promise<boolean> {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state) return false;

  const expectedState = window.localStorage.getItem(STATE_KEY);
  const verifier = window.localStorage.getItem(VERIFIER_KEY);
  window.history.replaceState({}, "", getSpotifyRedirectUri());
  if (!expectedState || !verifier || state !== expectedState) {
    throw new Error("Retorno do login inválido. Tente conectar novamente.");
  }
  window.localStorage.removeItem(VERIFIER_KEY);
  window.localStorage.removeItem(STATE_KEY);

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: getSpotifyRedirectUri(),
    client_id: SPOTIFY_CLIENT_ID,
    code_verifier: verifier,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    throw new Error("Falha ao trocar o código de login por token (" + res.status + ").");
  }
  const data = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!data.access_token) throw new Error("Resposta de token inválida do Spotify.");
  saveTokens({
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? "",
    expiresAt: Date.now() + (Math.max(60, Number(data.expires_in ?? 3600)) - 60) * 1000,
  });
  return true;
}

/** Access token válido, renovando sozinho quando perto de expirar. */
export async function getValidAccessToken(): Promise<string> {
  const tokens = loadTokens();
  if (!tokens) throw new Error("NOT_LOGGED_IN");
  if (Date.now() < tokens.expiresAt) return tokens.accessToken;
  if (!tokens.refreshToken) {
    clearTokens();
    throw new Error("NOT_LOGGED_IN");
  }
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: tokens.refreshToken,
    client_id: SPOTIFY_CLIENT_ID,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    clearTokens();
    throw new Error("NOT_LOGGED_IN");
  }
  const data = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!data.access_token) {
    clearTokens();
    throw new Error("NOT_LOGGED_IN");
  }
  saveTokens({
    accessToken: data.access_token,
    refreshToken: data.refresh_token || tokens.refreshToken,
    expiresAt: Date.now() + (Math.max(60, Number(data.expires_in ?? 3600)) - 60) * 1000,
  });
  return data.access_token;
}

export function isNotLoggedInError(error: unknown): boolean {
  return error instanceof Error && error.message === "NOT_LOGGED_IN";
}