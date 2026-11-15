import Dexie, { type Table } from "dexie";
import type {
  Adaptation,
  DayState,
  EngineSnapshot,
  ExerciseLog,
  ExerciseState,
  Insight,
  PainReport,
  PatternChoice,
  Profile,
  ProgressionEvent,
  Reminder,
  SessionLog,
  Settings,
  SkipEvent,
  WeekPlan,
  WeeklyReflection,
  Workout,
} from "@/engine";

/**
 * Local-first persistence (IndexedDB via Dexie). Everything stays on the device
 * unless the user explicitly exports it or opts in to AI coaching.
 *
 * Every record carries an id and an updatedAt so a future sync layer can do
 * last-write-wins merges per record.
 */

export interface CoachMessage {
  id: string;
  at: string;
  role: "user" | "assistant";
  text: string;
  source?: "local" | "ai";
  proposals?: { label: string; actions: unknown[]; appliedAt?: string }[];
}

export interface Measurement {
  id: string;
  date: string;
  kind: "weight";
  value: number; // kg
  updatedAt: string;
}

export interface ActiveWorkout {
  id: "current";
  sessionId: string;
  workout: Workout;
  stepIndex: number;
  phase: "work" | "rest" | "complete" | "feedback";
  /** Timestamp the current phase (or timer) started, ms. */
  phaseStartedAt: number;
  /** Timer running for timed work steps. */
  timerRunning: boolean;
  pausedAt?: number;
  pausedMs: number;
  startedAt: number;
  logs: Record<string, ExerciseLog>;
  /** Items (block:item) skipped for the rest of the session. */
  skippedItems: string[];
  /** Extra seconds added to the current rest. */
  restExtra: number;
  extended: boolean;
  restart: boolean;
  plannedSessionId?: string;
  feeling?: SessionLog["feeling"];
  updatedAt: string;
}

export interface QueuedReminder extends Reminder {
  shownAt?: string;
}

export interface Meta {
  key: string;
  value: string;
}

export class HelpFitDB extends Dexie {
  profile!: Table<Profile, string>;
  settings!: Table<Settings, string>;
  sessions!: Table<SessionLog, string>;
  skips!: Table<SkipEvent, string>;
  pain!: Table<PainReport, string>;
  exerciseStates!: Table<ExerciseState, string>;
  patternChoices!: Table<PatternChoice, string>;
  plans!: Table<WeekPlan, string>;
  insights!: Table<Insight, string>;
  adaptation!: Table<Adaptation, string>;
  dayStates!: Table<DayState, string>;
  events!: Table<ProgressionEvent, string>;
  reflections!: Table<WeeklyReflection, string>;
  coachMessages!: Table<CoachMessage, string>;
  measurements!: Table<Measurement, string>;
  activeWorkout!: Table<ActiveWorkout, string>;
  reminderQueue!: Table<QueuedReminder, string>;
  meta!: Table<Meta, string>;

  constructor() {
    super("helpfit");
    this.version(1).stores({
      profile: "id",
      settings: "id",
      sessions: "id, date, status, source",
      skips: "id, date",
      pain: "id, date, status",
      exerciseStates: "exerciseId",
      patternChoices: "pattern",
      plans: "id, weekStart",
      insights: "key, status",
      adaptation: "id",
      dayStates: "date",
      events: "id, date",
      reflections: "weekStart",
      coachMessages: "id, at",
      measurements: "id, date",
      activeWorkout: "id",
      reminderQueue: "tag, fireAt",
      meta: "key",
    });
  }
}

let _db: HelpFitDB | null = null;

export function db(): HelpFitDB {
  if (typeof indexedDB === "undefined") throw new Error("IndexedDB is not available");
  if (!_db) _db = new HelpFitDB();
  return _db;
}

export const ALL_TABLES = [
  "profile",
  "settings",
  "sessions",
  "skips",
  "pain",
  "exerciseStates",
  "patternChoices",
  "plans",
  "insights",
  "adaptation",
  "dayStates",
  "events",
  "reflections",
  "coachMessages",
  "measurements",
  "activeWorkout",
  "reminderQueue",
  "meta",
] as const;

export type TableName = (typeof ALL_TABLES)[number];

export const DEFAULT_SETTINGS: Settings = {
  id: "settings",
  theme: "system",
  reminders: { enabled: false, frequency: "planned_days", time: "auto", quietStart: "21:30", quietEnd: "07:30" },
  ai: { enabled: false, shareTraining: false, shareHealth: false },
  sound: true,
  haptics: true,
  updatedAt: new Date(0).toISOString(),
};

export interface AppData {
  snapshot: EngineSnapshot | null;
  settings: Settings;
  plans: WeekPlan[];
  reflections: WeeklyReflection[];
  measurements: Measurement[];
  activeWorkout: ActiveWorkout | null;
}

/** Reads everything the engine needs. Data volumes are small (personal use). */
export async function readAll(): Promise<AppData> {
  const d = db();
  return d.transaction("r", d.tables, async () => {
    const [profile, settings, sessions, skips, pain, states, choices, plans, insights, adaptation, dayStates, events, reflections, measurements, active] =
      await Promise.all([
        d.profile.get("me"),
        d.settings.get("settings"),
        d.sessions.orderBy("date").toArray(),
        d.skips.orderBy("date").toArray(),
        d.pain.orderBy("date").toArray(),
        d.exerciseStates.toArray(),
        d.patternChoices.toArray(),
        d.plans.orderBy("weekStart").toArray(),
        d.insights.toArray(),
        d.adaptation.get("adaptation"),
        d.dayStates.toArray(),
        d.events.orderBy("date").toArray(),
        d.reflections.toArray(),
        d.measurements.orderBy("date").toArray(),
        d.activeWorkout.get("current"),
      ]);
    const plan = plans.at(-1) ?? null;
    const snapshot: EngineSnapshot | null = profile
      ? {
          profile,
          sessions: sessions.sort((a, b) => a.startedAt.localeCompare(b.startedAt)),
          skips,
          pain,
          exerciseStates: Object.fromEntries(states.map((s) => [s.exerciseId, s])),
          patternChoices: Object.fromEntries(choices.map((c) => [c.pattern, c])),
          plan,
          insights,
          adaptation: adaptation ?? null,
          dayStates,
          events,
        }
      : null;
    return {
      snapshot,
      settings: settings ?? DEFAULT_SETTINGS,
      plans,
      reflections: reflections.sort((a, b) => b.weekStart.localeCompare(a.weekStart)),
      measurements,
      activeWorkout: active ?? null,
    };
  });
}
