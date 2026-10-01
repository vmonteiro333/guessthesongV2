const COLORS = ["#00e676", "#8dffc0", "#ffffff", "#00b85c", "#d0ffe9", "#00e676"];

/** Confete CSS puro no acerto (sem bibliotecas). */
export default function ConfettiBurst() {
  return (
    <div className="confetti" aria-hidden="true">
      {Array.from({ length: 14 }, (_, i) => (
        <i
          key={i}
          style={{
            left: `${(i * 37 + 5) % 96}%`,
            background: COLORS[i % COLORS.length],
            animationDelay: `${(i % 5) * 0.07}s`,
            animationDuration: `${1.3 + (i % 4) * 0.25}s`,
          }}
        />
      ))}
    </div>
  );
}