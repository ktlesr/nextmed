/**
 * First installation: imports data/seed.v3.json (schema v3) and creates one login per team member.
 * Safe to re-run: the importer matches by stable id and never overwrites portal edits or runtime data.
 */
import { readFileSync } from "node:fs";
import bcrypt from "bcryptjs";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../src/db/schema";
import { applyImport, previewImport } from "../src/lib/importer";
try { process.loadEnvFile(".env"); } catch {}

const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://nextmed:nextmed@localhost:5432/nextmed" });
const db = drizzle(pool, { schema });
const file = process.argv[2] ?? "data/seed.v3.json";
const seed = JSON.parse(readFileSync(file, "utf8"));

const preview = await previewImport(db, seed);
if (!preview.ok) { console.error("✗ seed rejected:\n" + preview.errors.join("\n")); process.exit(1); }
console.log("counts:", preview.counts);
console.log("preview:", preview.summary);
const res = await applyImport(db, seed);
console.log("applied:", res);

// One account per person. System role and project role are separate fields.
const ascii = (s: string) => s.toLocaleLowerCase("tr").replace(/ç/g, "c").replace(/ğ/g, "g").replace(/ı/g, "i").replace(/ö/g, "o").replace(/ş/g, "s").replace(/ü/g, "u").replace(/[^a-z ]/g, "");
const roleOf: Record<string, schema.Role> = { "person-01": "admin", "person-02": "coordinator", "person-04": "coordinator", "person-03": "finance", "person-12": "finance" };
const password = process.env.SEED_DEFAULT_PASSWORD || "Zafer.2026!";
const hash = await bcrypt.hash(password, 10);
const people = await db.select().from(schema.people);
let created = 0;
for (const p of people) {
  const parts = ascii(p.fullName).split(/\s+/);
  const email = `${parts[0]}.${parts[parts.length - 1]}@zafer.gov.tr`;
  const r = await db.insert(schema.users).values({
    personId: p.id, email, passwordHash: hash, role: roleOf[p.id] ?? "member", canEditPlan: p.id === "person-04",
    // a person's own records get their final review from someone else
    reviewerPersonId: p.id === "person-01" ? "person-04" : "person-01",
  }).onConflictDoNothing().returning({ id: schema.users.id });
  created += r.length;
}
const r = await db.insert(schema.users).values({ email: "admin@zafer.gov.tr", passwordHash: hash, role: "admin", personId: null }).onConflictDoNothing().returning({ id: schema.users.id });
created += r.length;
console.log(`✓ ${created} user account(s) created` + (created ? ` — temporary password: ${password}` : ""));
await pool.end();
