"use client";

import { z } from "zod";
import { ALL_TABLES, db, type TableName } from "./db";

export const EXPORT_APP = "helpfit";
export const EXPORT_SCHEMA_VERSION = 1;

const EXPORTED_TABLES = ALL_TABLES.filter((t) => t !== "reminderQueue" && t !== "meta" && t !== "activeWorkout");

const KEY_FIELD: Record<TableName, string> = {
  profile: "id",
  settings: "id",
  sessions: "id",
  skips: "id",
  pain: "id",
  exerciseStates: "exerciseId",
  patternChoices: "pattern",
  plans: "id",
  insights: "key",
  adaptation: "id",
  dayStates: "date",
  events: "id",
  reflections: "weekStart",
  coachMessages: "id",
  measurements: "id",
  activeWorkout: "id",
  reminderQueue: "tag",
  meta: "key",
  mindProfile: "id",
  mindSessions: "id",
  mindState: "id",
};

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const profileSchema = z
  .object({
    id: z.literal("me"),
    createdAt: z.string(),
    goals: z.array(z.string()).max(10),
    activityLevel: z.enum(["sedentary", "light", "moderate", "active"]),
    experience: z.enum(["none", "some", "regular"]),
    daysPerWeek: z.number().int().min(1).max(7),
    sessionMinutes: z.union([z.literal(5), z.literal(15), z.literal(30)]),
    locations: z.array(z.enum(["home", "gym", "outdoors"])),
    equipment: z.array(z.string()),
    likes: z.array(z.string()),
    dislikes: z.array(z.string()),
    barriers: z.array(z.string()),
    cautionAreas: z.array(z.string()),
    readiness: z.object({ status: z.enum(["clear", "needs_clearance", "cleared_by_professional"]), answers: z.record(z.string(), z.boolean()) }).passthrough(),
    units: z.enum(["metric", "imperial"]),
    weekStartsOn: z.number().int().min(0).max(6),
  })
  .passthrough();

const sessionSchema = z
  .object({
    id: z.string().min(1),
    date: isoDay,
    startedAt: z.string(),
    source: z.enum(["guided", "external"]),
    focus: z.enum(["strength", "cardio", "mobility", "recovery", "restart"]),
    variant: z.enum(["minimum", "quick", "full"]),
    status: z.enum(["in_progress", "completed", "partial", "abandoned"]),
    actualMinutes: z.number().min(0).max(600),
    exercises: z.array(z.object({ exerciseId: z.string(), sets: z.array(z.object({}).passthrough()) }).passthrough()),
  })
  .passthrough();

const exportSchema = z.object({
  app: z.literal(EXPORT_APP),
  schemaVersion: z.number().int().min(1).max(EXPORT_SCHEMA_VERSION),
  exportedAt: z.string(),
  data: z.record(z.string(), z.array(z.record(z.string(), z.unknown())).max(20000)),
});

export type ExportFile = z.infer<typeof exportSchema>;

export async function exportData(): Promise<ExportFile> {
  const d = db();
  const data: Record<string, unknown[]> = {};
  for (const t of EXPORTED_TABLES) {
    const rows = await d.table(t).toArray();
    // Never export secrets.
    data[t] =
      t === "settings"
        ? rows.map((r: Record<string, unknown>) => ({ ...r, ai: { ...(r.ai as object), accessToken: undefined } }))
        : rows;
  }
  return { app: EXPORT_APP, schemaVersion: EXPORT_SCHEMA_VERSION, exportedAt: new Date().toISOString(), data: data as ExportFile["data"] };
}

export function downloadJson(obj: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  downloadBlob(blob, filename);
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export interface ImportSummary {
  tables: Record<string, number>;
}

/** Validates an export file and replaces all local data with it. */
export async function importData(raw: unknown): Promise<ImportSummary> {
  const parsed = exportSchema.safeParse(raw);
  if (!parsed.success) throw new Error("This doesn't look like a HelpFit export file.");
  const { data } = parsed.data;
  const profiles = data.profile ?? [];
  if (profiles.length !== 1 || !profileSchema.safeParse(profiles[0]).success) throw new Error("The export file has no valid profile.");
  for (const s of data.sessions ?? []) {
    if (!sessionSchema.safeParse(s).success) throw new Error("The export file contains an invalid workout record.");
  }
  const tables: Record<string, number> = {};
  for (const [name, rows] of Object.entries(data)) {
    if (!(EXPORTED_TABLES as readonly string[]).includes(name)) continue;
    const key = KEY_FIELD[name as TableName];
    for (const r of rows) if (typeof r[key] !== "string" || !(r[key] as string).length) throw new Error(`Invalid record in “${name}”.`);
    tables[name] = rows.length;
  }
  const d = db();
  await d.transaction("rw", d.tables, async () => {
    for (const t of ALL_TABLES) await d.table(t).clear();
    for (const [name, rows] of Object.entries(data)) {
      if (!(EXPORTED_TABLES as readonly string[]).includes(name)) continue;
      await d.table(name).bulkPut(rows);
    }
  });
  return { tables };
}

/** Permanently deletes all data stored by the app on this device. */
export async function deleteAllData(): Promise<void> {
  const d = db();
  await d.transaction("rw", d.tables, async () => {
    for (const t of ALL_TABLES) await d.table(t).clear();
  });
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch {
    // storage may be unavailable
  }
}
