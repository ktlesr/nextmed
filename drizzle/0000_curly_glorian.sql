CREATE TABLE "activities" (
	"id" text PRIMARY KEY NOT NULL,
	"output_id" text NOT NULL,
	"code" text NOT NULL,
	"name_tr" text NOT NULL,
	"name_en" text NOT NULL,
	"months" integer[] NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'not_started' NOT NULL,
	"completed_on" date,
	"result_note_tr" text,
	"result_note_en" text
);
--> statement-breakpoint
CREATE TABLE "assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"person_id" text NOT NULL,
	"subactivity_id" text NOT NULL,
	"responsibility" text NOT NULL,
	"task_description_tr" text,
	"task_description_en" text,
	"planned_minutes" integer,
	"planned_cost_eur" numeric(12, 2),
	"schedule_mode" text DEFAULT 'inherit' NOT NULL,
	"months" integer[],
	"allocations" jsonb,
	"status" text DEFAULT 'not_started' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"seed_snapshot" jsonb,
	"portal_edited_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid,
	"entity" text NOT NULL,
	"entity_id" text,
	"action" text NOT NULL,
	"reason" text,
	"before" jsonb,
	"after" jsonb
);
--> statement-breakpoint
CREATE TABLE "baselines" (
	"id" serial PRIMARY KEY NOT NULL,
	"version" integer NOT NULL,
	"start_date" date NOT NULL,
	"duration_months" integer NOT NULL,
	"reason" text,
	"snapshot" jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "concrete_outputs" (
	"id" text PRIMARY KEY NOT NULL,
	"name_tr" text,
	"name_en" text,
	"project_target" jsonb NOT NULL,
	"zafer_obligation" jsonb NOT NULL,
	"work_package_ids" text[] DEFAULT '{}' NOT NULL,
	"output_id" text,
	"activity_id" text,
	"programme_indicator" text,
	"project_target_basis" text,
	"sources" jsonb,
	"counting_note_tr" text,
	"counting_note_en" text,
	"priority" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"category" text NOT NULL,
	"title_tr" text,
	"title_en" text,
	"description_tr" text,
	"description_en" text,
	"doc_type" text,
	"doc_date" date,
	"version" integer DEFAULT 1 NOT NULL,
	"is_current" boolean DEFAULT true NOT NULL,
	"access" text DEFAULT 'team' NOT NULL,
	"work_package_id" text,
	"activity_id" text,
	"link_type" text,
	"link_id" text,
	"meta" jsonb,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expected_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"period" text,
	"sender" text,
	"expected_amount" numeric(14, 2) NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"expected_date" date,
	"note_tr" text,
	"note_en" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"lang" text DEFAULT 'tr' NOT NULL,
	"kind" text,
	"owner_person_id" text,
	"external_url" text,
	"name" text NOT NULL,
	"mime" text DEFAULT 'application/octet-stream' NOT NULL,
	"size" integer DEFAULT 0 NOT NULL,
	"data" "bytea",
	"access" text DEFAULT 'team' NOT NULL,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "follow_ups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_type" text NOT NULL,
	"source_id" uuid NOT NULL,
	"text_tr" text,
	"text_en" text,
	"is_decision" boolean DEFAULT false NOT NULL,
	"assignee_id" text,
	"activity_id" text,
	"due_date" date,
	"done" boolean DEFAULT false NOT NULL,
	"done_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hourly_plan" (
	"person_id" text NOT NULL,
	"project_month" integer NOT NULL,
	"centi_hours" integer NOT NULL,
	CONSTRAINT "hourly_plan_person_id_project_month_pk" PRIMARY KEY("person_id","project_month")
);
--> statement-breakpoint
CREATE TABLE "meetings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"title_tr" text,
	"title_en" text,
	"starts_at" timestamp with time zone NOT NULL,
	"duration_minutes" integer DEFAULT 60 NOT NULL,
	"time_zone" text DEFAULT 'Europe/Istanbul' NOT NULL,
	"location" text,
	"online_url" text,
	"agenda_tr" text,
	"agenda_en" text,
	"description_tr" text,
	"description_en" text,
	"participant_ids" text[] DEFAULT '{}' NOT NULL,
	"external_participants" text,
	"responsible_id" text,
	"activity_id" text,
	"travel_id" uuid,
	"status" text DEFAULT 'planned' NOT NULL,
	"outcome_tr" text,
	"outcome_en" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "month_closures" (
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"closed_by" uuid,
	"closed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reopened_at" timestamp with time zone,
	"reopen_reason" text,
	CONSTRAINT "month_closures_year_month_pk" PRIMARY KEY("year","month")
);
--> statement-breakpoint
CREATE TABLE "observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"concrete_output_id" text NOT NULL,
	"scope" text NOT NULL,
	"observed_on" date NOT NULL,
	"value" numeric(16, 2),
	"unit" text,
	"status" text,
	"note_tr" text,
	"note_en" text,
	"dedupe_key" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outputs" (
	"id" text PRIMARY KEY NOT NULL,
	"work_package_id" text NOT NULL,
	"code" text NOT NULL,
	"name_tr" text NOT NULL,
	"name_en" text NOT NULL,
	"months" integer[] NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"value_date" date NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"reference" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_costs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" text NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"amount" numeric(14, 2),
	"currency" text DEFAULT 'TRY' NOT NULL,
	"rate_try_per_eur" numeric(10, 4),
	"note" text,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" text PRIMARY KEY NOT NULL,
	"full_name" text NOT NULL,
	"organization_title_tr" text,
	"organization_title_en" text,
	"project_role_tr" text,
	"project_role_en" text,
	"general_duties_tr" text,
	"general_duties_en" text,
	"province_tr" text,
	"active" boolean DEFAULT true NOT NULL,
	"plan_method" text DEFAULT 'fixed_ratio' NOT NULL,
	"fixed_ratio" numeric(6, 4),
	"total_planned_minutes" integer,
	"internal_target_minutes" integer,
	"eligible_personnel_cost" boolean DEFAULT true NOT NULL,
	"cost_class_tr" text,
	"cost_class_en" text,
	"planned_cost_eur" numeric(12, 2) DEFAULT '0' NOT NULL,
	"hourly_rate_eur" numeric(10, 4),
	"start_project_month" integer DEFAULT 1 NOT NULL,
	"end_project_month" integer DEFAULT 36 NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"seed_snapshot" jsonb,
	"portal_edited_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "procurements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title_tr" text,
	"title_en" text,
	"scope_tr" text,
	"scope_en" text,
	"activity_id" text,
	"responsible_id" text,
	"method" text,
	"estimated_amount" numeric(14, 2),
	"contractor" text,
	"contract_amount" numeric(14, 2),
	"currency" text DEFAULT 'EUR' NOT NULL,
	"delivery_date" date,
	"status" text DEFAULT 'planning' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"partner_tr" text NOT NULL,
	"partner_en" text NOT NULL,
	"partner_code" text NOT NULL,
	"start_date" date,
	"duration_months" integer DEFAULT 36 NOT NULL,
	"time_zone" text DEFAULT 'Europe/Istanbul' NOT NULL,
	"step_minutes" integer DEFAULT 30 NOT NULL,
	"daily_limit_minutes" integer DEFAULT 480 NOT NULL,
	"default_reference_hours" numeric(6, 2) DEFAULT '160' NOT NULL,
	"budget" jsonb NOT NULL,
	"governance" jsonb NOT NULL,
	"settings" jsonb NOT NULL,
	"schema_version" integer DEFAULT 3 NOT NULL,
	"reference_fingerprint" text,
	"imported_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "reference_hours" (
	"id" serial PRIMARY KEY NOT NULL,
	"person_id" text,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"hours" numeric(6, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subactivities" (
	"id" text PRIMARY KEY NOT NULL,
	"activity_id" text NOT NULL,
	"code" text NOT NULL,
	"name_tr" text,
	"name_en" text,
	"description_tr" text,
	"description_en" text,
	"schedule_mode" text DEFAULT 'inherit' NOT NULL,
	"months" integer[],
	"status" text DEFAULT 'not_started' NOT NULL,
	"completed_on" date,
	"result_note_tr" text,
	"result_note_en" text,
	"outside_parent_reason" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"seed_snapshot" jsonb,
	"portal_edited_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "translation_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"field" text NOT NULL,
	"source_lang" text NOT NULL,
	"source_text" text NOT NULL,
	"source_revision" integer DEFAULT 1 NOT NULL,
	"target_text" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"reviewed_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "travels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purpose_tr" text,
	"purpose_en" text,
	"place" text,
	"activity_id" text,
	"depart_date" date NOT NULL,
	"return_date" date NOT NULL,
	"participant_ids" text[] DEFAULT '{}' NOT NULL,
	"responsible_id" text,
	"report_tr" text,
	"report_en" text,
	"actual_cost" numeric(14, 2),
	"currency" text DEFAULT 'EUR' NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" text,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"can_edit_plan" boolean DEFAULT false NOT NULL,
	"reviewer_person_id" text,
	"locale" text DEFAULT 'tr' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"must_change_password" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "work_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" text NOT NULL,
	"work_date" date NOT NULL,
	"minutes" integer NOT NULL,
	"work_package_id" text NOT NULL,
	"output_id" text NOT NULL,
	"activity_id" text NOT NULL,
	"subactivity_id" text,
	"description_tr" text,
	"description_en" text,
	"source_lang" text DEFAULT 'tr' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"outside_plan_window" boolean DEFAULT false NOT NULL,
	"reviewer_user_id" uuid,
	"review_note" text,
	"reviewed_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_packages" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name_tr" text NOT NULL,
	"name_en" text NOT NULL,
	"months" integer[] NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"personnel_ceiling_eur" numeric(12, 2) DEFAULT '0' NOT NULL,
	"personnel_plan_eur" numeric(12, 2) DEFAULT '0' NOT NULL,
	"external_services_budget_eur" numeric(12, 2) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_output_id_outputs_id_fk" FOREIGN KEY ("output_id") REFERENCES "public"."outputs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_subactivity_id_subactivities_id_fk" FOREIGN KEY ("subactivity_id") REFERENCES "public"."subactivities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baselines" ADD CONSTRAINT "baselines_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concrete_outputs" ADD CONSTRAINT "concrete_outputs_output_id_outputs_id_fk" FOREIGN KEY ("output_id") REFERENCES "public"."outputs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concrete_outputs" ADD CONSTRAINT "concrete_outputs_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_work_package_id_work_packages_id_fk" FOREIGN KEY ("work_package_id") REFERENCES "public"."work_packages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expected_payments" ADD CONSTRAINT "expected_payments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_owner_person_id_people_id_fk" FOREIGN KEY ("owner_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_assignee_id_people_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hourly_plan" ADD CONSTRAINT "hourly_plan_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_responsible_id_people_id_fk" FOREIGN KEY ("responsible_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "month_closures" ADD CONSTRAINT "month_closures_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observations" ADD CONSTRAINT "observations_concrete_output_id_concrete_outputs_id_fk" FOREIGN KEY ("concrete_output_id") REFERENCES "public"."concrete_outputs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observations" ADD CONSTRAINT "observations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outputs" ADD CONSTRAINT "outputs_work_package_id_work_packages_id_fk" FOREIGN KEY ("work_package_id") REFERENCES "public"."work_packages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transfers" ADD CONSTRAINT "payment_transfers_payment_id_expected_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."expected_payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transfers" ADD CONSTRAINT "payment_transfers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_costs" ADD CONSTRAINT "payroll_costs_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_costs" ADD CONSTRAINT "payroll_costs_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurements" ADD CONSTRAINT "procurements_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurements" ADD CONSTRAINT "procurements_responsible_id_people_id_fk" FOREIGN KEY ("responsible_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurements" ADD CONSTRAINT "procurements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_hours" ADD CONSTRAINT "reference_hours_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subactivities" ADD CONSTRAINT "subactivities_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_jobs" ADD CONSTRAINT "translation_jobs_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travels" ADD CONSTRAINT "travels_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travels" ADD CONSTRAINT "travels_responsible_id_people_id_fk" FOREIGN KEY ("responsible_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travels" ADD CONSTRAINT "travels_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_reviewer_person_id_people_id_fk" FOREIGN KEY ("reviewer_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_logs" ADD CONSTRAINT "work_logs_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_logs" ADD CONSTRAINT "work_logs_work_package_id_work_packages_id_fk" FOREIGN KEY ("work_package_id") REFERENCES "public"."work_packages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_logs" ADD CONSTRAINT "work_logs_output_id_outputs_id_fk" FOREIGN KEY ("output_id") REFERENCES "public"."outputs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_logs" ADD CONSTRAINT "work_logs_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_logs" ADD CONSTRAINT "work_logs_subactivity_id_subactivities_id_fk" FOREIGN KEY ("subactivity_id") REFERENCES "public"."subactivities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_logs" ADD CONSTRAINT "work_logs_reviewer_user_id_users_id_fk" FOREIGN KEY ("reviewer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_logs" ADD CONSTRAINT "work_logs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assignments_person_idx" ON "assignments" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "assignments_sub_idx" ON "assignments" USING btree ("subactivity_id");--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_log" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "documents_category_idx" ON "documents" USING btree ("category");--> statement-breakpoint
CREATE INDEX "files_entity_idx" ON "files" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "follow_ups_source_idx" ON "follow_ups" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE INDEX "observations_output_idx" ON "observations" USING btree ("concrete_output_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_costs_uq" ON "payroll_costs" USING btree ("person_id","year","month");--> statement-breakpoint
CREATE UNIQUE INDEX "reference_hours_uq" ON "reference_hours" USING btree ("person_id","year","month");--> statement-breakpoint
CREATE INDEX "subactivities_activity_idx" ON "subactivities" USING btree ("activity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "translation_jobs_uq" ON "translation_jobs" USING btree ("entity","entity_id","field");--> statement-breakpoint
CREATE INDEX "translation_jobs_status_idx" ON "translation_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "work_logs_person_date_idx" ON "work_logs" USING btree ("person_id","work_date");--> statement-breakpoint
CREATE INDEX "work_logs_status_idx" ON "work_logs" USING btree ("status");