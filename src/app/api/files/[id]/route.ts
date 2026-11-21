import { eq } from "drizzle-orm";
import { db } from "@/db";
import { files, workLogs } from "@/db/schema";
import { can, getUser } from "@/lib/auth";

/** File download. Session and document permissions are checked on every request. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const [f] = await db.select().from(files).where(eq(files.id, id));
  if (!f || !f.data) return new Response("Not found", { status: 404 });
  if (!can.fileAccess(user, f.access)) return new Response("Forbidden", { status: 403 });
  // A team member opens work-log evidence only for their own records.
  if (f.entityType === "work_log" && user.role === "member") {
    const [log] = await db.select({ personId: workLogs.personId }).from(workLogs).where(eq(workLogs.id, f.entityId));
    if (log && log.personId !== user.personId) return new Response("Forbidden", { status: 403 });
  }
  if (f.entityType === "payroll" && !can.finance(user)) return new Response("Forbidden", { status: 403 });
  return new Response(new Uint8Array(f.data), {
    headers: {
      "content-type": f.mime,
      "content-length": String(f.data.length),
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
