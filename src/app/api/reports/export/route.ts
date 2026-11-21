import { getUser } from "@/lib/auth";
import { buildReport, resolveReportRequest } from "@/lib/report-data";
import { reportToDocx, reportToXlsx } from "@/lib/report-export";
import { getFrame } from "@/lib/structure";
import { getT } from "@/i18n/server";

/** Report export in the interface language. Same permission rules as the screen, checked on every request. */
export async function GET(req: Request) {
  const user = await getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const q = new URL(req.url).searchParams;
  const m = /^(\d{4})-(\d{2})$/.exec(q.get("m") ?? "");
  const format = q.get("format");
  if (!m || +m[2] < 1 || +m[2] > 12 || (format !== "xlsx" && format !== "docx")) return new Response("Bad request", { status: 400 });
  const { wps } = await getFrame();
  const request = resolveReportRequest(user, { view: q.get("view") ?? undefined, year: +m[1], month: +m[2], person: q.get("person") ?? undefined, wp: q.get("wp") ?? undefined }, wps[0].id);
  if (!request) return new Response("Forbidden", { status: 403 });
  const { t, locale } = await getT();
  const doc = await buildReport(request, locale, t);
  if (!doc) return new Response("Not found", { status: 404 });
  const buf = format === "xlsx" ? await reportToXlsx(doc, t("common.empty")) : await reportToDocx(doc, t("common.empty"));
  const name = `${doc.fileName}_${locale.toUpperCase()}.${format}`;
  return new Response(new Uint8Array(buf), {
    headers: {
      "content-type": format === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
      "cache-control": "private, no-store",
    },
  });
}
