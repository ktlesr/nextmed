import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import type { Locale, TFn } from "@/i18n";
import type { FileMeta } from "@/lib/files";
import { isFallback, pick } from "@/lib/format";
import type { LogRow } from "@/lib/work";
import { Badge, LangTag, WpChip, workLogTone } from "@/components/ui/badge";
import { FileList } from "@/components/ui/evidence";
import { cn } from "@/lib/cn";

export function StatusBadge({ status, t }: { status: string; t: TFn }) {
  return <Badge tone={workLogTone[status] ?? "neutral"} dot>{t(`common.st.${status}`)}</Badge>;
}

/** WP › activity › sub-activity locator of a record. */
export function ChainLine({ log, locale, className }: { log: LogRow; locale: Locale; className?: string }) {
  return (
    <p className={cn("flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[0.84rem] text-ink-2", className)}>
      <WpChip code={log.wpCode} />
      <span className="min-w-0"><span className="code">{log.actCode}</span> {pick(locale, log.actTr, log.actEn)}</span>
      {log.subCode && <span className="min-w-0 text-ink-3"><span className="code">{log.subCode}</span></span>}
    </p>
  );
}

/** Description in the interface language; the source text and a tag are shown while the translation is pending. */
export function Description({ log, locale, t, className }: { log: LogRow; locale: Locale; t: TFn; className?: string }) {
  const fb = isFallback(locale, log.descriptionTr, log.descriptionEn);
  return (
    <p className={cn("whitespace-pre-line text-[0.93rem]", className)}>
      {pick(locale, log.descriptionTr, log.descriptionEn)}
      {fb && <span className="ml-2 inline-flex items-center gap-1 align-middle text-[0.74rem] text-warn" title={t("common.sourceShown")}><LangTag lang={log.sourceLang} />{t("common.translationPending")}</span>}
    </p>
  );
}

export function OutsidePlanFlag({ t }: { t: TFn }) {
  return <span className="inline-flex items-center gap-1 text-[0.76rem] text-warn"><TriangleAlert className="size-3.5" />{t("work.outsidePlan")}</span>;
}

/** One record as a ledger line: duration | what | status + actions. */
export function LogLine({ log, locale, t, files, duration, actions, showPerson, href }: { log: LogRow; locale: Locale; t: TFn; files?: FileMeta[]; duration: string; actions?: React.ReactNode; showPerson?: boolean; href?: string }) {
  return (
    <div className="grid grid-cols-[4.6rem_1fr] gap-x-4 gap-y-2 border-b border-line py-3 last:border-b-0 md:grid-cols-[4.6rem_1fr_auto]">
      <p className="num pt-0.5 text-[0.95rem] font-medium">{duration}</p>
      <div className="min-w-0">
        {showPerson && <p className="mb-0.5 text-[0.86rem] font-semibold">{log.personName}</p>}
        <ChainLine log={log} locale={locale} />
        {log.subCode && <p className="mt-0.5 line-clamp-1 text-[0.8rem] text-ink-3">{pick(locale, log.subTr, log.subEn)}</p>}
        {href ? <Link href={href} className="mt-1.5 block hover:text-cobalt"><Description log={log} locale={locale} t={t} className="line-clamp-3" /></Link> : <Description log={log} locale={locale} t={t} className="mt-1.5" />}
        {log.reviewNote && (log.status === "changes_requested" || log.status === "cancelled") && (
          <p className="mt-2 border-l-2 border-warn pl-2.5 text-[0.85rem] text-ink-2"><span className="label mr-2 text-warn">{t("work.reviewNote")}</span>{log.reviewNote}</p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          {files && files.length > 0 && <FileList files={files} t={t} compact className="flex-row flex-wrap gap-x-3" />}
          {log.outsidePlanWindow && <OutsidePlanFlag t={t} />}
        </div>
      </div>
      <div className="col-start-2 flex flex-wrap items-start gap-2 md:col-start-3 md:flex-col md:items-end">
        <StatusBadge status={log.status} t={t} />
        {actions && <div className="no-print flex flex-wrap items-center gap-1.5 md:justify-end">{actions}</div>}
      </div>
    </div>
  );
}
