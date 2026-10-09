type BrandMarkProps = {
  compact?: boolean;
  className?: string;
};

/** The small trail-and-sun mark used throughout I Know a Spot. */
export function BrandMark({ compact = false, className }: BrandMarkProps) {
  return (
    <div className={className ? `brand-mark ${className}` : "brand-mark"}>
      <svg
        aria-hidden="true"
        className="brand-mark__icon"
        viewBox="0 0 48 48"
        focusable="false"
        role="img"
      >
        <path className="brand-mark__sun" d="M32.5 8.5a7.5 7.5 0 1 1-7.5 7.5 7.5 7.5 0 0 1 7.5-7.5Z" />
        <path className="brand-mark__trail" d="M8 35.5c8.5-1.1 12.1-5.4 14.2-12.4 1.3-4.4 3.9-7.2 8.2-8.5" />
        <path className="brand-mark__leaf" d="M11.5 35.1c.3-5.1 3.2-8.2 8.2-9.2-1.1 4.9-3.8 8-8.2 9.2Z" />
        <path className="brand-mark__ground" d="M7 39.5h34" />
      </svg>
      {!compact && <span className="brand-mark__name">I Know a Spot</span>}
      {compact && <span className="sr-only">I Know a Spot</span>}
    </div>
  );
}

export type { BrandMarkProps };
