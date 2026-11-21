import Link from "next/link";
import { and, desc, eq, sql } from "drizzle-orm";
import { FileSpreadsheet, FileText } from "lucide-react";
import { db } from "@/db";
import { documents } from "@/db/schema";
import { can, requireUser } from "@/lib/auth";
import { todayInIstanbul } from "@/lib/dates";
import { listFiles } from "@/lib/files";
import { fmtDateTime } from "@/lib/format";
import { buildReport, resolveReportRequest, type Cell, type Section } from "@/lib/report-data";
import { getFrame, getPeople } from "@/lib/structure";
import { parseYM } from "@/lib/work";
import { getT } from "@/i18n/server";
import type { TFn } from "@/i18n";
import { Badge, workLogTone } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { FileList } from "@/components/ui/evidence";
import { DefList, EmptyState, Notice, PageHeader, Stat, TabLinks } from "@/components/ui/layout";
import { MonthNav } from "@/components/work/month-nav";
import { PersonPicker, PrintButton, StoreReportForm } from "@/components/work/report-controls";
import { cn } from "@/lib/cn";

export const metadata = { title: "Aylık Raporlama" };

function CellView({ c, t, nowrap }: { c: Cell; t: TFn; nowrap?: boolean }) {
  if (typeof c === "string") return <span className={nowrap ? "whitespace-nowrap" : "whitespace-pre-line"}>{c}</span>;
  if (c.files) return c.files.length ? <FileList files={c.files} t={t} compact /> : <span className="text-ink-3">—</span>;
  if (c.status) return <Badge tone={workLogTone[c.status] ?? "neutral"} dot>{c.text}</Badge>;
  if (c.tone) return <Badge tone={c.tone}>{c.text}</Badge>;
  return <span className={cn(nowrap ? "whitespace-nowrap" : "whitespace-pre-line", c.strong && "font-semibold")}>{c.text}</span>;
}

function SectionView({ s, t }: { s: Section; t: TFn }) {
  const tb = s.table;
  return (
    <section className="mt-9 break-inside-avoid-page">
      <h2 className="flex items-baseline gap-2.5 text-[1.25rem]">{s.code && <span className="code text-[0.85rem]">{s.code}</span>}{s.heading}</h2>
      {s.note && <p className="mt-1 text-[0.84rem] text-ink-3">{s.note}</p>}
      {!tb || tb.rows.length === 0 ? <p className="mt-3 border-t border-line pt-3 text-[0.9rem] text-ink-3">{s.empty ?? t("common.empty")}</p> : (
        <div className="tbl-wrap mt-3">
          <table className="tbl">
            <thead><tr>{tb.head.map((h, i) => <th key={i} className={cn(h.align === "r" && "r", h.wide && "min-w-64")}>{h.label}</th>)}</tr></thead>
            <tbody>
              {tb.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={cn(tb.head[j]?.align === "r" && "r", tb.head[j]?.mono && "num whitespace-nowrap text-[0.84rem]")}><CellView c={c} t={t} nowrap={tb.head[j]?.mono} /></td>)}</tr>)}
            </tbody>
            {tb.foot && <tfoot>{tb.foot.map((r, i) => <tr key={i} className="bg-surface-2/60">{r.map((c, j) => <td key={j} className={cn("border-t border-line", tb.head[j]?.align === "r" && "r", j > 0 && "num")}><CellView c={c} t={t} nowrap /></td>)}</tr>)}</tfoot>}
          </table>
        </div>
      )}
    </section>
  );
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ m?: string; view?: string; person?: string; wp?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const [{ t, locale }, { wps }, persons] = await Promise.all([getT(), getFrame(), getPeople()]);
  const today = todayInIstanbul();
  const ym = parseYM(sp.m, today);
  const team = can.seeTeam(user);
  // A team member always lands on their own personal report, whatever the URL says.
  const wanted = team ? sp : { view: "person", person: user.personId ?? undefined };
  const request = resolveReportRequest(user, { view: wanted.view, year: ym.year, month: ym.month, person: wanted.person || (team && !user.personId ? persons[0]?.id : undefined), wp: sp.wp }, wps[0].id);
  const doc = request ? await buildReport(request, locale, t) : null;

  const qs = (o: Record<string, string | null | undefined>) => {
    const base: Record<string, string | null | undefined> = { m: ym.key === today.slice(0, 7) ? null : ym.key, view: request?.view === "person" ? null : request?.view, person: request?.view === "person" && team ? request.personId : null, wp: request?.view === "wp" ? request.wpId : null, ...o };
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(base)) if (v) q.set(k, v);
    return q.toString();
  };
  const href = (o: Record<string, string | null | undefined>) => { const s = qs(o); return `/app/reports${s ? `?${s}` : ""}`; };
  const exportHref = (format: string) => `/api/reports/export?${qs({ m: ym.key, view: request?.view, format })}`;

  const stored = doc
    ? await db.select().from(documents).where(and(eq(documents.category, "reports"), sql`${documents.meta}->>'kind' = 'monthly_report'`, sql`(${documents.meta}->>'year')::int = ${doc.year}`, sql`(${documents.meta}->>'month')::int = ${doc.month}`, sql`${documents.meta}->>'scope' = ${doc.scopeKey}`)).orderBy(desc(documents.createdAt)).limit(6)
    : [];
  const storedFiles = await listFiles("document", stored.map((d) => d.id));

  return (
    <>
      <PageHeader eyebrow={t("nav.groupDaily")} title={t("nav.reports")} description={t("reports.lede")}
        actions={<MonthNav ym={ym.key} locale={locale} currentKey={today.slice(0, 7)} todayLabel={t("work.thisMonth")} href={(k) => href({ m: k === today.slice(0, 7) ? null : k })} />} />

      {team && (
        <TabLinks current={request?.view ?? "person"} items={[
          { key: "person", href: href({ view: null, wp: null, person: user.personId }), label: t("reports.viewPerson") },
          { key: "wp", href: href({ view: "wp", person: null }), label: t("reports.viewWp") },
          { key: "general", href: href({ view: "general", person: null, wp: null }), label: t("reports.viewGeneral") },
        ]} />
      )}

      <div className="no-print mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {team && request?.view === "person" && <PersonPicker people={persons.map((p) => ({ id: p.id, name: p.fullName }))} value={request.personId ?? ""} hrefBase={`/app/reports?${qs({ person: null }) || "x=1"}`} />}
          {request?.view === "wp" && wps.map((w) => <Link key={w.id} href={href({ wp: w.id })} scroll={false} className={buttonClass(request.wpId === w.id ? "primary" : "secondary", "sm", "num")}>{w.code}</Link>)}
        </div>
        {doc && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="label mr-1">{t("reports.export")} · {locale.toUpperCase()}</span>
            <a href={exportHref("docx")} className={buttonClass("secondary", "sm")}><FileText className="size-3.5" />Word</a>
            <a href={exportHref("xlsx")} className={buttonClass("secondary", "sm")}><FileSpreadsheet className="size-3.5" />Excel</a>
            <PrintButton />
          </div>
        )}
      </div>

      {!doc ? (
        <EmptyState className="mt-6" title={t("reports.noReport")}>{t("reports.noReportHint")}</EmptyState>
      ) : (
        <article className="mt-6">
          <div className="panel p-5 sm:p-7">
            <p className="label">{doc.subtitle}</p>
            <h2 className="mt-2 text-[1.7rem]">{doc.title}</h2>
            <p className="mt-1 font-display text-lg capitalize text-cobalt">{doc.period}</p>
            <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_1.3fr]">
              <DefList items={doc.meta.map(([k, v]) => [k, v])} />
              <div className="grid grid-cols-2 gap-x-6 gap-y-6 border-line lg:border-l lg:pl-8">
                {doc.stats.map((s) => <Stat key={s.label} label={s.label} value={s.value} sub={s.sub} tone={s.tone} />)}
              </div>
            </div>
          </div>

          {doc.sections.map((s, i) => <SectionView key={i} s={s} t={t} />)}

          <section className="no-print mt-10 border-t border-ink pt-5">
            <h2 className="text-[1.15rem]">{t("reports.storedTitle")}</h2>
            <p className="mt-1 max-w-[70ch] text-[0.88rem] text-ink-2">{t("reports.storedLede")}</p>
            {stored.length > 0 && (
              <ul className="mt-4 flex flex-col gap-2">
                {stored.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line pb-2 text-[0.88rem]">
                    <span className="num text-ink-2">v{d.version}</span>
                    {d.isCurrent && <Badge tone="ok">{t("reports.current")}</Badge>}
                    <FileList files={storedFiles.get(d.id)} t={t} compact flagMissing={false} />
                    <span className="num text-[0.76rem] text-ink-3">{fmtDateTime(locale, d.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4">
              {!can.coordinate(user) ? null : doc.monthState === "closed" ? <StoreReportForm m={ym.key} view={doc.view} person={request?.personId} wp={request?.wpId} /> : (
                <Notice tone="cobalt">{t("reports.storeNeedsClose")} <Link href={`/app/admin/workload?m=${ym.key}`} className="font-medium text-ink underline underline-offset-2">{t("nav.workload")} →</Link></Notice>
              )}
            </div>
          </section>
        </article>
      )}
    </>
  );
}
