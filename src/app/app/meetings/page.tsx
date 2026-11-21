import Link from "next/link";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { MapPin, Video, Plus, TriangleAlert } from "lucide-react";
import { db } from "@/db";
import { files, meetings, travels } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getT } from "@/i18n/server";
import { canCreateRecord, getLookups } from "@/lib/records";
import { fmtDateTime, pick } from "@/lib/format";
import { EmptyState, PageHeader, TabLinks } from "@/components/ui/layout";
import { Badge, WpChip, type Tone } from "@/components/ui/badge";
import { Modal } from "@/components/ui/dialog";
import { RecordFilters } from "@/components/records/parts";
import { MeetingForm } from "@/components/records/meeting-form";

export const metadata = { title: "Toplantılar" };
const tone: Record<string, Tone> = { planned: "cobalt", held: "ok", cancelled: "outline" };

export default async function MeetingsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const { t, locale } = await getT();
  const kind = sp.kind === "stakeholder" ? "stakeholder" : "internal";
  const L = await getLookups();
  const status = ["planned", "held", "cancelled"].includes(sp.status ?? "") ? (sp.status as "planned") : undefined;
  const [rows, counts, travelRows] = await Promise.all([
    db.select().from(meetings).where(and(eq(meetings.kind, kind), sp.resp ? eq(meetings.responsibleId, sp.resp) : undefined, sp.act ? eq(meetings.activityId, sp.act) : undefined, status ? eq(meetings.status, status) : undefined)).orderBy(desc(meetings.startsAt)),
    db.select({ kind: meetings.kind, n: sql<number>`count(*)::int` }).from(meetings).groupBy(meetings.kind),
    db.select().from(travels).orderBy(desc(travels.departDate)),
  ]);
  const withMinutes = new Set(rows.length ? (await db.select({ id: files.entityId }).from(files).where(and(eq(files.entityType, "meeting"), inArray(files.entityId, rows.map((r) => r.id)), sql`${files.kind} like 'minutes%'`))).map((r) => r.id) : []);
  const now = new Date();
  const upcoming = rows.filter((m) => m.startsAt >= now && m.status !== "cancelled").sort((a, b) => +a.startsAt - +b.startsAt);
  const past = rows.filter((m) => !(m.startsAt >= now && m.status !== "cancelled"));
  const n = (k: string) => counts.find((c) => c.kind === k)?.n ?? 0;
  const mayCreate = canCreateRecord(user, "meeting");

  const Table = ({ list, title }: { list: typeof rows; title: string }) => (
    <section className="mb-8">
      <h2 className="label mb-2">{title} · <span className="num">{list.length}</span></h2>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th className="w-44">{t("ops.startsAt")}</th><th>{t("common.title")}</th><th>{t("common.place")}</th><th>{t("common.responsible")}</th><th>{t("common.linkedActivity")}</th><th>{t("common.status")}</th></tr></thead>
          <tbody>
            {list.map((m) => {
              const missing = m.status !== "cancelled" && m.startsAt < now && (!withMinutes.has(m.id) || !(m.outcomeTr || m.outcomeEn));
              const wp = L.actWp(m.activityId);
              return (
                <tr key={m.id}>
                  <td className="num whitespace-nowrap text-[0.84rem]">{fmtDateTime(locale, m.startsAt, m.timeZone)}{m.timeZone !== "Europe/Istanbul" && <span className="block text-[0.7rem] text-ink-3">{m.timeZone}</span>}</td>
                  <td className="min-w-56"><Link href={`/app/meetings/${m.id}`} className="font-medium underline-offset-2 hover:text-cobalt hover:underline">{pick(locale, m.titleTr, m.titleEn)}</Link>
                    <span className="mt-0.5 block text-[0.8rem] text-ink-3">{t("ops.nParticipants", { n: m.participantIds.length })}</span></td>
                  <td className="text-[0.86rem] text-ink-2"><span className="flex items-center gap-1.5">{m.onlineUrl && !m.location ? <Video className="size-3.5 shrink-0" /> : m.location ? <MapPin className="size-3.5 shrink-0" /> : null}{m.location || (m.onlineUrl ? t("ops.online") : "—")}</span></td>
                  <td className="whitespace-nowrap text-[0.86rem]">{m.responsibleId ? L.personName.get(m.responsibleId) : "—"}</td>
                  <td>{m.activityId ? <span className="flex items-center gap-2">{wp && <WpChip code={wp.code} />}<span className="code">{L.act.get(m.activityId)?.code}</span></span> : <span className="text-ink-3">—</span>}</td>
                  <td><div className="flex flex-col items-start gap-1"><Badge tone={tone[m.status]} dot>{t(`ops.mst.${m.status}`)}</Badge>{missing && <span className="flex items-center gap-1 text-[0.76rem] text-warn"><TriangleAlert className="size-3" />{t("ops.minutesMissing")}</span>}</div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );

  return (
    <>
      <PageHeader eyebrow={t("nav.groupRecords")} title={t("nav.meetings")} description={t("ops.meetingsLede")}
        actions={mayCreate && (
          <Modal trigger={<><Plus className="size-4" />{t("ops.newMeeting")}</>} title={t("ops.newMeeting")} side>
            <MeetingForm t={t} locale={locale} kind={kind} people={L.activePeople} options={L.options} travels={travelRows} defaultResponsible={user.personId} />
          </Modal>
        )} />
      <TabLinks className="mb-5" current={kind} items={[{ key: "internal", href: "/app/meetings", label: t("ops.kind.internalPlural"), count: n("internal") }, { key: "stakeholder", href: "/app/meetings?kind=stakeholder", label: t("ops.kind.stakeholderPlural"), count: n("stakeholder") }]} />
      <RecordFilters t={t} people={L.activePeople} options={L.options} statuses={["planned", "held", "cancelled"]} statusLabel={(s) => t(`ops.mst.${s}`)} current={sp} hidden={kind === "stakeholder" ? { kind } : undefined} />
      {rows.length === 0 ? <EmptyState title={sp.resp || sp.act || sp.status ? t("common.emptyFiltered") : t("common.empty")}>{t("ops.meetingsEmpty")}</EmptyState> : (
        <>
          {upcoming.length > 0 && <Table list={upcoming} title={t("ops.upcoming")} />}
          {past.length > 0 && <Table list={past} title={t("ops.past")} />}
        </>
      )}
    </>
  );
}
