import type { Locale, TFn } from "@/i18n";
import { fmtMoney, fmtNumber } from "@/lib/format";

/** 0.075 → "%7,5" (tr) / "7.5%" (en) */
export const ratioLabel = (locale: Locale, ratio: number) => {
  const n = fmtNumber(locale, ratio * 100, Number.isInteger(Math.round(ratio * 1000) / 10) ? 0 : 1);
  return locale === "tr" ? `%${n}` : `${n}%`;
};

type P = { planMethod: string; fixedRatio: string | null; totalPlannedMinutes: number | null; startProjectMonth: number; endProjectMonth: number; internalTargetMinutes: number | null };

/** "%15 sabit oran" · "139 sa toplam · 3,86 sa/ay ort." · "Bütçesiz destek · 0 € personel maliyeti" */
export function planSummary(p: P, t: TFn, locale: Locale): { main: string; sub?: string } {
  if (p.planMethod === "fixed_ratio") return { main: t("admin.planFixed", { ratio: ratioLabel(locale, Number(p.fixedRatio ?? 0)) }) };
  if (p.planMethod === "hourly") {
    const h = (p.totalPlannedMinutes ?? 0) / 60, months = Math.max(1, p.endProjectMonth - p.startProjectMonth + 1);
    return { main: t("admin.planHourly", { hours: fmtNumber(locale, h, Number.isInteger(h) ? 0 : 1) }), sub: t("admin.planHourlyAvg", { avg: fmtNumber(locale, h / months, 2) }) };
  }
  return { main: t("common.method.non_budget_support"), sub: t("admin.planUnbudgeted", { amount: fmtMoney(locale, 0) }) };
}
