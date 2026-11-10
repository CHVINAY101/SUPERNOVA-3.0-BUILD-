import React from "react";

interface RollingNumeralProps {
  value: number;
  padLength?: number;
  className?: string;
  color?: string;
  fontSizeDesktop?: number;
  fontSizeMobile?: number;
}

/**
 * Rock-solid tabular numeral renderer.
 * Eliminates jitter, vertical shifting, and layout pop by enforcing fixed-width tabular numbers.
 */
export const RollingNumeral: React.FC<RollingNumeralProps> = ({
  value,
  padLength = 2,
  className = "",
  color = "#151535",
}) => {
  const formatted = String(Math.max(0, value)).padStart(padLength, "0");

  return (
    <span
      className={`inline-block font-mono tabular-nums leading-none select-none text-center ${className}`}
      style={{
        fontVariantNumeric: "tabular-nums",
        fontFeatureSettings: '"tnum" 1',
        color,
      }}
    >
      {formatted}
    </span>
  );
};
