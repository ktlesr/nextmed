import type { TargetSpec } from "@/db/schema";

export const UNITS = ["people", "buildings", "m2", "pilot_actions", "solutions", "organisations", "events", "conferences", "conferences_attended", "videos", "sets", "plans", "packages", "models", "hubs", "meetings", "meetings_hosted", "workshop_types", "workshop_types_per_country", "reporting_rounds"] as const;
export const KINDS: TargetSpec["kind"][] = ["numeric", "coverage", "contribution", "conditional", "not_specified"];
export const QUALIFIERS = ["exact", "approximate", "greater_than", "indicative", "planned", "if_assigned"] as const;
export const OBS_STATUSES = ["planned", "in_progress", "contributed", "completed"] as const;
