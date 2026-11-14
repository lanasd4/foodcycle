import { cn } from "@/lib/utils";

/**
 * FoodCycle logo.
 * Mark: a green tile with a cycle arrow (food that comes back around instead
 * of going to waste) wrapped around a saffron leaf/grain (fresh food).
 * Colors come from design tokens, so the logo follows light/dark themes.
 */

type LogoMarkProps = {
  size?: number;
  className?: string;
  /** "tile" = filled square (default), "plain" = mark only, inherits currentColor */
  tone?: "tile" | "plain";
  title?: string;
};

export function LogoMark({ size = 40, className, tone = "tile", title = "FoodCycle" }: LogoMarkProps) {
  const ring = tone === "tile" ? "var(--logo-ring)" : "currentColor";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role="img"
      aria-label={title}
      className={cn("shrink-0", className)}
    >
      {tone === "tile" && <rect width="48" height="48" rx="13" fill="var(--logo-tile)" />}
      {/* cycle ring with a gap at the bottom */}
      <path
        d="M17.5 35.26 A13 13 0 1 1 30.5 35.26"
        fill="none"
        stroke={ring}
        strokeWidth="3.6"
        strokeLinecap="round"
      />
      {/* arrow head */}
      <path d="M27.6 37 L32.9 37.3 L29.9 32.2 Z" fill={ring} stroke={ring} strokeWidth="1.2" strokeLinejoin="round" />
      {/* leaf */}
      <g transform="rotate(40 24 24)">
        <path d="M24 17 C29.4 20.2 29.4 27.8 24 31 C18.6 27.8 18.6 20.2 24 17 Z" fill="var(--logo-leaf)" />
        <path d="M24 19.5 V28.6" stroke="var(--logo-vein)" strokeWidth="1.3" strokeLinecap="round" />
      </g>
    </svg>
  );
}

type LogoProps = {
  size?: number;
  className?: string;
  /** show the Arabic tagline under the wordmark */
  withTagline?: boolean;
};

export function Logo({ size = 40, className, withTagline = false }: LogoProps) {
  return (
    <span dir="ltr" className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark size={size} />
      <span className="flex flex-col leading-none">
        <span className="font-bold tracking-tight" style={{ fontSize: size * 0.55 }}>
          <span className="text-foreground">Food</span>
          <span className="text-primary">Cycle</span>
        </span>
        {withTagline && (
          <span dir="rtl" className="mt-1 text-muted-foreground" style={{ fontSize: Math.max(11, size * 0.27) }}>
            كل وجبة تستحق فرصة ثانية
          </span>
        )}
      </span>
    </span>
  );
}
