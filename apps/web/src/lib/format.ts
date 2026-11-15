/** Arabic formatting with Latin digits (DESIGN.md: numbers are 0-9 everywhere). */
const LOCALE = 'ar-u-nu-latn';

const time = new Intl.DateTimeFormat(LOCALE, { hour: 'numeric', minute: '2-digit' });
const dateShort = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short' });
const dateTime = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const relative = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' });
const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

export const fmtTime = (d: string | Date) => time.format(new Date(d));
export const fmtDate = (d: string | Date) => dateShort.format(new Date(d));
export const fmtDateTime = (d: string | Date) => dateTime.format(new Date(d));
export const fmtNumber = (n: number) => number.format(n);
export const fmtKg = (n: number) => `${number.format(n)} كغ`;

/** "منذ 5 دقائق" / "بعد ساعتين" */
export function fmtRelative(d: string | Date, now = Date.now()) {
  const diff = (new Date(d).getTime() - now) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return relative.format(Math.round(diff), 'second');
  if (abs < 3600) return relative.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return relative.format(Math.round(diff / 3600), 'hour');
  return relative.format(Math.round(diff / 86400), 'day');
}

/** mm:ss or h:mm:ss countdown */
export function fmtCountdown(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (x: number) => String(x).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

/** Value for <input type="datetime-local"> in the user's local time */
export function toLocalInput(d: Date) {
  const pad = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const ORG_TYPE_LABEL: Record<string, string> = {
  RESTAURANT: 'مطعم',
  HOTEL: 'فندق',
  BAKERY: 'مخبز',
  GROCERY: 'متجر غذائي',
  CHARITY: 'جمعية خيرية',
  HUMANITARIAN: 'مؤسسة إنسانية',
};
