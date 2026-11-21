import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Locale } from "@/i18n";
import { fmtMonthYear } from "@/lib/format";
import { buttonClass } from "@/components/ui/button";

/** Calendar-month stepper. `href` builds the link for a "YYYY-MM" key. */
export function MonthNav({ ym, locale, href, currentKey, todayLabel, sub }: { ym: string; locale: Locale; href: (key: string) => string; currentKey: string; todayLabel: string; sub?: React.ReactNode }) {
  const shift = (d: number) => {
    const n = Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1 + d;
    return `${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, "0")}`;
  };
  return (
    <div className="no-print flex flex-wrap items-center gap-1.5">
      <Link href={href(shift(-1))} scroll={false} className={buttonClass("secondary", "sm", "px-1.5")} aria-label="‹"><ChevronLeft className="size-4" /></Link>
      <p className="min-w-36 px-2 text-center font-display text-[1.05rem] font-semibold capitalize">{fmtMonthYear(locale, Number(ym.slice(0, 4)), Number(ym.slice(5, 7)))}</p>
      <Link href={href(shift(1))} scroll={false} className={buttonClass("secondary", "sm", "px-1.5")} aria-label="›"><ChevronRight className="size-4" /></Link>
      {ym !== currentKey && <Link href={href(currentKey)} scroll={false} className={buttonClass("ghost", "sm")}>{todayLabel}</Link>}
      {sub}
    </div>
  );
}
