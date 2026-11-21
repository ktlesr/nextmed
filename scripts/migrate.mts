import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
try { process.loadEnvFile(".env"); } catch {}

const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://nextmed:nextmed@localhost:5432/nextmed" });
await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
// The daily 8-hour ceiling is also enforced inside a per-person/day transaction lock in the app;
// these constraints are the last line of defence for the 30-minute step.
await pool.query(`do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'work_logs_minutes_step') then
    alter table work_logs add constraint work_logs_minutes_step check (minutes between 30 and 480 and minutes % 30 = 0);
  end if;
end $$;`);
console.log("✓ migrations applied");
await pool.end();
