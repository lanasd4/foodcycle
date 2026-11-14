import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Arabic-friendly number formatting (Latin digits, as decided in DESIGN.md) */
export function formatKg(kg: number) {
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(kg)} كغ`;
}

/** "1:05 س" / "45 د" — compact remaining-time label */
export function formatRemaining(minutes: number) {
  if (minutes <= 0) return "انتهى";
  if (minutes < 60) return `${minutes} د`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} س` : `${h}:${String(m).padStart(2, "0")} س`;
}
