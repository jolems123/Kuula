import { useEffect, useRef, useState } from "react";

interface Props {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  duration?: number;
  style?: React.CSSProperties;
  className?: string;
}

export function AnimatedStat({
  value,
  prefix = "",
  suffix = "",
  decimals = 0,
  duration = 900,
  style,
  className,
}: Props) {
  const [display, setDisplay] = useState(0);
  const prevRef = useRef(0);

  useEffect(() => {
    const from = prevRef.current;
    const to = value;
    const start = Date.now();

    const frame = () => {
      const elapsed = Date.now() - start;
      const t = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      const current = from + (to - from) * ease;
      setDisplay(current);
      if (t < 1) requestAnimationFrame(frame);
      else prevRef.current = to;
    };

    requestAnimationFrame(frame);
  }, [value, duration]);

  const formatted = display.toLocaleString("en-UG", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return (
    <span style={style} className={className}>
      {prefix}{formatted}{suffix}
    </span>
  );
}
