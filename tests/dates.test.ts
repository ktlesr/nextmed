import { test } from "node:test";
import assert from "node:assert/strict";
import { projectMonthWindow, monthRuns, calendarTargets, largestRemainder, projectMonthOf, replanAllocations, projectEnd } from "../src/lib/dates";

test("guide examples: project month windows", () => {
  assert.deepEqual(projectMonthWindow("2026-10-30", 1), { month: 1, start: "2026-10-30", end: "2026-11-29" });
  assert.deepEqual(projectMonthWindow("2026-10-30", 5), { month: 5, start: "2027-02-28", end: "2027-03-29" });
  assert.deepEqual(projectMonthWindow("2027-01-01", 1), { month: 1, start: "2027-01-01", end: "2027-01-31" });
  assert.deepEqual(projectMonthWindow("2028-01-31", 2), { month: 2, start: "2028-02-29", end: "2028-03-30" });
});
test("months are added from the original anchor (no drift after February)", () => {
  assert.equal(projectMonthWindow("2028-01-31", 3).start, "2028-03-31");
  assert.equal(projectEnd("2027-01-01", 36), "2029-12-31");
});
test("non-contiguous months stay separate windows", () => {
  assert.deepEqual(monthRuns([7, 13, 19, 25, 31, 36]), [[7, 7], [13, 13], [19, 19], [25, 25], [31, 31], [36, 36]]);
  assert.deepEqual(monthRuns([3, 4, 5, 32, 33, 34]), [[3, 5], [32, 34]]);
});
test("calendar targets preserve the total", () => {
  const plan = [{ projectMonth: 1, centiHours: 856 }, { projectMonth: 2, centiHours: 855 }, { projectMonth: 3, centiHours: 256 }];
  const t = calendarTargets("2026-10-30", plan);
  assert.equal([...t.values()].reduce((a, b) => a + b, 0), 856 + 855 + 256);
  assert.equal(largestRemainder(100, [1, 1, 1]).reduce((a, b) => a + b, 0), 100);
});
test("project month of a date", () => {
  assert.equal(projectMonthOf("2026-10-30", 36, "2026-11-29"), 1);
  assert.equal(projectMonthOf("2026-10-30", 36, "2026-11-30"), 2);
  assert.equal(projectMonthOf("2026-10-30", 36, "2026-10-29"), null);
});
test("hourly replan keeps total minutes", () => {
  const old = [{ project_month: 24, planned_centi_hours: 300 }, { project_month: 25, planned_centi_hours: 500 }];
  assert.deepEqual(replanAllocations(old, [26, 27]), [{ project_month: 26, planned_centi_hours: 300 }, { project_month: 27, planned_centi_hours: 500 }]);
  const r = replanAllocations(old, [26, 27, 28]);
  assert.equal(r.reduce((a, b) => a + b.planned_centi_hours, 0), 800);
});
