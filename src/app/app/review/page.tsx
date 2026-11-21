import Link from "next/link";
import { can, requireRole } from "@/lib/auth";
import { listFiles } from "@/lib/files";
import { fmtDate, fmtDuration } from "@/lib/format";
import { canReviewLog, fetchLogs, ownerAccounts, type LogRow } from "@/lib/work";
import { getT } from "@/i18n/server";
import { EmptyState, PageHeader, Stat, TabLinks } from "@/components/ui/layout";
import { Badge } from "@/components/ui/badge";
import { LogLine } from "@/components/work/log-bits";
import { ApproveButton, CancelButton, ReturnButton } from "@/components/work/row-actions";

export const metadata = { title: "İnceleme Kuyruğu" };

export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireRole(can.coordinate);
  const { tab } = await searchParams;
  const { t, locale } = await getT();
  const current = tab === "returned" ? "returned" : tab === "recent" ? "recent" : "queue";
  const all = await fetchLogs(current === "queue" ? { status: "in_review" } : current === "returned" ? { status: "changes_requested", newestFirst: true, limit: 100 } : { status: ["approved", "cancelled"], newestFirst: true, limit: 60 });
  const owners = await ownerAccounts([...new Set(all.map((l) => l.personId))]);
  const mineToReview = all.filter((l) => canReviewLog(user, owners.get(l.personId)!));
  const others = all.filter((l) => !canReviewLog(user, owners.get(l.personId)!));
  const logs = current === "queue" ? mineToReview : all;
  const files = await listFiles("work_log", all.map((l) => l.id));

  // group: person → day
  const groups = new Map<string, { name: string; days: Map<string, LogRow[]> }>();
  for (const l of logs) {
    const g = groups.get(l.personId) ?? { name: l.personName, days: new Map() };
    g.days.set(l.workDate, [...(g.days.get(l.workDate) ?? []), l]);
    groups.set(l.personId, g);
  }
  const totalMin = mineToReview.reduce((a, l) => a + l.minutes, 0);
  const missingEn = mineToReview.filter((l) => { const f = files.get(l.id) ?? []; return f.some((x) => x.lang === "tr") && !f.some((x) => x.lang === "en"); }).length;

  return (
    <>
      <PageHeader eyebrow={t("nav.groupAdmin")} title={t("nav.review")} description={t("work.reviewLede")} />
      {current === "queue" && (
        <div className="mb-7 grid grid-cols-2 gap-x-8 gap-y-5 border-y border-ink py-5 sm:grid-cols-4">
          <Stat label={t("work.qWaiting")} value={mineToReview.length} tone={mineToReview.length ? "cobalt" : undefined} />
          <Stat label={t("work.qTime")} value={fmtDuration(locale, totalMin)} />
          <Stat label={t("work.qPeople")} value={groups.size} />
          <Stat label={t("common.missingEn")} value={missingEn} tone={missingEn ? "warn" : undefined} />
        </div>
      )}
      <TabLinks current={current} items={[{ key: "queue", href: "/app/review", label: t("work.tabQueue") }, { key: "returned", href: "/app/review?tab=returned", label: t("work.tabReturned") }, { key: "recent", href: "/app/review?tab=recent", label: t("work.tabRecent") }]} />

      {logs.length === 0 ? (
        <EmptyState className="mt-6" title={current === "queue" ? t("work.queueEmpty") : t("common.empty")}>{current === "queue" ? t("work.queueEmptyHint") : undefined}</EmptyState>
      ) : (
        <div className="mt-6 flex flex-col gap-6">
          {[...groups.entries()].map(([pid, g]) => {
            const ids = [...g.days.values()].flat().map((l) => l.id);
            const sum = [...g.days.values()].flat().reduce((a, l) => a + l.minutes, 0);
            return (
              <section key={pid} className="panel">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink px-4 py-2.5">
                  <h2 className="font-sans text-[1rem] font-semibold tracking-normal">{g.name} <span className="num ml-2 text-[0.8rem] font-normal text-ink-2">{ids.length} · {fmtDuration(locale, sum)}</span></h2>
                  {current === "queue" && ids.length > 1 && <ApproveButton ids={ids} label={t("work.approveAll", { n: ids.length })} />}
                </div>
                {[...g.days.entries()].map(([d, rows]) => (
                  <div key={d} className="grid border-b border-line last:border-b-0 md:grid-cols-[9.5rem_1fr]">
                    <div className="border-line px-4 py-3 md:border-r">
                      <p className="num text-[0.86rem] font-medium">{fmtDate(locale, d)}</p>
                      <p className="text-[0.78rem] capitalize text-ink-3">{fmtDate(locale, d, { weekday: "long" })}</p>
                      {current === "queue" && rows.length > 1 && <div className="mt-2"><ApproveButton ids={rows.map((r) => r.id)} label={t("work.approveDay")} /></div>}
                    </div>
                    <div className="min-w-0 px-4">
                      {rows.map((l) => (
                        <LogLine key={l.id} log={l} locale={locale} t={t} files={files.get(l.id)} duration={fmtDuration(locale, l.minutes)} href={`/app/work/${l.id}`}
                          actions={current === "queue" ? <><ApproveButton ids={[l.id]} /><ReturnButton id={l.id} /><CancelButton id={l.id} /></> : undefined} />
                      ))}
                    </div>
                  </div>
                ))}
              </section>
            );
          })}
        </div>
      )}

      {current === "queue" && others.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-1 text-lg">{t("work.otherReviewer")}</h2>
          <p className="mb-3 text-[0.88rem] text-ink-2">{t("work.otherReviewerHint")}</p>
          <ul className="panel divide-y divide-line">
            {others.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-[0.88rem]">
                <span className="num text-ink-2">{fmtDate(locale, l.workDate)}</span>
                <span className="font-medium">{l.personName}</span>
                <span className="num">{fmtDuration(locale, l.minutes)}</span>
                <span className="code">{l.actCode}</span>
                {l.personId === user.personId ? <Badge tone="outline">{t("work.ownRecord")}</Badge> : <Link href={`/app/work/${l.id}`} className="text-cobalt hover:underline">{t("common.view")}</Link>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
