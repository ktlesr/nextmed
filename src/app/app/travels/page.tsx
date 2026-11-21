import Link from "next/link";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { Plus, TriangleAlert } from "lucide-react";
import { db } from "@/db";
import { files, travels } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getT } from "@/i18n/server";
import { canCreateRecord, getLookups } from "@/lib/records";
import { diffDays } from "@/lib/dates";
import { fmtDate, pick } from "@/lib/format";
import { EmptyState, PageHeader } from "@/components/ui/layout";
import { Badge, WpChip, type Tone } from "@/components/ui/badge";
import { Modal } from "@/components/ui/dialog";
import { RecordFilters } from "@/components/records/parts";
import { TravelForm } from "@/components/records/travel-form";

export const metadata = { title: "Seyahatler" };
const tone: Record<string, Tone> = { planned: "cobalt", completed: "ok", cancelled: "outline" };

export default async function TravelsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const { t, locale } = await getT();
  const L = await getLookups();
  const status = (["planned", "completed", "cancelled"] as const).find((s) => s === sp.status);
  const rows = await db.select().from(travels).where(and(sp.resp ? eq(travels.responsibleId, sp.resp) : undefined, sp.act ? eq(travels.activityId, sp.act) : undefined, status ? eq(travels.status, status) : undefined)).orderBy(desc(travels.departDate));
  const reportFiles = new Set(rows.length ? (await db.select({ id: files.entityId }).from(files).where(and(eq(files.entityType, "travel"), inArray(files.entityId, rows.map((r) => r.id)), sql`${files.kind} like 'report%'`))).map((r) => r.id) : []);
  const fileCount = new Map((rows.length ? await db.select({ id: files.entityId, n: sql<number>`count(*)::int` }).from(files).where(and(eq(files.entityType, "travel"), inArray(files.entityId, rows.map((r) => r.id)))).groupBy(files.entityId) : []).map((r) => [r.id, r.n]));

  return (
    <>
      <PageHeader eyebrow={t("nav.groupRecords")} title={t("nav.travels")} description={t("ops.travelsLede")}
        actions={canCreateRecord(user, "travel") && (
          <Modal trigger={<><Plus className="size-4" />{t("ops.newTravel")}</>} title={t("ops.newTravel")} side>
            <TravelForm t={t} locale={locale} people={L.activePeople} options={L.options} defaultResponsible={user.personId} />
          </Modal>
        )} />
      <RecordFilters t={t} people={L.activePeople} options={L.options} statuses={["planned", "completed", "cancelled"]} statusLabel={(s) => t(`ops.tst.${s}`)} current={sp} />
      {rows.length === 0 ? <EmptyState title={sp.resp || sp.act || sp.status ? t("common.emptyFiltered") : t("common.empty")}>{t("ops.travelsEmpty")}</EmptyState> : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th className="w-52">{t("ops.dates")}</th><th>{t("ops.purpose")}</th><th>{t("common.place")}</th><th>{t("common.participants")}</th><th>{t("common.linkedActivity")}</th><th className="r">{t("common.files")}</th><th>{t("common.status")}</th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const wp = L.actWp(r.activityId);
                const noReport = r.status === "completed" && !(r.reportTr || r.reportEn) && !reportFiles.has(r.id);
                return (
                  <tr key={r.id}>
                    <td className="num whitespace-nowrap text-[0.84rem]">{fmtDate(locale, r.departDate)} – {fmtDate(locale, r.returnDate)}<span className="block text-[0.72rem] text-ink-3">{t("ops.nDays", { n: diffDays(r.departDate, r.returnDate) + 1 })}</span></td>
                    <td className="min-w-56"><Link href={`/app/travels/${r.id}`} className="font-medium underline-offset-2 hover:text-cobalt hover:underline">{pick(locale, r.purposeTr, r.purposeEn)}</Link></td>
                    <td className="text-[0.88rem]">{r.place || "—"}</td>
                    <td className="text-[0.86rem] text-ink-2">{r.participantIds.map((p) => L.personName.get(p)).filter(Boolean).join(", ") || "—"}</td>
                    <td>{r.activityId ? <span className="flex items-center gap-2">{wp && <WpChip code={wp.code} />}<span className="code">{L.act.get(r.activityId)?.code}</span></span> : <span className="text-ink-3">—</span>}</td>
                    <td className="r num text-[0.84rem]">{fileCount.get(r.id) ?? 0}</td>
                    <td><div className="flex flex-col items-start gap-1"><Badge tone={tone[r.status]} dot>{t(`ops.tst.${r.status}`)}</Badge>{noReport && <span className="flex items-center gap-1 text-[0.76rem] text-warn"><TriangleAlert className="size-3" />{t("ops.reportMissing")}</span>}</div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
