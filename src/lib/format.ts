import type { Locale } from "@/i18n";

const fmtLocale = (l: Locale) => (l === "tr" ? "tr-TR" : "en-GB");

/** Pick the text for the interface language, falling back to the source text. */
export const pick = (locale: Locale, tr?: string | null, en?: string | null): string =>
  (locale === "tr" ? tr || en : en || tr) ?? "";
/** True when the requested language is missing and the source text is being shown instead. */
export const isFallback = (locale: Locale, tr?: string | null, en?: string | null) =>
  locale === "tr" ? !tr && !!en : !en && !!tr;

export const fmtDate = (locale: Locale, iso?: string | null, opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", year: "numeric" }) =>
  iso ? new Intl.DateTimeFormat(fmtLocale(locale), { timeZone: "UTC", ...opts }).format(new Date(iso.length === 10 ? iso + "T00:00:00Z" : iso)) : "—";
export const fmtDateTime = (locale: Locale, d?: Date | string | null, timeZone = "Europe/Istanbul") =>
  d ? new Intl.DateTimeFormat(fmtLocale(locale), { timeZone, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(d)) : "—";
export const fmtMonthYear = (locale: Locale, year: number, month1: number) =>
  new Intl.DateTimeFormat(fmtLocale(locale), { timeZone: "UTC", month: "long", year: "numeric" }).format(new Date(Date.UTC(year, month1 - 1, 1)));
export const fmtNumber = (locale: Locale, n: number, digits = 0) =>
  new Intl.NumberFormat(fmtLocale(locale), { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
const CURRENCY_SIGN: Record<string, string> = { EUR: "€", TRY: "₺", USD: "$", GBP: "£" };
/** Turkish convention puts the sign after the amount: 430.800,00 € */
export const fmtMoney = (locale: Locale, n: number | string | null | undefined, currency = "EUR") => {
  if (n == null || n === "") return "—";
  if (locale === "tr") return `${fmtNumber(locale, Number(n), 2)} ${CURRENCY_SIGN[currency] ?? currency}`;
  return new Intl.NumberFormat(fmtLocale(locale), { style: "currency", currency, minimumFractionDigits: 2 }).format(Number(n));
};
export const fmtPercent = (locale: Locale, ratio: number, digits = 0) =>
  new Intl.NumberFormat(fmtLocale(locale), { style: "percent", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(ratio);

/** 90 → "1 sa 30 dk" / "1 h 30 min" */
export function fmtDuration(locale: Locale, minutes: number): string {
  const h = Math.floor(minutes / 60), m = minutes % 60;
  const [hu, mu] = locale === "tr" ? ["sa", "dk"] : ["h", "min"];
  if (h && m) return `${h} ${hu} ${m} ${mu}`;
  if (h) return `${h} ${hu}`;
  return `${m} ${mu}`;
}
/** Decimal hours, e.g. 8,30 sa */
export const fmtHours = (locale: Locale, minutes: number, digits = 1) => `${fmtNumber(locale, minutes / 60, digits)} ${locale === "tr" ? "sa" : "h"}`;
export const fmtCentiHours = (locale: Locale, centi: number) => `${fmtNumber(locale, centi / 100, 2)} ${locale === "tr" ? "sa" : "h"}`;

export const monthLabel = (locale: Locale, n: number) => (locale === "tr" ? `Ay ${n}` : `M${n}`);
export function monthsLabel(locale: Locale, months: number[]): string {
  if (!months.length) return "—";
  const sorted = [...months].sort((a, b) => a - b);
  const runs: string[] = [];
  let s = sorted[0], p = sorted[0];
  for (let i = 1; i <= sorted.length; i++) {
    const m = sorted[i];
    if (m === p + 1) { p = m; continue; }
    runs.push(s === p ? `${s}` : `${s}–${p}`);
    s = p = m;
  }
  return `${locale === "tr" ? "Ay" : "M"} ${runs.join(", ")}`;
}
export const initials = (name: string) => name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toLocaleUpperCase("tr");
