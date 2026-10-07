import { STAGE_POINTS, formatSeconds } from "../utils/gameRules";

interface StageIndicatorProps {
  stageIndex: number;
  stages: number[];
}

export default function StageIndicator({ stageIndex, stages }: StageIndicatorProps) {
  const seconds = formatSeconds(stages[stageIndex] ?? stages[0] ?? 0);
  const critical = stageIndex >= stages.length - 1;
  const ladder = STAGE_POINTS.slice(0, stages.length);

  return (
    <section
      className={`stage panel${critical ? " stage--critical" : ""}`}
      aria-label={`Etapa ${stageIndex + 1} de ${stages.length}: trecho de ${seconds}, vale ${STAGE_POINTS[stageIndex]} pontos`}
    >
      <div className="stage-meta">
        <span className="stage-count">
          Rodada {stageIndex + 1} / {stages.length}
        </span>
        {critical && <span className="stage-critical-tag">última chance</span>}
        <span key={stageIndex} className="stage-points">
          vale {STAGE_POINTS[stageIndex]} pts
        </span>
      </div>

      <p className="stage-time" aria-hidden="true">
        {seconds}
      </p>

      <div className="value-ladder" aria-hidden="true">
        {ladder.map((points, index) => (
          <span
            key={points}
            className={
              index < stageIndex
                ? "lad lad--lost"
                : index === stageIndex
                  ? "lad lad--current"
                  : "lad"
            }
          >
            {points}
          </span>
        ))}
      </div>

      <ol className="stage-steps" aria-hidden="true">
        {stages.map((value, index) => (
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