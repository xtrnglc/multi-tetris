export function ScoreBar({ score, lines, level }: { score: number; lines: number; level: number }) {
  return (
    <div className="score-bar">
      <div className="stat">
        LINES <b>{lines}</b>
      </div>
      <div className="emblem">{score.toLocaleString()}</div>
      <div className="stat">
        LV <b>{level}</b>
      </div>
    </div>
  );
}
