import {
  pgTable, text, integer, boolean, date, timestamp, numeric, jsonb, uuid, primaryKey, index, uniqueIndex, customType, serial,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; default: false }>({ dataType: () => "bytea" });

/* ───────────── Project (single row) ───────────── */
export const project = pgTable("project", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  partnerTr: text("partner_tr").notNull(),
  partnerEn: text("partner_en").notNull(),
  partnerCode: text("partner_code").notNull(),
  startDate: date("start_date"), // null until the admin enters it
  durationMonths: integer("duration_months").notNull().default(36),
  timeZone: text("time_zone").notNull().default("Europe/Istanbul"),
  stepMinutes: integer("step_minutes").notNull().default(30),
  dailyLimitMinutes: integer("daily_limit_minutes").notNull().default(480),
  defaultReferenceHours: numeric("default_reference_hours", { precision: 6, scale: 2 }).notNull().default("160"),
  budget: jsonb("budget").$type<ProjectBudget>().notNull(),
  governance: jsonb("governance").$type<Record<string, unknown>>().notNull(),
  settings: jsonb("settings").$type<Record<string, unknown>>().notNull(),
  schemaVersion: integer("schema_version").notNull().default(3),
  referenceFingerprint: text("reference_fingerprint"),
  importedAt: timestamp("imported_at", { withTimezone: true }),
});

export type ProjectBudget = {
  approved_partner_budget_eur: number;
  personnel_ceiling_eur: number;
  personnel_plan_eur: number;
  personnel_remaining_eur: number;
  plan_currency_rate_try_per_eur: number;
  reporting_currency_rate_try_per_eur?: number | null;
  admin_flat_rate: number;
  travel_flat_rate: number;
  partner_contribution_rate: number;
};

/* ───────────── Fixed reference structure (read-only) ───────────── */
export const workPackages = pgTable("work_packages", {
  id: text("id").primaryKey(),
  code: text("code").notNull(),
  nameTr: text("name_tr").notNull(),
  nameEn: text("name_en").notNull(),
  months: integer("months").array().notNull(),
  active: boolean("active").notNull().default(true),
  sort: integer("sort").notNull().default(0),
  personnelCeilingEur: numeric("personnel_ceiling_eur", { precision: 12, scale: 2 }).notNull().default("0"),
  personnelPlanEur: numeric("personnel_plan_eur", { precision: 12, scale: 2 }).notNull().default("0"),
  externalServicesBudgetEur: numeric("external_services_budget_eur", { precision: 12, scale: 2 }).notNull().default("0"),
});

export const outputs = pgTable("outputs", {
  id: text("id").primaryKey(),
  workPackageId: text("work_package_id").notNull().references(() => workPackages.id),
  code: text("code").notNull(),
  nameTr: text("name_tr").notNull(),
  nameEn: text("name_en").notNull(),
  months: integer("months").array().notNull(),
  active: boolean("active").notNull().default(true),
  sort: integer("sort").notNull().default(0),
});

export const activities = pgTable("activities", {
  id: text("id").primaryKey(),
  outputId: text("output_id").notNull().references(() => outputs.id),
  code: text("code").notNull(),
  nameTr: text("name_tr").notNull(),
  nameEn: text("name_en").notNull(),
  months: integer("months").array().notNull(), // reference months, never auto-expanded
  active: boolean("active").notNull().default(true),
  sort: integer("sort").notNull().default(0),
  // Progress is recorded by an authorised user, never inferred from hours.
  status: text("status").$type<PlanStatus>().notNull().default("not_started"),
  completedOn: date("completed_on"),
  resultNoteTr: text("result_note_tr"),
  resultNoteEn: text("result_note_en"),
});

export type PlanStatus = "not_started" | "in_progress" | "in_review" | "completed";
export type ScheduleMode = "inherit" | "custom";

/* ───────────── Editable plan ───────────── */
export const subactivities = pgTable("subactivities", {
  id: text("id").primaryKey(), // stable id, independent of display code (uuid for new ones)
  activityId: text("activity_id").notNull().references(() => activities.id),
  code: text("code").notNull(),
  nameTr: text("name_tr"),
  nameEn: text("name_en"),
  descriptionTr: text("description_tr"),
  descriptionEn: text("description_en"),
  scheduleMode: text("schedule_mode").$type<ScheduleMode>().notNull().default("inherit"),
  months: integer("months").array(), // only for custom mode; inherit resolves from the parent activity
  status: text("status").$type<PlanStatus>().notNull().default("not_started"),
  completedOn: date("completed_on"),
  resultNoteTr: text("result_note_tr"),
  resultNoteEn: text("result_note_en"),
  outsideParentReason: text("outside_parent_reason"),
  active: boolean("active").notNull().default(true), // false = archived
  sort: integer("sort").notNull().default(0),
  seedSnapshot: jsonb("seed_snapshot").$type<Record<string, unknown>>(), // last imported source values (conflict detection)
  portalEditedAt: timestamp("portal_edited_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("subactivities_activity_idx").on(t.activityId)]);

export type PlanMethod = "fixed_ratio" | "hourly" | "non_budget_support";

export const people = pgTable("people", {
  id: text("id").primaryKey(),
  fullName: text("full_name").notNull(),
  organizationTitleTr: text("organization_title_tr"),
  organizationTitleEn: text("organization_title_en"),
  projectRoleTr: text("project_role_tr"),
  projectRoleEn: text("project_role_en"),
  generalDutiesTr: text("general_duties_tr"),
  generalDutiesEn: text("general_duties_en"),
  provinceTr: text("province_tr"),
  active: boolean("active").notNull().default(true),
  planMethod: text("plan_method").$type<PlanMethod>().notNull().default("fixed_ratio"),
  fixedRatio: numeric("fixed_ratio", { precision: 6, scale: 4 }),
  totalPlannedMinutes: integer("total_planned_minutes"),
  internalTargetMinutes: integer("internal_target_minutes"), // optional monthly internal target for unbudgeted support
  eligiblePersonnelCost: boolean("eligible_personnel_cost").notNull().default(true),
  costClassTr: text("cost_class_tr"),
  costClassEn: text("cost_class_en"),
  plannedCostEur: numeric("planned_cost_eur", { precision: 12, scale: 2 }).notNull().default("0"),
  hourlyRateEur: numeric("hourly_rate_eur", { precision: 10, scale: 4 }), // valid GSS hourly cost for hourly staff
  startProjectMonth: integer("start_project_month").notNull().default(1),
  endProjectMonth: integer("end_project_month").notNull().default(36),
  sort: integer("sort").notNull().default(0),
  seedSnapshot: jsonb("seed_snapshot").$type<Record<string, unknown>>(),
  portalEditedAt: timestamp("portal_edited_at", { withTimezone: true }),
});

export type Responsibility = "lead" | "support" | "review" | "legal_review" | "province_implementation" | "record_support";

export type MonthAllocation = { project_month: number; planned_centi_hours: number };

export const assignments = pgTable("assignments", {
  id: text("id").primaryKey(),
  personId: text("person_id").notNull().references(() => people.id),
  subactivityId: text("subactivity_id").notNull().references(() => subactivities.id),
  responsibility: text("responsibility").$type<Responsibility>().notNull(),
  taskDescriptionTr: text("task_description_tr"),
  taskDescriptionEn: text("task_description_en"),
  plannedMinutes: integer("planned_minutes"),
  plannedCostEur: numeric("planned_cost_eur", { precision: 12, scale: 2 }),
  scheduleMode: text("schedule_mode").$type<ScheduleMode>().notNull().default("inherit"),
  months: integer("months").array(),
  allocations: jsonb("allocations").$type<MonthAllocation[]>(), // hourly tasks: centi-hours per project month
  status: text("status").$type<PlanStatus>().notNull().default("not_started"),
  active: boolean("active").notNull().default(true),
  seedSnapshot: jsonb("seed_snapshot").$type<Record<string, unknown>>(),
  portalEditedAt: timestamp("portal_edited_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("assignments_person_idx").on(t.personId), index("assignments_sub_idx").on(t.subactivityId)]);

/** Excel-validated distribution for hourly staff: person × project month, in 0.01 h. */
export const hourlyPlan = pgTable("hourly_plan", {
  personId: text("person_id").notNull().references(() => people.id),
  projectMonth: integer("project_month").notNull(),
  centiHours: integer("centi_hours").notNull(),
}, (t) => [primaryKey({ columns: [t.personId, t.projectMonth] })]);

/** Reference working hours per calendar month. personId null = institution default for that month. */
export const referenceHours = pgTable("reference_hours", {
  id: serial("id").primaryKey(),
  personId: text("person_id").references(() => people.id),
  year: integer("year").notNull(),
  month: integer("month").notNull(),
  hours: numeric("hours", { precision: 6, scale: 2 }).notNull(),
}, (t) => [uniqueIndex("reference_hours_uq").on(t.personId, t.year, t.month)]);

/* ───────────── Users & access ───────────── */
export type Role = "admin" | "coordinator" | "finance" | "member";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  personId: text("person_id").references(() => people.id),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").$type<Role>().notNull().default("member"),
  canEditPlan: boolean("can_edit_plan").notNull().default(false),
  reviewerPersonId: text("reviewer_person_id").references(() => people.id), // who gives final review for this user's own records
  locale: text("locale").$type<"tr" | "en">().notNull().default("tr"),
  active: boolean("active").notNull().default(true),
  mustChangePassword: boolean("must_change_password").notNull().default(true),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(), // sha-256 of the cookie token
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ───────────── Baselines & audit ───────────── */
export const baselines = pgTable("baselines", {
  id: serial("id").primaryKey(),
  version: integer("version").notNull(),
  startDate: date("start_date").notNull(),
  durationMonths: integer("duration_months").notNull(),
  reason: text("reason"),
  snapshot: jsonb("snapshot").$type<BaselineSnapshot>().notNull(), // immutable
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type BaselineSnapshot = {
  activities: { id: string; months: number[] }[];
  subactivities: { id: string; activityId: string; code: string; nameTr: string | null; months: number[]; active: boolean }[];
  assignments: { id: string; personId: string; subactivityId: string; responsibility: string; months: number[]; plannedMinutes: number | null; allocations: MonthAllocation[] | null }[];
  hourlyPlan: { personId: string; projectMonth: number; centiHours: number }[];
  people: { id: string; planMethod: string; fixedRatio: string | null; totalPlannedMinutes: number | null }[];
};

export const auditLog = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  userId: uuid("user_id").references(() => users.id),
  entity: text("entity").notNull(),
  entityId: text("entity_id"),
  action: text("action").notNull(),
  reason: text("reason"),
  before: jsonb("before"),
  after: jsonb("after"),
}, (t) => [index("audit_entity_idx").on(t.entity, t.entityId)]);

/* ───────────── Daily work logs ───────────── */
export type WorkLogStatus = "draft" | "in_review" | "changes_requested" | "approved" | "cancelled";
export type TranslationStatus = "pending" | "machine" | "reviewed" | "failed";

export const workLogs = pgTable("work_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  personId: text("person_id").notNull().references(() => people.id),
  workDate: date("work_date").notNull(), // the actual day worked — never moved by plan changes
  minutes: integer("minutes").notNull(),
  workPackageId: text("work_package_id").notNull().references(() => workPackages.id),
  outputId: text("output_id").notNull().references(() => outputs.id),
  activityId: text("activity_id").notNull().references(() => activities.id),
  subactivityId: text("subactivity_id").references(() => subactivities.id),
  descriptionTr: text("description_tr"),
  descriptionEn: text("description_en"),
  sourceLang: text("source_lang").$type<"tr" | "en">().notNull().default("tr"),
  status: text("status").$type<WorkLogStatus>().notNull().default("draft"),
  outsidePlanWindow: boolean("outside_plan_window").notNull().default(false),
  reviewerUserId: uuid("reviewer_user_id").references(() => users.id),
  reviewNote: text("review_note"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("work_logs_person_date_idx").on(t.personId, t.workDate), index("work_logs_status_idx").on(t.status)]);

/** A calendar month closed for reporting. Reopening requires a reason (audit log). */
export const monthClosures = pgTable("month_closures", {
  year: integer("year").notNull(),
  month: integer("month").notNull(),
  closedBy: uuid("closed_by").references(() => users.id),
  closedAt: timestamp("closed_at", { withTimezone: true }).notNull().defaultNow(),
  reopenedAt: timestamp("reopened_at", { withTimezone: true }),
  reopenReason: text("reopen_reason"),
}, (t) => [primaryKey({ columns: [t.year, t.month] })]);

/* ───────────── Files (originals are always preserved) ───────────── */
export type FileEntity = "work_log" | "document" | "meeting" | "procurement" | "travel" | "payment" | "transfer" | "observation" | "payroll" | "report";
export type FileAccess = "team" | "finance" | "admin";

export const files = pgTable("files", {
  id: uuid("id").primaryKey().defaultRandom(),
  entityType: text("entity_type").$type<FileEntity>().notNull(),
  entityId: text("entity_id").notNull(),
  lang: text("lang").$type<"tr" | "en">().notNull().default("tr"),
  kind: text("kind"), // free label inside the record: e.g. "offer", "contract", "ticket", "minutes"
  ownerPersonId: text("owner_person_id").references(() => people.id), // e.g. participant-specific travel docs
  externalUrl: text("external_url"), // link to an existing document instead of an upload
  name: text("name").notNull(),
  mime: text("mime").notNull().default("application/octet-stream"),
  size: integer("size").notNull().default(0),
  data: bytea("data"),
  access: text("access").$type<FileAccess>().notNull().default("team"),
  uploadedBy: uuid("uploaded_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("files_entity_idx").on(t.entityType, t.entityId)]);

/* ───────────── Documents ───────────── */
export type DocumentCategory = "project_documents" | "reports" | "meeting_minutes" | "regulations" | "other_documents";

export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  groupId: uuid("group_id").notNull().defaultRandom(), // all versions of one document share a group
  category: text("category").$type<DocumentCategory>().notNull(),
  titleTr: text("title_tr"),
  titleEn: text("title_en"),
  descriptionTr: text("description_tr"),
  descriptionEn: text("description_en"),
  docType: text("doc_type"),
  docDate: date("doc_date"),
  version: integer("version").notNull().default(1),
  isCurrent: boolean("is_current").notNull().default(true),
  access: text("access").$type<FileAccess>().notNull().default("team"),
  workPackageId: text("work_package_id").references(() => workPackages.id),
  activityId: text("activity_id").references(() => activities.id),
  linkType: text("link_type"), // work_log | meeting | travel | procurement | payment
  linkId: text("link_id"),
  meta: jsonb("meta").$type<Record<string, unknown>>(), // e.g. stored report: period, scope, locale
  uploadedBy: uuid("uploaded_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("documents_category_idx").on(t.category)]);

/* ───────────── Meetings ───────────── */
export const meetings = pgTable("meetings", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: text("kind").$type<"internal" | "stakeholder">().notNull(),
  titleTr: text("title_tr"),
  titleEn: text("title_en"),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  durationMinutes: integer("duration_minutes").notNull().default(60),
  timeZone: text("time_zone").notNull().default("Europe/Istanbul"),
  location: text("location"),
  onlineUrl: text("online_url"),
  agendaTr: text("agenda_tr"),
  agendaEn: text("agenda_en"),
  descriptionTr: text("description_tr"),
  descriptionEn: text("description_en"),
  participantIds: text("participant_ids").array().notNull().default([]),
  externalParticipants: text("external_participants"),
  responsibleId: text("responsible_id").references(() => people.id),
  activityId: text("activity_id").references(() => activities.id),
  travelId: uuid("travel_id"),
  status: text("status").$type<"planned" | "held" | "cancelled">().notNull().default("planned"),
  outcomeTr: text("outcome_tr"),
  outcomeEn: text("outcome_en"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Decisions & follow-up tasks. meetingId null = follow-up raised from a travel/procurement file. */
export const followUps = pgTable("follow_ups", {
  id: uuid("id").primaryKey().defaultRandom(),
  sourceType: text("source_type").$type<"meeting" | "travel" | "procurement">().notNull(),
  sourceId: uuid("source_id").notNull(),
  textTr: text("text_tr"),
  textEn: text("text_en"),
  isDecision: boolean("is_decision").notNull().default(false),
  assigneeId: text("assignee_id").references(() => people.id),
  activityId: text("activity_id").references(() => activities.id),
  dueDate: date("due_date"),
  done: boolean("done").notNull().default(false),
  doneAt: timestamp("done_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("follow_ups_source_idx").on(t.sourceType, t.sourceId)]);

/* ───────────── Procurements ───────────── */
export type ProcurementStatus = "planning" | "tender" | "evaluation" | "contracted" | "delivered" | "accepted" | "paid" | "cancelled";

export const procurements = pgTable("procurements", {
  id: uuid("id").primaryKey().defaultRandom(),
  titleTr: text("title_tr"),
  titleEn: text("title_en"),
  scopeTr: text("scope_tr"),
  scopeEn: text("scope_en"),
  activityId: text("activity_id").references(() => activities.id),
  responsibleId: text("responsible_id").references(() => people.id),
  method: text("method"), // procurement procedure, chosen by the authorised user
  estimatedAmount: numeric("estimated_amount", { precision: 14, scale: 2 }),
  contractor: text("contractor"),
  contractAmount: numeric("contract_amount", { precision: 14, scale: 2 }),
  currency: text("currency").notNull().default("EUR"),
  deliveryDate: date("delivery_date"),
  status: text("status").$type<ProcurementStatus>().notNull().default("planning"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ───────────── Travels ───────────── */
export const travels = pgTable("travels", {
  id: uuid("id").primaryKey().defaultRandom(),
  purposeTr: text("purpose_tr"),
  purposeEn: text("purpose_en"),
  place: text("place"),
  activityId: text("activity_id").references(() => activities.id),
  departDate: date("depart_date").notNull(),
  returnDate: date("return_date").notNull(),
  participantIds: text("participant_ids").array().notNull().default([]),
  responsibleId: text("responsible_id").references(() => people.id),
  reportTr: text("report_tr"),
  reportEn: text("report_en"),
  actualCost: numeric("actual_cost", { precision: 14, scale: 2 }),
  currency: text("currency").notNull().default("EUR"),
  status: text("status").$type<"planned" | "completed" | "cancelled">().notNull().default("planned"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ───────────── Finance ───────────── */
export const expectedPayments = pgTable("expected_payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: text("kind").$type<"advance" | "interim" | "balance">().notNull(),
  period: text("period"),
  sender: text("sender"),
  expectedAmount: numeric("expected_amount", { precision: 14, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("EUR"),
  expectedDate: date("expected_date"),
  noteTr: text("note_tr"),
  noteEn: text("note_en"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const paymentTransfers = pgTable("payment_transfers", {
  id: uuid("id").primaryKey().defaultRandom(),
  paymentId: uuid("payment_id").notNull().references(() => expectedPayments.id, { onDelete: "cascade" }),
  valueDate: date("value_date").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  reference: text("reference"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Eligible monthly employer cost — exactly one row per person and payroll month. */
export const payrollCosts = pgTable("payroll_costs", {
  id: uuid("id").primaryKey().defaultRandom(),
  personId: text("person_id").notNull().references(() => people.id),
  year: integer("year").notNull(),
  month: integer("month").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }),
  currency: text("currency").notNull().default("TRY"),
  rateTryPerEur: numeric("rate_try_per_eur", { precision: 10, scale: 4 }), // reporting rate, separate from the plan rate
  note: text("note"),
  updatedBy: uuid("updated_by").references(() => users.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("payroll_costs_uq").on(t.personId, t.year, t.month)]);

/* ───────────── Tangible outputs ───────────── */
export type TargetSpec = {
  kind: "numeric" | "coverage" | "contribution" | "not_specified" | "conditional";
  value: number | null;
  unit: string | null;
  qualifier: string | null;
  display_tr: string;
  display_en: string;
};

export const concreteOutputs = pgTable("concrete_outputs", {
  id: text("id").primaryKey(),
  nameTr: text("name_tr"),
  nameEn: text("name_en"),
  projectTarget: jsonb("project_target").$type<TargetSpec>().notNull(),
  zaferObligation: jsonb("zafer_obligation").$type<TargetSpec>().notNull(),
  workPackageIds: text("work_package_ids").array().notNull().default([]),
  outputId: text("output_id").references(() => outputs.id),
  activityId: text("activity_id").references(() => activities.id),
  programmeIndicator: text("programme_indicator"),
  projectTargetBasis: text("project_target_basis"),
  sources: jsonb("sources").$type<{ application_form_pages?: number[]; zafer_matrix_subactivities?: string[] }>(),
  countingNoteTr: text("counting_note_tr"),
  countingNoteEn: text("counting_note_en"),
  priority: boolean("priority").notNull().default(false), // shown on the admin dashboard
  active: boolean("active").notNull().default(true),
  sort: integer("sort").notNull().default(0),
  history: jsonb("history").$type<{ at: string; by: string | null; before: Record<string, unknown> }[]>().notNull().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const observations = pgTable("observations", {
  id: uuid("id").primaryKey().defaultRandom(),
  concreteOutputId: text("concrete_output_id").notNull().references(() => concreteOutputs.id),
  scope: text("scope").$type<"project" | "zafer">().notNull(),
  observedOn: date("observed_on").notNull(),
  value: numeric("value", { precision: 16, scale: 2 }), // null for non-numeric records
  unit: text("unit"),
  status: text("status"), // for non-numeric contributions
  noteTr: text("note_tr"),
  noteEn: text("note_en"),
  // The same person/building/file is counted once per indicator even with several evidence records.
  dedupeKey: text("dedupe_key"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("observations_output_idx").on(t.concreteOutputId)]);

/* ───────────── Translations ───────────── */
export const translationJobs = pgTable("translation_jobs", {
  id: serial("id").primaryKey(),
  entity: text("entity").notNull(), // table name
  entityId: text("entity_id").notNull(),
  field: text("field").notNull(), // base field name, e.g. "description"
  sourceLang: text("source_lang").$type<"tr" | "en">().notNull(),
  sourceText: text("source_text").notNull(),
  sourceRevision: integer("source_revision").notNull().default(1),
  targetText: text("target_text"),
  status: text("status").$type<TranslationStatus>().notNull().default("pending"),
  error: text("error"),
  reviewedBy: uuid("reviewed_by").references(() => users.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("translation_jobs_uq").on(t.entity, t.entityId, t.field), index("translation_jobs_status_idx").on(t.status)]);
