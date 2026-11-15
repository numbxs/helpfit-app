"use client";

import {
  applySessionProgression,
  buildReflection,
  countsTowardWeek,
  dayKey,
  detectInsights,
  EXERCISE_BY_ID,
  evaluateReadiness,
  flattenWorkout,
  planWeek,
  reflowPlan,
  reschedule,
  upcomingReminders,
  variantForMinutes,
  weekProgress,
  weekWindow,
  type ActivityLevel,
  type ActivityPreference,
  type Barrier,
  type BodyArea,
  type CoachAction,
  type DayState,
  type EngineSnapshot,
  type Equipment,
  type ExerciseLog,
  type ExternalActivity,
  type Experience,
  type Goal,
  type Insight,
  type Location,
  type PainQuality,
  type PainReport,
  type Profile,
  type ProgressionEvent,
  type ReadinessAnswerKey,
  type Recommendation,
  type SessionLog,
  type Settings,
  type SkipEvent,
  type TimeOfDay,
  type Variant,
  type WorkoutFeedback,
} from "@/engine";
import { db, DEFAULT_SETTINGS, readAll, type ActiveWorkout, type CoachMessage } from "./db";

export const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

const iso = (d: Date) => d.toISOString();

// ---------------------------------------------------------------------------
// Onboarding
// ---------------------------------------------------------------------------

export interface OnboardingInput {
  goals: Goal[];
  activityLevel: ActivityLevel;
  experience: Experience;
  daysPerWeek: number;
  sessionMinutes: 5 | 15 | 30;
  preferredTime?: TimeOfDay | "varies";
  locations: Location[];
  equipment: Equipment[];
  likes: ActivityPreference[];
  dislikes: ActivityPreference[];
  barriers: Barrier[];
  readiness: Record<ReadinessAnswerKey, boolean>;
  currentPain: { area: BodyArea; severity: number; quality: PainQuality }[];
  cautionAreas: BodyArea[];
  ageYears?: number;
  heightCm?: number;
  weightKg?: number;
  units: "metric" | "imperial";
}

export async function completeOnboarding(input: OnboardingInput, now = new Date()): Promise<void> {
  const today = dayKey(now);
  const profile: Profile = {
    id: "me",
    createdAt: iso(now),
    updatedAt: iso(now),
    goals: input.goals.length ? input.goals : ["general_fitness"],
    activityLevel: input.activityLevel,
    experience: input.experience,
    daysPerWeek: input.daysPerWeek,
    sessionMinutes: input.sessionMinutes,
    preferredTime: input.preferredTime,
    locations: input.locations.length ? input.locations : ["home"],
    equipment: input.equipment,
    likes: input.likes,
    dislikes: input.dislikes,
    barriers: input.barriers,
    cautionAreas: input.cautionAreas,
    readiness: evaluateReadiness(input.readiness, now),
    ageYears: input.ageYears,
    heightCm: input.heightCm,
    weightKg: input.weightKg,
    units: input.units,
    weekStartsOn: now.getDay(),
  };
  const pain: PainReport[] = input.currentPain.map((p) => ({
    id: uid(),
    createdAt: iso(now),
    date: today,
    area: p.area,
    severity: p.severity,
    quality: p.quality,
    context: "onboarding",
    status: "active",
    updatedAt: iso(now),
    followUps: [],
  }));
  const snap: EngineSnapshot = {
    profile,
    sessions: [],
    skips: [],
    pain,
    exerciseStates: {},
    patternChoices: {},
    plan: null,
    insights: [],
    adaptation: null,
    dayStates: [],
    events: [],
  };
  const plan = planWeek(snap, { weekStart: today, today, now, firstWeek: true });
  const d = db();
  await d.transaction("rw", d.tables, async () => {
    await d.profile.put(profile);
    if (!(await d.settings.get("settings"))) await d.settings.put({ ...DEFAULT_SETTINGS, updatedAt: iso(now) });
    if (pain.length) await d.pain.bulkPut(pain);
    if (input.weightKg) await d.measurements.put({ id: uid(), date: today, kind: "weight", value: input.weightKg, updatedAt: iso(now) });
    await d.plans.put(plan);
    await d.meta.put({ key: "onboardedAt", value: iso(now) });
  });
}

// ---------------------------------------------------------------------------
// Week rollover, plan reflow, learning
// ---------------------------------------------------------------------------

let ensuring: Promise<void> | null = null;

/** Called on app open, focus and date change. Idempotent. */
export function ensureCurrentWeek(now = new Date()): Promise<void> {
  if (!ensuring) {
    ensuring = doEnsureCurrentWeek(now).finally(() => {
      ensuring = null;
    });
  }
  return ensuring;
}

async function doEnsureCurrentWeek(now: Date): Promise<void> {
  const data = await readAll();
  const snap = data.snapshot;
  if (!snap) return;
  const d = db();
  const today = dayKey(now);
  const { weekStart } = weekWindow(snap.profile, today);
  let adaptation = snap.adaptation;
  let plan = data.plans.find((p) => p.weekStart === weekStart) ?? null;

  if (!plan) {
    const last = data.plans.at(-1);
    if (last && last.weekEnd < today && !data.reflections.some((r) => r.weekStart === last.weekStart)) {
      const res = buildReflection({
        profile: snap.profile,
        plan: last,
        previous: data.reflections,
        sessions: snap.sessions,
        skips: snap.skips,
        pain: snap.pain,
        events: snap.events,
        adaptation,
        now,
      });
      adaptation = res.adaptation;
      await d.reflections.put(res.reflection);
      await d.adaptation.put(adaptation);
    }
    plan = planWeek({ ...snap, adaptation }, { weekStart, today, now, firstWeek: data.plans.length === 0 });
    await d.plans.put(plan);
  } else {
    const reflowed = reflowPlan(plan, snap, today, now);
    if (reflowed !== plan) {
      plan = reflowed;
      await d.plans.put(plan);
    }
  }
  await relearn({ ...snap, plan, adaptation }, now);
  await refreshReminders(now);
}

/** Re-runs behaviour detection and applies preference-type insights. */
async function relearn(snap: EngineSnapshot, now: Date): Promise<void> {
  const d = db();
  const next = detectInsights({ profile: snap.profile, sessions: snap.sessions, skips: snap.skips, dayStates: snap.dayStates, existing: snap.insights, now });
  const nextKeys = new Set(next.map((i) => i.key));
  const removed = snap.insights.filter((i) => !nextKeys.has(i.key)).map((i) => i.key);
  const changed = next.filter((n) => {
    const prev = snap.insights.find((i) => i.key === n.key);
    return !prev || prev.evidence !== n.evidence || prev.status !== n.status;
  });
  if (removed.length) await d.insights.bulkDelete(removed);
  if (changed.length) await d.insights.bulkPut(changed);
  // Repeatedly replaced exercises: the user's replacement becomes their choice for that pattern.
  for (const i of next) {
    if (!i.key.startsWith("avoid_exercise:") || i.status === "rejected") continue;
    const avoided = EXERCISE_BY_ID[i.key.split(":")[1]];
    const replacement = EXERCISE_BY_ID[String(i.data?.replacement ?? "")];
    if (!avoided || !replacement || avoided.pattern !== replacement.pattern) continue;
    const current = snap.patternChoices[avoided.pattern];
    if (!current || current.exerciseId === avoided.id) {
      await d.patternChoices.put({ pattern: avoided.pattern, exerciseId: replacement.id, source: "preference", updatedAt: iso(now) });
    }
  }
}

export async function refreshReminders(now = new Date()): Promise<void> {
  const data = await readAll();
  if (!data.snapshot) return;
  const d = db();
  const upcoming = upcomingReminders(data.snapshot, data.settings.reminders, now, 7);
  const existing = await d.reminderQueue.toArray();
  await d.transaction("rw", d.reminderQueue, async () => {
    await d.reminderQueue.clear();
    await d.reminderQueue.bulkPut(upcoming.map((r) => ({ ...r, shownAt: existing.find((e) => e.tag === r.tag)?.shownAt })));
  });
}

// ---------------------------------------------------------------------------
// Today: check-ins and overrides
// ---------------------------------------------------------------------------

export async function patchDayState(patch: Partial<Omit<DayState, "date">>, now = new Date()): Promise<void> {
  const d = db();
  const date = dayKey(now);
  const cur = (await d.dayStates.get(date)) ?? { date, updatedAt: iso(now) };
  const next: DayState = { ...cur, ...patch, date, updatedAt: iso(now) };
  for (const k of Object.keys(next) as (keyof DayState)[]) if (next[k] === undefined) delete next[k];
  await d.dayStates.put(next);
}

export async function recordShown(rec: Recommendation, now = new Date()): Promise<void> {
  if (rec.kind !== "workout") return;
  const d = db();
  const cur = await d.dayStates.get(rec.date);
  if (cur?.shown) return;
  await patchDayState({ shown: { focus: rec.focus, variant: rec.variant, at: iso(now), plannedSessionId: rec.plannedSessionId } }, now);
}

export async function resetToday(now = new Date()): Promise<void> {
  const d = db();
  const date = dayKey(now);
  const cur = await d.dayStates.get(date);
  if (!cur) return;
  await d.dayStates.put({ date, shown: cur.shown, feeling: cur.feeling, updatedAt: iso(now) });
}

export async function skipToday(reason: SkipEvent["reason"], rec: Recommendation | null, now = new Date()): Promise<void> {
  const d = db();
  const skip: SkipEvent = {
    id: uid(),
    date: dayKey(now),
    at: iso(now),
    reason,
    plannedSessionId: rec?.plannedSessionId,
    focus: rec?.focus,
    variant: rec?.variant,
  };
  await d.skips.put(skip);
  await patchDayState({ notToday: { reason, at: iso(now) } }, now);
  await refreshReminders(now);
}

export async function undoNotToday(now = new Date()): Promise<void> {
  const d = db();
  const date = dayKey(now);
  const cur = await d.dayStates.get(date);
  if (!cur?.notToday) return;
  const at = cur.notToday.at;
  const skip = (await d.skips.where("date").equals(date).toArray()).find((s) => s.at === at);
  if (skip) await d.skips.delete(skip.id);
  const { notToday: _drop, ...rest } = cur;
  void _drop;
  await d.dayStates.put({ ...rest, updatedAt: iso(now) });
}

/** Applies coach-proposed actions through the same deterministic overrides the UI uses. */
export async function applyCoachActions(actions: CoachAction[], rec: Recommendation | null, now = new Date()): Promise<void> {
  const d = db();
  const date = dayKey(now);
  for (const a of actions) {
    const cur = (await d.dayStates.get(date)) ?? { date, updatedAt: iso(now) };
    switch (a.type) {
      case "set_variant":
        await patchDayState({ variant: a.variant }, now);
        break;
      case "adjust_intensity":
        await patchDayState({ intensity: Math.max(-2, Math.min(2, (cur.intensity ?? 0) + a.delta)) }, now);
        break;
      case "set_focus":
        await patchDayState({ focus: a.focus, notToday: undefined }, now);
        break;
      case "change_format":
        await patchDayState({ shuffle: (cur.shuffle ?? 0) + 1, focus: cur.focus ?? rec?.focus }, now);
        break;
      case "not_today":
        await skipToday(a.reason, rec, now);
        break;
      case "reset_today":
        await resetToday(now);
        break;
      case "report_pain":
        break; // handled by the UI (opens the discomfort sheet)
    }
  }
}

// ---------------------------------------------------------------------------
// Workouts
// ---------------------------------------------------------------------------

export async function startWorkout(rec: Recommendation, now = new Date(), opts: { variant?: Variant } = {}): Promise<void> {
  if (!rec.workout) return;
  const d = db();
  const existing = await d.activeWorkout.get("current");
  if (existing) return; // resume instead
  const dayState = await d.dayStates.get(rec.date);
  const workout = rec.workout;
  const session: SessionLog = {
    id: uid(),
    date: dayKey(now),
    startedAt: iso(now),
    source: "guided",
    focus: workout.focus,
    variant: opts.variant ?? workout.variant,
    status: "in_progress",
    plannedMinutes: workout.estimatedMinutes,
    actualMinutes: 0,
    intensity: workout.intensity,
    workoutKey: workout.key,
    plannedSessionId: rec.plannedSessionId,
    exercises: [],
    feeling: dayState?.feeling,
    restart: rec.mode === "restart",
    updatedAt: iso(now),
  };
  const active: ActiveWorkout = {
    id: "current",
    sessionId: session.id,
    workout,
    stepIndex: 0,
    phase: "work",
    phaseStartedAt: now.getTime(),
    timerRunning: false,
    pausedMs: 0,
    startedAt: now.getTime(),
    logs: {},
    skippedItems: [],
    restExtra: 0,
    extended: false,
    restart: rec.mode === "restart",
    plannedSessionId: rec.plannedSessionId,
    feeling: dayState?.feeling,
    updatedAt: iso(now),
  };
  await d.transaction("rw", d.sessions, d.activeWorkout, async () => {
    await d.sessions.put(session);
    await d.activeWorkout.put(active);
  });
}

export async function saveActive(active: ActiveWorkout): Promise<void> {
  await db().activeWorkout.put({ ...active, updatedAt: iso(new Date()) });
}

export function logKey(blockIndex: number, itemIndex: number) {
  return `${blockIndex}:${itemIndex}`;
}

export interface FinishResult {
  session: SessionLog;
  events: ProgressionEvent[];
  week: ReturnType<typeof weekProgress>;
}

/** Completes (or partially saves) the active workout and runs progression + learning. */
export async function finishWorkout(feedback: WorkoutFeedback | null, now = new Date(), opts: { discard?: boolean } = {}): Promise<FinishResult | null> {
  const d = db();
  const active = await d.activeWorkout.get("current");
  if (!active) return null;
  const session = await d.sessions.get(active.sessionId);
  if (opts.discard || !session) {
    await d.transaction("rw", d.sessions, d.activeWorkout, async () => {
      if (session) await d.sessions.delete(session.id);
      await d.activeWorkout.delete("current");
    });
    return null;
  }
  const steps = flattenWorkout(active.workout);
  const mainSteps = steps.filter((s) => s.role === "main" || s.role === "conditioning" || s.role === "core");
  const logs = Object.values(active.logs);
  const completedFor = (key: string) =>
    Object.entries(active.logs)
      .filter(([k]) => k === key || k.startsWith(`${key}:was:`))
      .reduce((n, [, l]) => n + l.sets.filter((x) => x.completed).length, 0);
  const doneMain = mainSteps.filter((s) => {
    const key = logKey(s.blockIndex, s.itemIndex);
    return (active.skippedItems ?? []).includes(key) || active.logs[key]?.skipped || completedFor(key) >= s.set;
  }).length;
  const elapsedMs = now.getTime() - active.startedAt - active.pausedMs - (active.pausedAt ? now.getTime() - active.pausedAt : 0);
  const actualMinutes = Math.max(0.5, Math.round((elapsedMs / 60000) * 10) / 10);
  const status: SessionLog["status"] =
    mainSteps.length && doneMain >= mainSteps.length ? "completed" : doneMain > 0 || actualMinutes >= 4 ? "partial" : "abandoned";
  const finished: SessionLog = {
    ...session,
    endedAt: iso(now),
    status,
    actualMinutes,
    exercises: logs,
    feedback: feedback ?? undefined,
    extended: active.extended,
    updatedAt: iso(now),
  };

  const newPain: PainReport[] = [];
  if (feedback?.discomfort && feedback.discomfort.severity > 0) {
    newPain.push({
      id: uid(),
      createdAt: iso(now),
      date: finished.date,
      area: feedback.discomfort.area,
      severity: feedback.discomfort.severity,
      quality: "unsure",
      context: "feedback",
      sessionId: finished.id,
      status: "active",
      updatedAt: iso(now),
      followUps: [],
    });
  }

  const data = await readAll();
  const snap = data.snapshot!;
  const withSession: EngineSnapshot = {
    ...snap,
    sessions: [...snap.sessions.filter((s) => s.id !== finished.id), finished],
    pain: [...snap.pain, ...newPain],
  };
  const res = applySessionProgression(withSession, finished, now);
  const exerciseStates = { ...withSession.exerciseStates };
  res.states.forEach((s) => (exerciseStates[s.exerciseId] = s));
  const patternChoices = { ...withSession.patternChoices };
  res.patternChoices.forEach((c) => (patternChoices[c.pattern] = c));
  const after: EngineSnapshot = { ...withSession, exerciseStates, patternChoices, events: [...withSession.events, ...res.events] };
  const plan = after.plan ? reflowPlan(after.plan, after, dayKey(now), now) : null;

  await d.transaction("rw", d.tables, async () => {
    await d.sessions.put(finished);
    if (newPain.length) await d.pain.bulkPut(newPain);
    if (res.states.length) await d.exerciseStates.bulkPut(res.states);
    if (res.patternChoices.length) await d.patternChoices.bulkPut(res.patternChoices);
    if (res.events.length) await d.events.bulkPut(res.events);
    if (plan) await d.plans.put(plan);
    await d.activeWorkout.delete("current");
  });
  await relearn({ ...after, plan }, now);
  await refreshReminders(now);
  return { session: finished, events: res.events, week: weekProgress(plan, after.sessions) };
}

export interface ActivityInput {
  activity: ExternalActivity;
  minutes: number;
  effort: "light" | "moderate" | "hard";
  enjoyment?: "no" | "ok" | "yes";
  date: string;
  notes?: string;
}

/** Football, hikes, runs etc. count toward the week and fill cardio slots. */
export async function logActivity(input: ActivityInput, now = new Date()): Promise<void> {
  const d = db();
  const startedAt = input.date === dayKey(now) ? new Date(now.getTime() - input.minutes * 60000) : new Date(`${input.date}T12:00:00`);
  const session: SessionLog = {
    id: uid(),
    date: input.date,
    startedAt: iso(startedAt),
    endedAt: iso(new Date(startedAt.getTime() + input.minutes * 60000)),
    source: "external",
    focus: "cardio",
    variant: variantForMinutes(input.minutes),
    status: "completed",
    plannedMinutes: input.minutes,
    actualMinutes: input.minutes,
    intensity: 0,
    exercises: [],
    activity: input.activity,
    effort: input.effort,
    feedback: input.enjoyment ? { enjoyment: input.enjoyment } : undefined,
    notes: input.notes?.slice(0, 500),
    updatedAt: iso(now),
  };
  await d.sessions.put(session);
  await ensureCurrentWeek(now);
}

export async function deleteSession(id: string, now = new Date()): Promise<void> {
  await db().sessions.delete(id);
  await ensureCurrentWeek(now);
}

// ---------------------------------------------------------------------------
// Safety
// ---------------------------------------------------------------------------

export interface PainInput {
  area: BodyArea | "other";
  severity: number;
  quality: PainQuality;
  context: PainReport["context"];
  exerciseId?: string;
  sessionId?: string;
  notes?: string;
}

export async function reportPain(input: PainInput, now = new Date()): Promise<PainReport> {
  const report: PainReport = {
    id: uid(),
    createdAt: iso(now),
    date: dayKey(now),
    area: input.area,
    severity: Math.max(0, Math.min(10, Math.round(input.severity))),
    quality: input.quality,
    context: input.context,
    exerciseId: input.exerciseId,
    sessionId: input.sessionId,
    status: "active",
    updatedAt: iso(now),
    notes: input.notes?.slice(0, 500),
    followUps: [],
  };
  await db().pain.put(report);
  return report;
}

/** Chest pain, dizziness etc. during exercise: require professional clearance again. */
export async function reportRedFlag(now = new Date()): Promise<void> {
  const d = db();
  const profile = await d.profile.get("me");
  if (!profile) return;
  await d.profile.put({
    ...profile,
    readiness: { ...profile.readiness, status: "needs_clearance", answers: { ...profile.readiness.answers, chest_pain: true }, completedAt: iso(now) },
    updatedAt: iso(now),
  });
  await finishWorkout(null, now);
}

export async function updatePain(id: string, update: "better" | "same" | "worse" | "resolved", now = new Date()): Promise<void> {
  const d = db();
  const p = await d.pain.get(id);
  if (!p) return;
  const status: PainReport["status"] = update === "resolved" ? "resolved" : update === "better" ? "improving" : "active";
  const severity = update === "worse" ? Math.min(10, p.severity + 2) : p.severity;
  await d.pain.put({
    ...p,
    status,
    severity,
    updatedAt: iso(now),
    followUps: update === "resolved" ? p.followUps : [...p.followUps, { date: dayKey(now), status: update }],
  });
}

export async function confirmClearance(notes: string, now = new Date()): Promise<void> {
  const d = db();
  const profile = await d.profile.get("me");
  if (!profile) return;
  await d.profile.put({
    ...profile,
    readiness: { ...profile.readiness, status: "cleared_by_professional", clearanceConfirmedAt: iso(now), clearanceNotes: notes.slice(0, 500) },
    updatedAt: iso(now),
  });
}

export async function updateReadiness(answers: Record<ReadinessAnswerKey, boolean>, now = new Date()): Promise<void> {
  const d = db();
  const profile = await d.profile.get("me");
  if (!profile) return;
  await d.profile.put({ ...profile, readiness: evaluateReadiness(answers, now), updatedAt: iso(now) });
}

// ---------------------------------------------------------------------------
// Profile, plan & adaptation
// ---------------------------------------------------------------------------

/** Re-plans the current week from today, keeping completed sessions. */
async function replanCurrentWeek(now: Date): Promise<void> {
  const data = await readAll();
  const snap = data.snapshot;
  if (!snap) return;
  const today = dayKey(now);
  const { weekStart } = weekWindow(snap.profile, today);
  const firstWeek = data.plans.length <= 1;
  const plan = planWeek(snap, { weekStart, today, now, firstWeek });
  const prev = data.plans.find((p) => p.weekStart === weekStart);
  await db().plans.put(prev ? { ...plan, createdAt: prev.createdAt, adjustments: [...prev.adjustments, { at: iso(now), description: "Plan updated" }] } : plan);
  await refreshReminders(now);
}

export async function updateProfile(patch: Partial<Profile>, now = new Date(), opts: { replan?: boolean } = { replan: true }): Promise<void> {
  const d = db();
  const profile = await d.profile.get("me");
  if (!profile) return;
  await d.profile.put({ ...profile, ...patch, id: "me", updatedAt: iso(now) });
  if (opts.replan !== false) await replanCurrentWeek(now);
}

export async function setPlanPreferences(prefs: { targetSessions?: number; defaultVariant?: Variant }, now = new Date()): Promise<void> {
  const d = db();
  const cur = (await d.adaptation.get("adaptation")) ?? { id: "adaptation" as const, updatedAt: iso(now) };
  await d.adaptation.put({ ...cur, ...prefs, updatedAt: iso(now) });
  await replanCurrentWeek(now);
}

export async function respondToProposal(accept: boolean, now = new Date()): Promise<void> {
  const d = db();
  const cur = await d.adaptation.get("adaptation");
  if (!cur?.pendingProposal) return;
  const data = await readAll();
  const plan = data.snapshot?.plan;
  const next = { ...cur, pendingProposal: undefined, updatedAt: iso(now) };
  if (accept && cur.pendingProposal.kind === "increase_target") next.targetSessions = (cur.targetSessions ?? plan?.targets.target ?? 3) + 1;
  if (accept && cur.pendingProposal.kind === "longer_sessions") {
    const v = cur.defaultVariant ?? plan?.defaultVariant ?? "quick";
    next.defaultVariant = v === "minimum" ? "quick" : "full";
  }
  await d.adaptation.put(next);
  if (accept) await replanCurrentWeek(now);
}

export async function rescheduleSession(sessionId: string, toDay: string, now = new Date()): Promise<void> {
  const data = await readAll();
  const plan = data.snapshot?.plan;
  if (!plan) return;
  await db().plans.put(reschedule(plan, sessionId, toDay, now));
  await refreshReminders(now);
}

export async function dismissReflection(weekStart: string, now = new Date()): Promise<void> {
  const d = db();
  const r = await d.reflections.get(weekStart);
  if (r) await d.reflections.put({ ...r, dismissedAt: iso(now) });
}

export async function setInsightStatus(key: string, status: Insight["status"], now = new Date()): Promise<void> {
  const d = db();
  const i = await d.insights.get(key);
  if (!i) return;
  await d.insights.put({ ...i, status, updatedAt: iso(now) });
  if (status === "rejected" && key.startsWith("avoid_exercise:")) {
    const replacement = String(i.data?.replacement ?? "");
    const ex = EXERCISE_BY_ID[replacement];
    if (ex) {
      const choice = await d.patternChoices.get(ex.pattern);
      if (choice?.source === "preference" && choice.exerciseId === replacement) await d.patternChoices.delete(ex.pattern);
    }
  }
}

export async function updateSettings(patch: Partial<Settings>, now = new Date()): Promise<void> {
  const d = db();
  const cur = (await d.settings.get("settings")) ?? DEFAULT_SETTINGS;
  await d.settings.put({ ...cur, ...patch, id: "settings", updatedAt: iso(now) });
  if (patch.reminders) await refreshReminders(now);
}

export async function addMeasurement(value: number, now = new Date()): Promise<void> {
  await db().measurements.put({ id: uid(), date: dayKey(now), kind: "weight", value, updatedAt: iso(now) });
}

export async function deleteMeasurement(id: string): Promise<void> {
  await db().measurements.delete(id);
}

// ---------------------------------------------------------------------------
// Coach messages
// ---------------------------------------------------------------------------

export async function saveCoachMessage(m: Omit<CoachMessage, "id" | "at">, now = new Date()): Promise<CoachMessage> {
  const msg: CoachMessage = { id: uid(), at: iso(now), ...m };
  await db().coachMessages.put(msg);
  return msg;
}

export async function markProposalApplied(messageId: string, index: number, now = new Date()): Promise<void> {
  const d = db();
  const m = await d.coachMessages.get(messageId);
  if (!m?.proposals?.[index]) return;
  const proposals = m.proposals.map((p, i) => (i === index ? { ...p, appliedAt: iso(now) } : p));
  await d.coachMessages.put({ ...m, proposals });
}

export async function clearCoachHistory(): Promise<void> {
  await db().coachMessages.clear();
}

// ---------------------------------------------------------------------------
// Helpers used by the workout screen
// ---------------------------------------------------------------------------

export function emptyLog(exerciseId: string, role: ExerciseLog["role"], prescribed: ExerciseLog["prescribed"]): ExerciseLog {
  return { exerciseId, role, prescribed, sets: [] };
}

export function weekDoneCount(sessions: SessionLog[], weekStart: string, weekEnd: string): number {
  return sessions.filter((s) => s.date >= weekStart && s.date <= weekEnd && countsTowardWeek(s)).length;
}
