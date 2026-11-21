/** Shape returned by every server action used with useActionState. */
export type ActionState = { ok: boolean; message?: string; error?: string; fieldErrors?: Record<string, string>; data?: Record<string, unknown> } | null;
export const ok = (message?: string, data?: Record<string, unknown>): ActionState => ({ ok: true, message, data });
export const fail = (error: string, fieldErrors?: Record<string, string>): ActionState => ({ ok: false, error, fieldErrors });
export const str = (fd: FormData, key: string) => { const v = fd.get(key); return typeof v === "string" ? v.trim() : ""; };
export const optStr = (fd: FormData, key: string) => str(fd, key) || null;
export const optNum = (fd: FormData, key: string) => { const v = str(fd, key).replace(",", "."); return v === "" || Number.isNaN(Number(v)) ? null : Number(v); };
export const intList = (fd: FormData, key: string) => fd.getAll(key).flatMap((v) => String(v).split(",")).map((v) => parseInt(v, 10)).filter((n) => Number.isInteger(n));
