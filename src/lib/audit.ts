import "server-only";
import { db, type Tx } from "@/db";
import { auditLog } from "@/db/schema";

/** Every plan or record revision is stored with user, time, reason and the before/after values. */
export async function audit(
  entry: { userId: string | null; entity: string; entityId?: string | null; action: string; reason?: string | null; before?: unknown; after?: unknown },
  tx?: Tx,
) {
  await (tx ?? db).insert(auditLog).values({
    userId: entry.userId,
    entity: entry.entity,
    entityId: entry.entityId ?? null,
    action: entry.action,
    reason: entry.reason ?? null,
    before: entry.before ?? null,
    after: entry.after ?? null,
  });
}
