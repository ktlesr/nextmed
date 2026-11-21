import type { DocumentCategory, PlanStatus, ProcurementStatus, Responsibility, Role, WorkLogStatus } from "@/db/schema";

export const RESPONSIBILITIES: Responsibility[] = ["lead", "support", "review", "legal_review", "province_implementation", "record_support"];
export const PLAN_STATUSES: PlanStatus[] = ["not_started", "in_progress", "in_review", "completed"];
export const WORK_LOG_STATUSES: WorkLogStatus[] = ["draft", "in_review", "changes_requested", "approved", "cancelled"];
export const ROLES: Role[] = ["admin", "coordinator", "finance", "member"];
export const DOCUMENT_CATEGORIES: DocumentCategory[] = ["project_documents", "reports", "meeting_minutes", "regulations", "other_documents"];
export const PROCUREMENT_STATUSES: ProcurementStatus[] = ["planning", "tender", "evaluation", "contracted", "delivered", "accepted", "paid", "cancelled"];
export const PROCUREMENT_FILE_KINDS = ["specification", "offer", "tender_notice", "evaluation", "contract", "delivery", "acceptance", "invoice", "payment"] as const;
export const TRAVEL_FILE_KINDS = ["invitation", "agenda", "assignment", "ticket", "boarding", "report"] as const;

/** Work-package colour slots (CSS custom properties --wp-1 … --wp-6). */
export const wpColor = (wpIdOrCode: string) => `var(--wp-${wpIdOrCode.replace(/\D/g, "").slice(0, 1) || 1})`;
