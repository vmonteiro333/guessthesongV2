import { useEffect, useRef, useState } from "react";
import type { UseGameResult, GuessFeedback } from "../hooks/useGame";
import type { UseAudioResult } from "../hooks/useAudio";
import type { Song } from "../types/song";
import type { Difficulty } from "../types/difficulty";
import StageIndicator from "./StageIndicator";
import NowPlayingPanel from "./NowPlayingPanel";
import AlbumBackdrop from "./AlbumBackdrop";
import ConfettiBurst from "./ConfettiBurst";
import AnswerForm from "./AnswerForm";
import LoadingState from "./LoadingState";
import ResultDrawer from "./ResultDrawer";
import TrackModal from "./TrackModal";
import { formatSeconds } from "../utils/gameRules";
import { PlayIcon } from "./icons";

interface GameScreenProps {
  game: UseGameResult;
  audio: UseAudioResult;
  catalog: Song[];
  difficulty: Difficulty;
  resultsOpen: boolean;
  onCloseResults: () => void;
}

export default function GameScreen({
  game,
  audio,
  catalog,
  difficulty,
  resultsOpen,
  onCloseResults,
}: GameScreenProps) {
  const { gameStatus, feedback, currentSongIndex, queue, history } = game;

  // Modal de fim de rodada: reabre a cada rodada concluída.
  const [modalDismissed, setModalDismissed] = useState(false);
  useEffect(() => {
    if (gameStatus === "finished") setModalDismissed(false);
  }, [gameStatus, currentSongIndex]);

  // Menu de dicas (dificuldade Fácil).
  const [hintMenuOpen, setHintMenuOpen] = useState(false);
  const hintWrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!hintMenuOpen) return;
    const onPointerDown = (event: MouseEvent): void => {
      if (!hintWrapRef.current?.contains(event.target as Node)) setHintMenuOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [hintMenuOpen]);

  const roundOver = gameStatus === "finished";
  const canType =
    gameStatus === "ready" || gameStatus === "playing" || gameStatus === "waiting_answer";
  const canAnswer = gameStatus === "waiting_answer";
  const canListen = gameStatus === "ready" || gameStatus === "waiting_answer";
  const isLastRound = currentSongIndex + 1 >= queue.length;
  const serviceFatal = audio.serviceStatus === "error";

  return (
    <section className="game-screen" aria-label="Rodada atual">
      <AlbumBackdrop coverUrl={audio.trackMeta?.coverUrl ?? null} revealed={roundOver} />

      <StageIndicator stageIndex={game.stageIndex} stages={difficulty.stages} />

      {serviceFatal && (
        <div className="alert" role="alert">
          <p>O player do Spotify reportou um erro.</p>
          <p className="alert-detail">{audio.serviceError}</p>
          <button type="button" className="btn btn-ghost" onClick={() => window.location.reload()}>
            Recarregar página
          </button>
        </div>
      )}

      <NowPlayingPanel
        secret={!roundOver}
        playing={gameStatus === "playing"}
        phase={audio.snippetPhase}
        song={
          roundOver && game.currentSong
            ? { title: game.currentSong.title, artist: game.currentSong.artist }
            : null
        }
        streak={game.streak}
        hintArtist={game.hints.artist ? (game.currentSong?.artist ?? null) : null}
        hintCoverUrl={game.hints.cover ? (audio.trackMeta?.coverUrl ?? null) : null}
      />

      {gameStatus === "loading" && <LoadingState message="Carregando a música…" />}
      {gameStatus === "error" && <LoadingState message="Pulando para a próxima música…" />}

      <FeedbackPanel feedback={feedback} visible={!roundOver || modalDismissed} />

      {canType && !serviceFatal && (
        <>
          <div className="listen-row">
            <button
              type="button"
              className="btn btn-listen"
              onClick={game.listen}
              disabled={!canListen}
              aria-label={
                gameStatus === "playing"
                  ? "Trecho tocando"
                  : `Ouvir o trecho de ${formatSeconds(game.stageSeconds)}`
              }
            >
              <PlayIcon />
              {audio.snippetPhase === "buffering"
                ? "Preparando áudio…"
                : gameStatus === "playing"
                  ? "Tocando…"
                  : "Ouvir o trecho"}
            </button>
            <span className="listen-hint">
              {gameStatus === "playing"
                ? "O trecho para no limite da etapa"
                : `Trecho de ${formatSeconds(game.stageSeconds)}`}
            </span>
          </div>

          {difficulty.allowHints && (
            <div className="hint-wrap" ref={hintWrapRef}>
              <button
                type="button"
                className="btn btn-ghost hint-btn"
                onClick={() => setHintMenuOpen((o) => !o)}
                aria-expanded={hintMenuOpen}
                aria-haspopup="menu"
              >
                💡 Pedir dica
              </button>
              {hintMenuOpen && (
                <div className="hint-menu" role="menu" aria-label="Opções de dica">
                  <button
                    type="button"
                    role="menuitem"
                    className="hint-menu-item"
                    onClick={() => {
                      game.revealHint("artist");
                      setHintMenuOpen(false);
                    }}
                  >
                    Revelar o nome do artista
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="hint-menu-item"
                    disabled={!audio.trackMeta?.coverUrl}
                    onClick={() => {
                      game.revealHint("cover");
                      setHintMenuOpen(false);
                    }}
                  >
                    Mostrar a capa do álbum
                    {!audio.trackMeta?.coverUrl && " (ouça o trecho primeiro)"}
                  </button>
                </div>
              )}
            </div>
          )}

          <AnswerForm
            value={game.answer.title}
            catalog={catalog}
            allowArtistSearch={difficulty.allowArtistSearch}
            onChange={game.setAnswerField}
            onSubmit={game.submitAnswer}
            onSkip={game.skip}
            canType={canType}
            canAnswer={canAnswer}
            canSkip={canType}
            isLastStage={game.isLastStage}
          />
        </>
      )}

      {roundOver && (
        <div className="next-row">
          <NextButton isLast={isLastRound} onClick={game.nextSong} />
        </div>
      )}

      {roundOver && game.activeResult && (
        <TrackModal
          result={game.activeResult}
          spotifyUrl={game.currentSong?.spotifyUrl ?? null}
          onClose={() => setModalDismissed(true)}
          onNext={game.nextSong}
          isLastRound={isLastRound}
          brokenCombo={game.lastBrokenCombo}
          streakAfter={game.streak}
        />
      )}

      <ResultDrawer open={resultsOpen} results={history} onClose={onCloseResults} />
    </section>
  );
}

function FeedbackPanel({
  feedback,
  visible,
}: {
  feedback: GuessFeedback | null;
  visible: boolean;
}) {
  if (!visible || !feedback) return null;

  const isCorrect = feedback.kind === "correct";
  const isFailed = feedback.kind === "round_failed";
  const pointsMatch = feedback.detail?.match(/^\+(\d+)/);
  const points = isCorrect && pointsMatch ? pointsMatch[1] : null;

  return (
    <div
      key={`${feedback.kind}-${feedback.message}`}
      className={`feedback feedback--${feedback.kind}`}
      role="status"
      aria-live="polite"
    >
      {isCorrect && <ConfettiBurst />}
      {isCorrect && points !== null && (
        <span className="points-float" aria-hidden="true">
          +{points}
        </span>
      )}
      <p className="feedback-message">
        {isCorrect && "✓ Acertou! "}
        {isFailed && "✕ Não foi dessa vez — "}
        {feedback.message.replace(/^Acertou! /, "").replace(/^Fim da rodada\. /, "")}
      </p>
      {feedback.detail && !isCorrect && <p className="feedback-detail">{feedback.detail}</p>}
    </div>
  );
}

function NextButton({ onClick, isLast }: { onClick: () => void; isLast: boolean }) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    buttonRef.current?.focus();
  }, []);
  return (
    <button ref={buttonRef} type="button" className="btn btn-primary btn-large" onClick={onClick}>
      {isLast ? "Ver resultado final" : "Próxima música →"}
    </button>
  );
}