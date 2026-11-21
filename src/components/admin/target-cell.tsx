import type { TargetSpec } from "@/db/schema";
import type { Locale, TFn } from "@/i18n";
import type { Actual } from "@/lib/adminOutputs";
import { fmtDate, fmtNumber } from "@/lib/format";
import { Badge, type Tone } from "@/components/ui/badge";
import { Meter } from "@/components/ui/layout";

/** How firm a figure is — shown beside every target so 23 "indicative" buildings never read like 8 planned ones. */
export function specBadge(spec: TargetSpec, t: TFn): { label: string; tone: Tone } | null {
  if (spec.kind === "contribution") return { label: t("outputs.k.contribution"), tone: "turq" };
  if (spec.kind === "not_specified") return { label: t("outputs.k.not_specified"), tone: "outline" };
  if (spec.kind === "conditional") return { label: t("outputs.k.conditional"), tone: "warn" };
  if (spec.kind === "coverage") return { label: t("outputs.k.coverage"), tone: "cobalt" };
  if (spec.qualifier === "approximate") return { label: t("outputs.q.approximate"), tone: "warn" };
  if (spec.qualifier === "greater_than") return { label: t("outputs.q.greater_than"), tone: "cobalt" };
  if (spec.qualifier === "indicative") return { label: t("outputs.q.indicative"), tone: "warn" };
  if (spec.qualifier === "planned") return { label: t("outputs.q.planned"), tone: "cobalt" };
  if (spec.qualifier === "if_assigned") return { label: t("outputs.k.conditional"), tone: "warn" };
  return null;
}

export const unitLabel = (t: TFn, unit: string | null | undefined) => {
  if (!unit) return "";
  const key = `outputs.u.${unit}`, label = t(key);
  return label === key ? unit : label;
};

export function fmtValue(locale: Locale, n: number) {
  return fmtNumber(locale, n, Number.isInteger(n) ? 0 : 2);
}

/** One target column: commitment text, firmness, and the cumulative actual (blank until a record exists). */
export function TargetCell({ spec, actual, t, locale, large }: { spec: TargetSpec; actual?: Actual; t: TFn; locale: Locale; large?: boolean }) {
  const badge = specBadge(spec, t);
  const numeric = spec.value != null && spec.kind !== "contribution" && spec.kind !== "not_specified";
  const has = !!actual && actual.records > 0;
  return (
    <div className="min-w-0">
      <p className={large ? "text-[1.02rem]" : undefined}>{locale === "tr" ? spec.display_tr : spec.display_en}</p>
      {badge && <div className="mt-1.5"><Badge tone={badge.tone}>{badge.label}</Badge></div>}
      <div className="mt-2.5 border-t border-dashed border-line pt-2">
        {!has ? (
          <p className="label flex items-baseline justify-between gap-2"><span>{t("outputs.actual")}</span><span className="num text-ink-3">—</span></p>
        ) : numeric ? (
          <>
            <p className="flex items-baseline justify-between gap-2">
              <span className="label">{t("outputs.actual")}</span>
              <span className="num text-[0.9rem]"><span className="font-medium text-ink">{fmtValue(locale, actual!.sum)}</span><span className="text-ink-3"> / {spec.qualifier === "approximate" ? "≈ " : spec.qualifier === "greater_than" ? "> " : ""}{fmtValue(locale, spec.value!)} {unitLabel(t, spec.unit)}</span></span>
            </p>
            <Meter value={actual!.sum} max={spec.value!} tone={actual!.sum >= spec.value! ? "ok" : "turq"} className="mt-1.5" label={t("outputs.actual")} />
            {actual!.sum > spec.value! && <p className="num mt-1 text-[0.74rem] text-ok">+{fmtValue(locale, actual!.sum - spec.value!)} {t("outputs.aboveTarget")}</p>}
          </>
        ) : (
          <p className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
            <span className="label">{t("outputs.actual")}</span>
            <span className="text-[0.84rem]">
              {actual!.counted > 0 && <span className="num font-medium">{fmtValue(locale, actual!.sum)} </span>}
              {actual!.lastStatus ? <Badge tone={actual!.lastStatus === "completed" || actual!.lastStatus === "contributed" ? "ok" : "cobalt"}>{t(`outputs.os.${actual!.lastStatus}`)}</Badge> : <span className="text-ink-2">{t("outputs.nRecords", { n: actual!.records })}</span>}
              <span className="num ml-1.5 text-[0.74rem] text-ink-3">{fmtDate(locale, actual!.lastOn)}</span>
            </span>
          </p>
        )}
      </div>
    </div>
  );
}
