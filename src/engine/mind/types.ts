/**
 * Mind training: mindfulness, breathing, attention and working-memory drills, and
 * real-world focus blocks. Same rules as the training engine: pure, deterministic,
 * no I/O, no Math.random (drills use a seeded generator).
 */

export type MindGoal = "focus" | "attention_span" | "calm" | "memory" | "mindfulness" | "sleep";

export type MindCategory = "mindfulness" | "breathing" | "attention" | "memory" | "focus";

export type PracticeKind = "guided" | "breath_count" | "sart" | "flanker" | "nback" | "schulte" | "focus_block";

export type DayPart = "morning" | "midday" | "evening" | "any";

export interface BreathPacer {
  inhale: number;
  hold?: number;
  exhale: number;
  hold2?: number;
  /** A "double inhale" (physiological sigh): a short second sip of air before the exhale. */
  topUp?: number;
}

export interface ScriptSection {
  /** Relative share of the middle part of the session. */
  weight: number;
  cues: string[];
  /** Gentle reminders repeated through the section (e.g. "if you've drifted, come back"). */
  reminders?: string[];
  reminderEvery?: number; // seconds
}

export interface GuidedScript {
  intro: string[];
  sections: ScriptSection[];
  outro: string[];
}

export interface MindPractice {
  id: string;
  name: string;
  kind: PracticeKind;
  category: MindCategory;
  summary: string;
  /** Plain-language, evidence-informed reason — no overclaiming. */
  why: string;
  howTo: string[];
  safety?: string[];
  durations: number[]; // minutes offered
  defaultMinutes: number;
  bestFor: DayPart[];
  goals: MindGoal[];
  pacer?: BreathPacer;
  script?: GuidedScript;
  /** Best done with eyes closed / screen away (voice + bells recommended). */
  eyesClosed?: boolean;
}

export interface MindProfile {
  id: "mind";
  goals: MindGoal[];
  dailyMinutes: 3 | 5 | 10 | 15;
  /** Self-reported minutes of focus on one task before switching or checking the phone. */
  focusBaselineMinutes: number;
  voice: boolean;
  bells: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SartMetrics {
  trials: number;
  noGoTrials: number;
  commissionErrors: number; // tapped on the no-go digit
  omissionErrors: number; // missed a go digit
  meanRtMs: number | null;
  rtCv: number | null; // reaction-time variability (sd / mean)
}

export interface FlankerMetrics {
  trials: number;
  accuracy: number;
  congruentRtMs: number | null;
  incongruentRtMs: number | null;
  interferenceMs: number | null;
}

export interface NBackBlock {
  level: number;
  targets: number;
  hits: number;
  falseAlarms: number;
  trials: number;
}

export interface NBackMetrics {
  blocks: NBackBlock[];
  startLevel: number;
  endLevel: number;
  accuracy: number;
}

export interface SchulteMetrics {
  size: number;
  timeMs: number;
  mistakes: number;
}

export interface BreathCountMetrics {
  correctRounds: number;
  errors: number;
  lostCount: number;
}

export interface FocusMetrics {
  task: string;
  targetMinutes: number;
  focusedMinutes: number;
  distractions: number;
  completed: boolean;
  rating?: number; // 1-5 self-rated focus
}

export interface MindSessionLog {
  id: string;
  date: string; // local YYYY-MM-DD
  startedAt: string;
  endedAt: string;
  practiceId: string;
  kind: PracticeKind;
  category: MindCategory;
  plannedMinutes: number;
  actualMinutes: number;
  completed: boolean;
  /** Optional before/after self-ratings, 1 (low) – 5 (high). */
  before?: { calm?: number; focus?: number };
  after?: { calm?: number; focus?: number };
  sart?: SartMetrics;
  flanker?: FlankerMetrics;
  nback?: NBackMetrics;
  schulte?: SchulteMetrics;
  breathCount?: BreathCountMetrics;
  focus?: FocusMetrics;
  updatedAt: string;
}

/** Adaptive state for drills and focus blocks. */
export interface MindState {
  id: "mind-state";
  focusTargetMinutes: number;
  focusSuccessStreak: number;
  focusStruggleStreak: number;
  nbackLevel: number;
  breathCountMinutes: number;
  schulteSize: 4 | 5 | 6;
  updatedAt: string;
}

export interface MindChange {
  label: string;
  from: string;
  to: string;
  reason: string;
}
