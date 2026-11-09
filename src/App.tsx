import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useGame } from "./hooks/useGame";
import { useAudio } from "./hooks/useAudio";
import type { Playlist } from "./types/playlist";
import type { GameModeId } from "./types/gameMode";
import type { DifficultySelection } from "./types/difficulty";
import { playlists } from "./data/playlists";
import { getDifficulty } from "./data/difficulties";
import { clearGameSession, effectiveSongs, readGameSession, reconnectGameSession } from "./utils/gameSession";
import type { GameSession } from "./utils/gameSession";
import GameHeader from "./components/GameHeader";
import GameScreen from "./components/GameScreen";
import GameOver from "./components/GameOver";
import StartScreen from "./components/StartScreen";
import EmptyState from "./components/EmptyState";
import LoadingState from "./components/LoadingState";
import SpotifyConnect from "./components/SpotifyConnect";
import PlaylistPicker from "./components/PlaylistPicker";
import Ribbons from "./components/Ribbons";
import {
  loadSelectedPlaylistId,
  saveSelectedPlaylistId,
  loadSelectedModeId,
  saveSelectedModeId,
  loadDifficultySelection,
  saveDifficultySelection,
} from "./utils/storage";

function findPlaylist(id: string | null): Playlist | null {
  if (!id) return null;
  return playlists.find((p) => p.id === id) ?? null;
}

export default function App() {
  const audio = useAudio();
  const [startup, setStartup] = useState(() => readGameSession(playlists));
  const [hasConnected, setHasConnected] = useState(false);
  useEffect(() => {
    if (audio.serviceStatus === "ready") setHasConnected(true);
  }, [audio.serviceStatus]);
  useEffect(() => {
    if (startup.notice) clearGameSession();
  }, [startup.notice]);
  const [selected, setSelected] = useState<Playlist | null>(() =>
    findPlaylist(startup.session?.playlistId ?? loadSelectedPlaylistId())
  );

  const choosePlaylist = (playlist: Playlist): void => {
    clearGameSession();
    setStartup({ session: null, notice: null });
    audio.stopPlayback();
    setSelected(playlist);
    saveSelectedPlaylistId(playlist.id);
  };
  const backToPicker = (): void => {
    clearGameSession();
    setStartup({ session: null, notice: null });
    audio.stopPlayback();
    setSelected(null);
  };

  let screen: ReactNode;
  if (playlists.length === 0) {
    screen = <EmptyState />;
  } else if (selected && hasConnected) {
    screen = (
      <Game key={selected.id} playlist={selected} audio={audio}
        initialSession={startup.session ?? undefined} onChoosePlaylist={backToPicker} />
    );
  } else if (audio.serviceStatus === "needs_login") {
    screen = <SpotifyConnect onConnect={audio.login} error={audio.serviceError} />;
  } else if (audio.serviceStatus === "boot" || audio.serviceStatus === "connecting") {
    screen = <LoadingState message="Conectando ao Spotify…" />;
  } else if (audio.serviceStatus === "error") {
    screen = (
      <section className="start-screen panel">
        <h2 className="start-title">Não foi possível conectar ao Spotify</h2>
        <p className="start-tagline">{audio.serviceError}</p>
        <button
          type="button"
          className="btn btn-primary btn-large"
          onClick={() => void audio.retry()}
        >
          Tentar novamente
        </button>
      </section>
    );
  } else if (selected === null) {
    screen = <PlaylistPicker playlists={playlists} onSelect={choosePlaylist} />;
  } else {
    screen = (
      <Game
        key={selected.id}
        playlist={selected}
        audio={audio}
        onChoosePlaylist={backToPicker}
        initialSession={startup.session ?? undefined}
      />
    );
  }

  return (
    <div className="app">
      <main className="app-main">
        {startup.notice && <p className="alert" role="status">{startup.notice}</p>}
        {screen}
      </main>
      <Ribbons />
    </div>
  );
}

interface GameProps {
  playlist: Playlist;
  audio: ReturnType<typeof useAudio>;
  onChoosePlaylist: () => void;
  initialSession?: GameSession;
}

function Game({ playlist, audio, onChoosePlaylist, initialSession }: GameProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [modeId, setModeId] = useState<GameModeId>(() => initialSession?.modeId ?? loadSelectedModeId() ?? "classic");
  const [selection, setSelection] = useState<DifficultySelection>(() =>
    initialSession?.selection ?? loadDifficultySelection()
  );

  /**
   * Pool efetivo da partida: a dimensão POPULARIDADE filtra as músicas
   * (percentis por streams). Enquanto os filtros estão "EM BREVE", o pool
   * é sempre o completo.
   */
  const effectivePlaylist = useMemo<Playlist>(() => {
    return { ...playlist, songs: effectiveSongs(playlist, selection) };
  }, [playlist, selection]);

  // ⚠️ TEMPO: sempre ativo — não existe mais "desligar".
  // (id inválido cai no Médio pelo fallback do getDifficulty)
  const effectiveDifficulty = useMemo(
    () => getDifficulty(selection.time.difficultyId),
    [selection]
  );

  const game = useGame(audio, effectivePlaylist, effectiveDifficulty, initialSession);
  const { gameStatus } = game;
  const [redirecting, setRedirecting] = useState(false);

  const reconnect = async (): Promise<void> => {
    if (redirecting) return;
    game.pauseForReconnect();
    setRedirecting(true);
    try {
      await reconnectGameSession({
        ...game.getProgress(), version: 1, savedAt: Date.now(), playlistId: playlist.id, modeId, selection,
      }, playlists, audio.login, () => window.confirm(
        "Não foi possível salvar seu progresso neste navegador. Se continuar, a partida será perdida ao reconectar. Deseja continuar mesmo assim?",
      ));
    } finally { setRedirecting(false); }
  };

  const showHeader = gameStatus !== "idle" && gameStatus !== "game_over";
  const doneCount = game.history.filter((entry) => entry.finalized).length;

  let screen: ReactNode;
  if (gameStatus === "idle") {
    screen = (
      <StartScreen
        playlist={playlist}
        modeId={modeId}
        onChangeMode={(id) => {
          setModeId(id);
          saveSelectedModeId(id);
        }}
        selection={selection}
        onChangeSelection={(next) => {
          setSelection(next);
          saveDifficultySelection(next);
        }}
        onStart={game.startGame}
        onChoosePlaylist={onChoosePlaylist}
      />
    );
  } else if (gameStatus === "game_over") {
    screen = (
      <GameOver
        score={game.score}
        history={game.history}
        playlistName={playlist.name}
        maxStreak={game.maxStreak}
        onRestart={game.startGame}
        onChoosePlaylist={onChoosePlaylist}
      />
    );
  } else {
    screen = (
      <GameScreen
        game={game}
        audio={audio}
        catalog={effectivePlaylist.songs}
        difficulty={effectiveDifficulty}
        resultsOpen={drawerOpen}
        onCloseResults={() => setDrawerOpen(false)}
        onReconnect={() => void reconnect()}
        redirecting={redirecting}
      />
    );
  }

  return (
    <div className="game-root">
      {showHeader && (
        <GameHeader
          playlistName={playlist.name}
          score={game.score}
          total={game.queue.length}
          doneCount={doneCount}
          onOpenResults={() => setDrawerOpen(true)}
          onExit={onChoosePlaylist}
        />
      )}
      <main className={gameStatus === "idle" ? "app-main app-main--wide" : "app-main"}>
        {screen}
      </main>
    </div>
  );
}
