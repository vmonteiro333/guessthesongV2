import { STAGES, formatSeconds, getStagePoints, getStageSeconds } from "../utils/gameRules";

interface StageIndicatorProps {
  stageIndex: number;
}

export default function StageIndicator({ stageIndex }: StageIndicatorProps) {
  const seconds = formatSeconds(getStageSeconds(stageIndex));
  return (
    <section
      className="stage panel"
      aria-label={`Etapa ${stageIndex + 1} de ${STAGES.length}: trecho de ${seconds}`}
    >
      <div className="stage-meta">
        <span className="stage-count">
          Rodada {stageIndex + 1} / {STAGES.length}
        </span>
        <span className="stage-points">vale {getStagePoints(stageIndex)} pts</span>
      </div>
      <p className="stage-time" aria-hidden="true">
        {seconds}
      </p>
      <ol className="stage-steps" aria-hidden="true">
        {STAGES.map((value, index) => (
          <li
            key={value}
            className={
              index < stageIndex
                ? "step step--done"
                : index === stageIndex
                  ? "step step--current"
                  : "step"
            }
            title={formatSeconds(value)}
          />
        ))}
      </ol>
    </section>
  );
}