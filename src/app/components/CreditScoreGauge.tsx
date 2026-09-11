import { useEffect, useState } from "react";

interface Props {
  score: number;       // 300–850
  size?: number;
  showLabel?: boolean;
}

function scoreLabel(s: number) {
  if (s >= 750) return { text: "Excellent", color: "#12B984" };
  if (s >= 700) return { text: "Good", color: "var(--brand-primary-dark)" };
  if (s >= 650) return { text: "Fair", color: "#F59E0B" };
  if (s >= 580) return { text: "Poor", color: "#EF4444" };
  return { text: "Very Poor", color: "#DC2626" };
}

export function CreditScoreGauge({ score, size = 180, showLabel = true }: Props) {
  const [animated, setAnimated] = useState(300);

  useEffect(() => {
    const start = Date.now();
    const duration = 1200;
    const from = 300;
    const to = Math.min(Math.max(score, 300), 850);
    const frame = () => {
      const elapsed = Date.now() - start;
      const t = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      setAnimated(Math.round(from + (to - from) * ease));
      if (t < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }, [score]);

  const { text, color } = scoreLabel(animated);

  // SVG arc params — 240° sweep starting from 150° (bottom-left)
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.38;
  const strokeWidth = size * 0.085;
  const circumference = 2 * Math.PI * r;
  const arcFraction = 240 / 360;
  const dashTotal = circumference * arcFraction;

  const pct = (animated - 300) / (850 - 300);
  const fillDash = dashTotal * pct;

  // Arc path helper: rotated so 0% is at 150° and 100% is at 30°
  const startAngle = 150;
  const endAngle = startAngle + 240;

  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const pt = (angle: number, radius = r) => ({
    x: cx + radius * Math.cos(toRad(angle)),
    y: cy + radius * Math.sin(toRad(angle)),
  });

  const arcPath = (startDeg: number, sweepDeg: number, radius: number) => {
    const s = pt(startDeg, radius);
    const e = pt(startDeg + sweepDeg, radius);
    const largeArc = sweepDeg > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${radius} ${radius} 0 ${largeArc} 1 ${e.x} ${e.y}`;
  };

  // Needle tip angle
  const needleAngle = startAngle + 240 * pct;
  const needleTip = pt(needleAngle, r * 0.78);
  const needleBase1 = pt(needleAngle + 90, strokeWidth * 0.3);
  const needleBase2 = pt(needleAngle - 90, strokeWidth * 0.3);

  // Tick marks at 300, 400, 500, 600, 700, 800, 850
  const ticks = [300, 400, 500, 600, 700, 750, 800, 850];

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <div style={{ position: "relative", width: size, height: size * 0.72 }}>
        <svg
          width={size}
          height={size * 0.72}
          viewBox={`0 0 ${size} ${size}`}
          style={{ position: "absolute", top: 0, left: 0, overflow: "visible" }}
        >
          {/* Track */}
          <path
            d={arcPath(startAngle, 240, r)}
            fill="none"
            stroke="#E5E7EB"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />

          {/* Colored fill */}
          <path
            d={arcPath(startAngle, 240 * pct, r)}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            style={{ transition: "stroke 0.4s" }}
          />

          {/* Tick marks */}
          {ticks.map((val) => {
            const tickPct = (val - 300) / (850 - 300);
            const angle = startAngle + 240 * tickPct;
            const inner = pt(angle, r - strokeWidth * 0.7);
            const outer = pt(angle, r + strokeWidth * 0.7);
            return (
              <line
                key={val}
                x1={inner.x} y1={inner.y}
                x2={outer.x} y2={outer.y}
                stroke="#D1D5DB"
                strokeWidth={1.5}
              />
            );
          })}

          {/* Needle */}
          <polygon
            points={`${needleTip.x},${needleTip.y} ${needleBase1.x},${needleBase1.y} ${cx},${cy} ${needleBase2.x},${needleBase2.y}`}
            fill={color}
            opacity={0.9}
            style={{ transition: "fill 0.4s" }}
          />

          {/* Center hub */}
          <circle cx={cx} cy={cy} r={strokeWidth * 0.45} fill={color} style={{ transition: "fill 0.4s" }} />
          <circle cx={cx} cy={cy} r={strokeWidth * 0.2} fill="white" />

          {/* Score text */}
          <text
            x={cx}
            y={cy + r * 0.28}
            textAnchor="middle"
            fontSize={size * 0.22}
            fontWeight={800}
            fill="#1F2937"
            fontFamily="system-ui, -apple-system, sans-serif"
          >
            {animated}
          </text>
        </svg>
      </div>

      {showLabel && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          <span
            style={{
              fontSize: size * 0.1,
              fontWeight: 700,
              color,
              padding: "2px 12px",
              borderRadius: 20,
              background: `color-mix(in srgb, ${color} 9%, transparent)`,
              border: `1px solid ${color}40`,
            }}
          >
            {text}
          </span>
          <span style={{ fontSize: size * 0.075, color: "#9CA3AF" }}>out of 850</span>
        </div>
      )}
    </div>
  );
}
