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
  const color = pct >= 80 ? "#10b981" : pct >= 60 ? "#f59e0b" : "#ef4444";

  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1e293b" strokeWidth="8" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="8"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 1.2s ease" }}
      />
      <text
        x={size / 2}
        y={size / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fill="#f1f5f9"
        fontSize={size * 0.28}
        fontWeight="800"
        style={{ transform: "rotate(90deg)", transformOrigin: "center" }}
      >
        {score}
      </text>
      <text
        x={size / 2}
        y={size / 2 + size * 0.18}
        textAnchor="middle"
        dominantBaseline="central"
        fill="#94a3b8"
        fontSize={size * 0.12}
        fontWeight="500"
        style={{ transform: "rotate(90deg)", transformOrigin: "center" }}
      >
        /{maxScore}
      </text>
    </svg>
  );
}
