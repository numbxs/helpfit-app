import { daysBetween } from "./dates";
import type { BodyArea, Exercise, PainReport, Profile, ReadinessAnswerKey, ReadinessCheck, ReadinessStatus } from "./types";

/**
 * Safety rules. Deliberately conservative and deterministic.
 * The app is not a medical device; these rules decide what NOT to prescribe and
 * when to recommend professional advice.
 */

export const READINESS_QUESTIONS: { key: ReadinessAnswerKey; text: string; hint?: string }[] = [
  { key: "heart_condition", text: "Has a doctor ever told you that you have a heart condition or high blood pressure?" },
  { key: "chest_pain", text: "Do you get chest pain at rest, during daily activities, or when you're physically active?" },
  {
    key: "dizziness",
    text: "In the past 12 months, have you lost balance because of dizziness or lost consciousness?",
    hint: "Answer no if the dizziness was only from over-breathing during hard exercise.",
  },
  {
    key: "chronic_condition",
    text: "Do you have another chronic medical condition that could affect exercise (for example diabetes, a lung condition, or you're pregnant)?",
  },
  { key: "medication", text: "Do you currently take prescribed medication for a chronic medical condition?" },
  {
    key: "joint_problem",
    text: "Do you have a bone, joint or soft-tissue problem (recent or current) that could get worse with more activity?",
    hint: "If yes, we'll ask which area so workouts can avoid it.",
  },
  { key: "supervised_only", text: "Has a doctor ever said you should only do medically supervised physical activity?" },
];

/** Answers that require professional clearance before structured workouts are prescribed. */
const CLEARANCE_KEYS: ReadinessAnswerKey[] = [
  "heart_condition",
  "chest_pain",
  "dizziness",
  "chronic_condition",
  "medication",
  "supervised_only",
];

export function evaluateReadiness(answers: Record<ReadinessAnswerKey, boolean>, now: Date): ReadinessCheck {
  const needs = CLEARANCE_KEYS.some((k) => answers[k]);
  return { answers, status: needs ? "needs_clearance" : "clear", completedAt: now.toISOString() };
}

export function readinessFlags(check: ReadinessCheck): ReadinessAnswerKey[] {
  return CLEARANCE_KEYS.filter((k) => check.answers[k]);
}

export function hasUrgentSymptoms(check: ReadinessCheck): boolean {
  return Boolean(check.answers.chest_pain || check.answers.dizziness);
}

export function canPrescribe(status: ReadinessStatus): boolean {
  return status === "clear" || status === "cleared_by_professional";
}

// ---------------------------------------------------------------------------
// Pain & restrictions
// ---------------------------------------------------------------------------

export function activePain(pain: PainReport[]): PainReport[] {
  return pain.filter((p) => p.status !== "resolved");
}

/**
 * Maximum allowed stress per body area.
 * - Active pain, mild (<=3) and not sharp: only low stress (1) allowed.
 * - Active pain, moderate+ (>=4) or sharp: no loading at all (0).
 * - "Improving" pain: low stress allowed.
 * - Past injury / caution area: no high stress (max 2).
 */
export function stressLimits(profile: Pick<Profile, "cautionAreas">, pain: PainReport[]): Partial<Record<BodyArea, number>> {
  const limits: Partial<Record<BodyArea, number>> = {};
  const set = (a: BodyArea, v: number) => {
    limits[a] = Math.min(limits[a] ?? 3, v);
  };
  for (const a of profile.cautionAreas) set(a, 2);
  for (const p of activePain(pain)) {
    if (p.area === "other") continue;
    if (p.status === "improving") set(p.area, 1);
    else if (p.severity >= 4 || p.quality === "sharp") set(p.area, 0);
    else set(p.area, 1);
  }
  return limits;
}

export function violatesLimits(ex: Exercise, limits: Partial<Record<BodyArea, number>>): BodyArea | null {
  for (const [area, stress] of Object.entries(ex.stress) as [BodyArea, number][]) {
    const max = limits[area];
    if (max !== undefined && stress > max) return area;
  }
  return null;
}

const IMPACT_SENSITIVE: BodyArea[] = ["knee", "ankle", "foot", "hip", "lower_back"];

export function bansHighImpact(limits: Partial<Record<BodyArea, number>>): boolean {
  return IMPACT_SENSITIVE.some((a) => limits[a] !== undefined && (limits[a] as number) < 3);
}

export interface PainAdvice {
  level: "info" | "caution" | "see_professional";
  message: string;
}

/**
 * What to tell the user about a pain report. Recommends professional assessment when
 * pain is severe, sharp, persistent (>7 days) or recurring.
 */
export function painAdvice(report: PainReport, allReports: PainReport[], today: string): PainAdvice {
  const sameArea = allReports.filter((r) => r.area === report.area && r.id !== report.id && daysBetween(r.date, today) <= 21);
  const ongoingDays = daysBetween(report.date, today);
  const worse = report.followUps.some((f) => f.status === "worse");
  if (report.severity >= 7 || report.quality === "sharp" || worse) {
    return {
      level: "see_professional",
      message:
        "Sharp, severe or worsening pain is a signal to stop that activity. Please get it checked by a physiotherapist or doctor before loading it again. Workouts will avoid this area until you mark it better.",
    };
  }
  if (ongoingDays >= 7 || sameArea.length >= 2) {
    return {
      level: "see_professional",
      message:
        "This has been bothering you for a while. A physiotherapist or doctor can find the cause — workouts will keep working around it in the meantime.",
    };
  }
  if (report.severity >= 4) {
    return {
      level: "caution",
      message: "Workouts will skip exercises that load this area. If it isn't settling within a few days, get it assessed.",
    };
  }
  return {
    level: "info",
    message: "Noted. Workouts will go easy on this area. Tell me when it feels better.",
  };
}

export const RED_FLAG_MESSAGE =
  "Stop exercising now. Chest pain or pressure, unusual shortness of breath, dizziness or fainting can be serious. If symptoms are severe or don't settle quickly, call your local emergency number. Please see a doctor before your next workout.";

export const AREA_LABEL: Record<BodyArea | "other", string> = {
  neck: "neck",
  shoulder: "shoulder",
  elbow: "elbow",
  wrist: "wrist / hand",
  upper_back: "upper back",
  lower_back: "lower back",
  hip: "hip",
  knee: "knee",
  ankle: "ankle",
  foot: "foot",
  other: "another area",
};
