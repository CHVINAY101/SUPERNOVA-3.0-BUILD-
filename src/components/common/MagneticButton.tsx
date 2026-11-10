import { useRef, useState, useCallback } from "react";
import { Link } from "react-router-dom";

interface MagneticButtonProps {
  to?: string;
  href?: string;
  onClick?: (e: React.MouseEvent) => void;
  children: React.ReactNode;
  variant?: "lime" | "outline";
  className?: string;
  showArrow?: boolean;
  style?: React.CSSProperties;
}

export const MagneticButton: React.FC<MagneticButtonProps> = ({
  to,
  href,
  onClick,
  children,
  variant = "lime",
  className = "",
  showArrow = false,
  style = {},
}) => {
  const btnRef = useRef<HTMLElement | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const dx = e.clientX - centerX;
    const dy = e.clientY - centerY;

    // Max 10px magnetic pull
    const pullX = (dx / (rect.width / 2)) * 8;
    const pullY = (dy / (rect.height / 2)) * 8;

    setOffset({ x: Math.max(-10, Math.min(10, pullX)), y: Math.max(-10, Math.min(10, pullY)) });
  }, []);

  const handleMouseLeave = useCallback(() => {
    setOffset({ x: 0, y: 0 });
  }, []);

  const baseStyle: React.CSSProperties = {
    transform: `translate3d(${offset.x}px, ${offset.y}px, 0)`,
    transition: offset.x === 0 && offset.y === 0 ? "transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)" : "none",
    ...style,
  };

  const btnClass = variant === "lime" ? `btn-magnetic-lime ${className}` : `btn-magnetic-outline ${className}`;

  const content = (
    <>
      <span>{children}</span>
      {showArrow && (
        <svg
          className="arrow-icon"
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="3" y1="8" x2="13" y2="8" />
          <polyline points="8 3 13 8 8 13" />
        </svg>
      )}
    </>
  );

  if (to) {
    return (
      <Link
        ref={(el) => {
          btnRef.current = el;
        }}
        to={to}
        onClick={onClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className={btnClass}
        style={baseStyle}
      >
        {content}
      </Link>
    );
  }

  if (href) {
    return (
      <a
        ref={(el) => {
          btnRef.current = el;
        }}
        href={href}
        onClick={onClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className={btnClass}
        style={baseStyle}
      >
        {content}
      </a>
    );
  }

  return (
    <button
      ref={(el) => {
        btnRef.current = el;
      }}
      type="button"
      onClick={onClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={btnClass}
      style={baseStyle}
    >
      {content}
    </button>
  );
};
