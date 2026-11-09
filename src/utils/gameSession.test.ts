import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearGameSession, readGameSession, reconnectGameSession, resumedStatus, saveGameSession, SESSION_KEY, SESSION_TTL_MS, validateSession } from "./gameSession";
import { memoryStorage, playlist, session } from "../test/gameFixtures";

beforeEach(() => vi.stubGlobal("window", { sessionStorage: memoryStorage() }));
afterEach(() => vi.unstubAllGlobals());

describe("snapshot de recuperação", () => {
  it("salva e lê exatamente a fila, etapa, pontos, combo, dicas, palpite e artista parcial", () => {
    const value = session();
    expect(saveGameSession(value, [playlist])).toBe(true);
    expect(readGameSession([playlist])).toEqual({ session: { ...value, history: value.history.map((h) => ({ ...h, error: false })) }, notice: null });
    clearGameSession();
    expect(readGameSession([playlist])).toEqual({ session: null, notice: null });
  });

  it("serializa somente campos permitidos, excluindo credenciais e dados desconhecidos", () => {
    expect(saveGameSession({ ...session(), accessToken: "secret", refreshToken: "secret2" } as ReturnType<typeof session>, [playlist])).toBe(true);
    const raw = window.sessionStorage.getItem(SESSION_KEY)!;
    expect(raw).not.toContain("secret");
    expect(raw).not.toContain("Token");
  });

  it.each([
    ["versão", { version: 2 }], ["prazo", { savedAt: Date.now() - SESSION_TTL_MS - 1000 }],
    ["data futura", { savedAt: Date.now() + SESSION_TTL_MS }], ["playlist", { playlistId: "removida" }],
    ["modo", { modeId: "outro" }], ["fila duplicada", { queueIds: ["a", "a", "c"] }],
    ["faixa removida", { queueIds: ["a", "b", "removida"] }], ["fila incompleta", { queueIds: ["a"] }],
    ["índice", { currentSongIndex: 9 }], ["etapa", { stageIndex: 999 }],
    ["estado", { status: "playing" }], ["pontos", { score: 999 }], ["combo", { streak: -1 }],
    ["histórico", { history: [{}] }], ["dicas", { hints: {} }], ["palpite", { answer: null }],
    ["artista parcial", { round: { artistCorrect: true, artistAtStage: null } }],
    ["configuração", { selection: { time: { difficultyId: "invalid" }, popularity: { enabled: false, filterId: null } } }],
  ])("rejeita %s inválido sem travar", (_name, patch) => {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...session(), ...patch }));
    const result = readGameSession([playlist]);
    expect(result.session).toBeNull();
    expect(result.notice).toBeTruthy();
  });

  it("trata dados ausentes e JSON corrompido", () => {
    expect(readGameSession([playlist])).toEqual({ session: null, notice: null });
    window.sessionStorage.setItem(SESSION_KEY, "{");
    expect(readGameSession([playlist]).notice).toBeTruthy();
    expect(validateSession(null, [playlist])).toBeNull();
  });

  it("informa armazenamento bloqueado em vez de afirmar que salvou", () => {
    Object.defineProperty(window, "sessionStorage", { get: () => { throw new Error("blocked"); } });
    expect(saveGameSession(session(), [playlist])).toBe(false);
    expect(readGameSession([playlist]).session).toBeNull();
    expect(() => clearGameSession()).not.toThrow();
  });

  it.each([["playing", "ready"], ["waiting_answer", "waiting_answer"], ["finished", "finished"]])(
    "recupera %s como %s sem solicitar reprodução", (before, after) => expect(resumedStatus(before)).toBe(after),
  );

  it.each([false, true])("armazenamento bloqueado: só redireciona com confirmação explícita (%s)", async (accept) => {
    Object.defineProperty(window, "sessionStorage", { get: () => { throw new Error("blocked"); } });
    const login = vi.fn().mockResolvedValue(undefined);
    const confirmLoss = vi.fn().mockReturnValue(accept);
    expect(await reconnectGameSession(session(), [playlist], login, confirmLoss)).toBe(accept);
    expect(confirmLoss).toHaveBeenCalledOnce();
    expect(login).toHaveBeenCalledTimes(accept ? 1 : 0);
  });

  it("salva antes de iniciar o OAuth e mantém o snapshot se o login falhar", async () => {
    const login = vi.fn(async () => {
      expect(readGameSession([playlist]).session?.queueIds).toEqual(session().queueIds);
      throw new Error("OAuth error");
    });
    const confirmLoss = vi.fn();
    await expect(reconnectGameSession(session(), [playlist], login, confirmLoss)).rejects.toThrow("OAuth error");
    expect(confirmLoss).not.toHaveBeenCalled();
    expect(readGameSession([playlist]).session).not.toBeNull();
  });
});
