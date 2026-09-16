"use client";

interface ScoreRingProps {
  score: number;
  maxScore: number;
  size?: number;
}

export default function ScoreRing({ score, maxScore, size = 130 }: ScoreRingProps) {
  const pct = (score / maxScore) * 100;
  const r = (size - 12) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  // 良い/普通/悪い の3段階は色で読ませる（緑=良・琥珀=注意・赤土=要改善）。
  // var() は SVG の presentation attribute では解決されないため、必ず style 経由で渡す。
  const color = pct >= 80 ? "var(--green)" : pct >= 60 ? "var(--amber)" : "var(--clay)";

  return (
    <svg
      width={size}
      height={size}
      role="img"
      aria-label={`評価スコア ${score} / ${maxScore}`}
      style={{ transform: "rotate(-90deg)" }}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth="8"
        style={{ stroke: "var(--line-soft)" }}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth="8"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ stroke: color, transition: "stroke-dashoffset 1.2s ease" }}
      />
      <text
        className="tnum"
        x={size / 2}
        y={size / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={size * 0.28}
        fontWeight="700"
        style={{ fill: "var(--ink)", transform: "rotate(90deg)", transformOrigin: "center" }}
      >
        {score}
      </text>
      <text
        className="tnum"
        x={size / 2}
        y={size / 2 + size * 0.18}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={size * 0.12}
        fontWeight="500"
        style={{ fill: "var(--faint)", transform: "rotate(90deg)", transformOrigin: "center" }}
      >
        /{maxScore}
      </text>
    </svg>
  );
}
