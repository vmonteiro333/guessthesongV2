import { useEffect, useRef } from "react";
import type { UseGameResult, GuessFeedback } from "../hooks/useGame";
import type { UseAudioResult } from "../hooks/useAudio";
import StageIndicator from "./StageIndicator";
import NowPlayingPanel from "./NowPlayingPanel";
import AnswerForm from "./AnswerForm";
import LoadingState from "./LoadingState";
import ResultList from "./ResultList";
import { formatSeconds } from "../utils/gameRules";
import { PlayIcon } from "./icons";

interface GameScreenProps {
  game: UseGameResult;
  audio: UseAudioResult;
}

export default function GameScreen({ game, audio }: GameScreenProps) {
  const { gameStatus, feedback, currentSongIndex, queue, history } = game;

  const roundOver = gameStatus === "finished";
  const canType =
    gameStatus === "ready" || gameStatus === "playing" || gameStatus === "waiting_answer";
  const canAnswer = gameStatus === "waiting_answer";
  const canListen = gameStatus === "ready" || gameStatus === "waiting_answer";
  const isLastRound = currentSongIndex + 1 >= queue.length;
  const serviceFatal = audio.serviceStatus === "error";

  return (
    <section className="game-screen" aria-label="Rodada atual">
      <StageIndicator stageIndex={game.stageIndex} playing={gameStatus === "playing"} />

      {serviceFatal && (
        <div className="alert" role="alert">
          <p>Não foi possível inicializar o player do Spotify.</p>
          <p className="alert-detail">{audio.serviceError}</p>
          <button type="button" className="btn btn-ghost" onClick={() => window.location.reload()}>
            Recarregar página
          </button>
        </div>
      )}

            <NowPlayingPanel
        secret={!roundOver}
        playing={gameStatus === "playing"}
        song={
          roundOver && game.currentSong
            ? { title: game.currentSong.title, artist: game.currentSong.artist }
            : null
        }
      />
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
              {gameStatus === "playing" ? "Tocando…" : "Ouvir o trecho"}
            </button>
            <span className="listen-hint">
              {gameStatus === "playing"
                ? "O trecho para no limite da etapa"
                : `Trecho de ${formatSeconds(game.stageSeconds)}`}
            </span>
          </div>

          <AnswerForm
            title={game.answer.title}
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

      <ResultList results={history} />
    </section>
  );
}

function FeedbackPanel({ feedback }: { feedback: GuessFeedback | null }) {
  if (!feedback) return null;
  return (
    <div className={`feedback feedback--${feedback.kind}`} role="status" aria-live="polite">
      <p className="feedback-message">{feedback.message}</p>
      {feedback.detail && <p className="feedback-detail">{feedback.detail}</p>}
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
      {isLast ? "Ver resultado final" : "Próxima música"}
    </button>
  );
}