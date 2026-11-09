import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { HookHarness } from "./test/hookHarness";
import { memoryStorage, playlist, session } from "./test/gameFixtures";
import type { UseAudioResult } from "./hooks/useAudio";
import App from "./App";
import { SESSION_KEY } from "./utils/gameSession";

const source = vi.hoisted(() => ({ audio: {} as UseAudioResult }));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(), ...(await import("./test/hookHarness")).hooks,
}));
vi.mock("./hooks/useAudio", () => ({ useAudio: () => source.audio }));
vi.mock("./data/playlists", async () => ({ playlists: [(await import("./test/gameFixtures")).playlist] }));

let host: HookHarness<ReactElement>;
beforeEach(() => {
  vi.stubGlobal("window", { sessionStorage: memoryStorage(), localStorage: memoryStorage() });
  source.audio = {
    serviceStatus: "ready", serviceError: null, failure: null, snippetPhase: "idle", trackMeta: null,
    loadTrack: vi.fn(), playSnippet: vi.fn(), stopPlayback: vi.fn(), retry: vi.fn(), login: vi.fn(),
  };
  window.localStorage.setItem("guessthesong:selected-playlist", playlist.id);
});
afterEach(() => { host?.unmount(); vi.unstubAllGlobals(); });

function screen(): ReactElement {
  const root = host.current as ReactElement<{ children: ReactElement[] }>;
  const main = root.props.children[0] as ReactElement<{ children: ReactElement[] }>;
  return main.props.children[1];
}

describe("montagem da partida durante reconexão", () => {
  it.each(["needs_login", "error", "connecting"] as const)("mantém o mesmo Game montado durante %s", (status) => {
    host = new HookHarness(App);
    const before = screen();
    expect((before.props as { playlist: typeof playlist }).playlist.id).toBe(playlist.id);
    source.audio = { ...source.audio, serviceStatus: status };
    host.rerender();
    expect(screen().type).toBe(before.type);
    expect(screen().key).toBe(before.key);
  });

  it("espera login e player prontos antes de fornecer o snapshot à partida", () => {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session()));
    source.audio.serviceStatus = "needs_login";
    host = new HookHarness(App);
    expect((screen().props as { initialSession?: unknown }).initialSession).toBeUndefined();
    expect(window.sessionStorage.getItem(SESSION_KEY)).not.toBeNull();
    source.audio = { ...source.audio, serviceStatus: "connecting" }; host.rerender();
    expect((screen().props as { initialSession?: unknown }).initialSession).toBeUndefined();
    source.audio = { ...source.audio, serviceStatus: "ready" }; host.rerender();
    expect((screen().props as { initialSession: unknown }).initialSession).toMatchObject({ queueIds: session().queueIds });
  });
});
