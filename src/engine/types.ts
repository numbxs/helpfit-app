/**
 * Domain types for the HelpFit training engine.
 *
 * The engine is pure and deterministic: every function takes plain data
 * (an EngineSnapshot plus explicit `now`) and returns plain data. Nothing in
 * src/engine touches the DOM, IndexedDB, the network, or Math.random.
 */

// ---------------------------------------------------------------------------
// Profile vocabulary
// ---------------------------------------------------------------------------

export type Goal =
  | "general_fitness"
  | "strength"
  | "muscle"
  | "weight_management"
  | "endurance"
  | "mobility"
  | "sports_performance";

export type ActivityLevel = "sedentary" | "light" | "moderate" | "active";

/** Experience with structured strength training. */
export type Experience = "none" | "some" | "regular";

export type Location = "home" | "gym" | "outdoors";

export type Equipment =
  | "dumbbells"
  | "kettlebell"
  | "bands"
  | "pullup_bar"
  | "bench"
  | "step"
  | "jump_rope"
  | "cardio_machine"
  | "cable_machine"
  | "barbell"
  | "bike";

export type TimeOfDay = "morning" | "midday" | "afternoon" | "evening";

export type Barrier =
  | "no_time"
  | "low_energy"
  | "mental_fatigue"
  | "motivation"
  | "boredom"
  | "forgot"
  | "too_hard"
  | "equipment_location"
  | "pain_soreness"
  | "unpredictable_schedule";

export type BodyArea =
  | "neck"
  | "shoulder"
  | "elbow"
  | "wrist"
  | "upper_back"
  | "lower_back"
  | "hip"
  | "knee"
  | "ankle"
  | "foot";

/** Activities and training styles the user can like or dislike. */
export type ActivityPreference =
  | "football"
  | "hiking"
  | "walking"
  | "running"
  | "cycling"
  | "swimming"
  | "strength"
  | "hiit"
  | "mobility"
  | "jumping"
  | "floor_work"
  | "burpees"
  | "machines";

export type Units = "metric" | "imperial";

export type ReadinessAnswerKey =
  | "heart_condition"
  | "chest_pain"
  | "dizziness"
  | "chronic_condition"
  | "medication"
  | "joint_problem"
  | "supervised_only";

export type ReadinessStatus = "clear" | "needs_clearance" | "cleared_by_professional";

export interface ReadinessCheck {
  answers: Record<ReadinessAnswerKey, boolean>;
  status: ReadinessStatus;
  completedAt: string;
  clearanceConfirmedAt?: string;
  clearanceNotes?: string;
}

export interface Profile {
  id: "me";
  createdAt: string;
  updatedAt: string;
  name?: string;
  goals: Goal[]; // first entry is the primary goal
  activityLevel: ActivityLevel;
  experience: Experience;
  daysPerWeek: number; // what the user says is realistic
  sessionMinutes: 5 | 15 | 30; // typical time available
  preferredTime?: TimeOfDay | "varies";
  preferredDays?: number[]; // 0 = Sunday ... 6 = Saturday (optional)
  locations: Location[];
  equipment: Equipment[];
  likes: ActivityPreference[];
  dislikes: ActivityPreference[];
  barriers: Barrier[];
  /** Areas with past injuries that are not currently painful: be careful, avoid high stress. */
  cautionAreas: BodyArea[];
  readiness: ReadinessCheck;
  ageYears?: number;
  heightCm?: number;
  weightKg?: number;
  units: Units;
  /** Weekday the training week starts on (defaults to the onboarding weekday). */
  weekStartsOn: number;
}

// ---------------------------------------------------------------------------
// Exercise library
// ---------------------------------------------------------------------------

export type ExerciseCategory = "strength" | "core" | "cardio" | "mobility" | "warmup" | "recovery";

export type Pattern =
  | "squat"
  | "hinge"
  | "lunge"
  | "push"
  | "pull"
  | "overhead"
  | "core_front"
  | "core_side"
  | "core_rotation"
  | "carry"
  | "cardio"
  | "mobility_hip"
  | "mobility_spine"
  | "mobility_shoulder"
  | "mobility_ankle"
  | "mobility_hamstring"
  | "mobility_full"
  | "breathing";

export type LoggingType = "reps" | "reps_load" | "time" | "cardio";

export type Impact = "low" | "moderate" | "high";

export type Stress = 1 | 2 | 3;

export interface Exercise {
  id: string;
  name: string;
  category: ExerciseCategory;
  pattern: Pattern;
  /** Difficulty within its pattern, 1 (easiest) to 5 (hardest). */
  tier: 1 | 2 | 3 | 4 | 5;
  muscles: string[];
  /** All listed equipment is required (or any one, if equipmentAny). Empty = bodyweight / household items only. */
  equipment: Equipment[];
  equipmentAny?: boolean;
  /** Approximate seconds per rep, used for duration estimates (default 3). */
  secondsPerRep?: number;
  /** Where it can be done. */
  where: Location[];
  logging: LoggingType;
  perSide?: boolean;
  impact: Impact;
  complexity: 1 | 2 | 3;
  /** How much each body area is loaded: 1 low, 2 moderate, 3 high. */
  stress: Partial<Record<BodyArea, Stress>>;
  /** Activity tags used for likes/dislikes and variety. */
  tags: ActivityPreference[];
  outdoor?: boolean;
  instructions: string[];
  cues: string[];
  mistakes: string[];
  safety: string[];
  easier?: string;
  harder?: string;
  alternatives: string[];
  defaults: {
    repRange?: [number, number];
    seconds?: number;
    maxSeconds?: number;
    loadKg?: number;
    loadStepKg?: number;
  };
}

// ---------------------------------------------------------------------------
// Workouts
// ---------------------------------------------------------------------------

export type Focus = "strength" | "cardio" | "mobility" | "recovery" | "restart";

export type Variant = "minimum" | "quick" | "full";

export type Format = "circuit" | "straight" | "intervals";

export type BlockRole = "warmup" | "main" | "core" | "conditioning" | "cooldown";

export interface IntervalSpec {
  workSeconds: number;
  restSeconds: number;
  rounds: number;
}

export interface WorkoutItem {
  exerciseId: string;
  sets: number;
  reps?: number;
  seconds?: number;
  loadKg?: number;
  restSeconds: number;
  intervals?: IntervalSpec;
  /** Short coaching note, e.g. "Conversational pace". */
  note?: string;
}

export interface WorkoutBlock {
  role: BlockRole;
  title: string;
  /** "circuit": rotate through items each round; "straight": all sets of one item before the next. */
  format: Format;
  rounds: number;
  items: WorkoutItem[];
}

export interface Workout {
  key: string; // deterministic identity of this generated workout
  focus: Focus;
  variant: Variant;
  title: string;
  objective: string;
  estimatedMinutes: number;
  intensity: number; // -2..+2 relative to normal
  blocks: WorkoutBlock[];
  notes: string[];
}

/** Flattened, executable step of a workout (one set or one timed bout). */
export interface WorkoutStep {
  index: number;
  blockIndex: number;
  itemIndex: number;
  exerciseId: string;
  role: BlockRole;
  set: number;
  totalSets: number;
  reps?: number;
  seconds?: number;
  loadKg?: number;
  intervals?: IntervalSpec;
  restAfterSeconds: number;
  note?: string;
}

// ---------------------------------------------------------------------------
// Logs
// ---------------------------------------------------------------------------

export type Difficulty = "too_easy" | "just_right" | "hard" | "too_hard";

export type Enjoyment = "no" | "ok" | "yes";

export type Feeling = "great" | "normal" | "tired" | "sore" | "busy";

export interface SetLog {
  reps?: number;
  seconds?: number;
  loadKg?: number;
  completed: boolean;
}

export interface ExerciseLog {
  exerciseId: string;
  role: BlockRole;
  prescribed: { sets: number; reps?: number; seconds?: number; loadKg?: number };
  sets: SetLog[];
  skipped?: boolean;
  skipReason?: "replaced" | "skipped" | "pain" | "too_hard" | "equipment";
  replacedBy?: string;
  /** Optional per-exercise effort captured during the workout. */
  effort?: "easy" | "good" | "tough";
  painReported?: boolean;
}

export interface WorkoutFeedback {
  difficulty?: Difficulty;
  enjoyment?: Enjoyment;
  discomfort?: { area: BodyArea | "other"; severity: number } | null;
}

export type SessionSource = "guided" | "external";

export type ExternalActivity = "football" | "hiking" | "walking" | "running" | "cycling" | "swimming" | "other";

export interface SessionLog {
  id: string;
  date: string; // local YYYY-MM-DD
  startedAt: string; // ISO
  endedAt?: string; // ISO
  source: SessionSource;
  focus: Focus;
  variant: Variant;
  status: "in_progress" | "completed" | "partial" | "abandoned";
  plannedMinutes: number;
  actualMinutes: number;
  intensity: number;
  workoutKey?: string;
  plannedSessionId?: string;
  exercises: ExerciseLog[];
  feedback?: WorkoutFeedback;
  feeling?: Feeling;
  /** True when this session came from a restart recommendation. */
  restart?: boolean;
  /** True if the user extended a minimum session ("keep going"). */
  extended?: boolean;
  activity?: ExternalActivity;
  effort?: "light" | "moderate" | "hard";
  notes?: string;
  updatedAt: string;
}

export interface SkipEvent {
  id: string;
  date: string;
  at: string; // ISO
  reason: Barrier | "rest" | "other";
  plannedSessionId?: string;
  focus?: Focus;
  variant?: Variant;
  note?: string;
}

export type PainQuality = "soreness" | "ache" | "sharp" | "unsure";

export interface PainReport {
  id: string;
  createdAt: string;
  date: string;
  area: BodyArea | "other";
  severity: number; // 0-10
  quality: PainQuality;
  context: "onboarding" | "workout" | "feedback" | "checkin" | "coach";
  exerciseId?: string;
  sessionId?: string;
  status: "active" | "improving" | "resolved";
  updatedAt: string;
  notes?: string;
  followUps: { date: string; status: "better" | "same" | "worse" }[];
}

export interface CheckIn {
  date: string;
  feeling: Feeling;
  at: string;
}

/** User's per-day overrides of the recommendation ("only 5 minutes", "make it easier", ...). */
export interface DayState {
  date: string;
  feeling?: Feeling;
  variant?: Variant;
  intensity?: number;
  focus?: Focus;
  shuffle?: number;
  swaps?: Record<string, string>;
  notToday?: { reason: SkipEvent["reason"]; at: string };
  /** What the app recommended (first time it was shown) — used to learn completion rates. */
  shown?: { focus: Focus; variant: Variant; at: string; plannedSessionId?: string };
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Progression
// ---------------------------------------------------------------------------

export interface ExerciseState {
  exerciseId: string;
  reps?: number;
  seconds?: number;
  loadKg?: number;
  successStreak: number;
  struggleStreak: number;
  exposures: number;
  lastPerformed?: string;
  history: {
    date: string;
    target: number;
    achieved: number;
    loadKg?: number;
    outcome: "success" | "hold" | "struggle" | "pain";
  }[];
  updatedAt: string;
}

/** Which exercise currently fills each movement pattern, per user. */
export interface PatternChoice {
  pattern: Pattern;
  exerciseId: string;
  /** "progression" = moved by the engine; "preference" = chosen/kept by user. */
  source: "initial" | "progression" | "regression" | "preference" | "safety";
  updatedAt: string;
}

export type ProgressionKind = "progress" | "regress" | "switch_harder" | "switch_easier" | "paused" | "load_up" | "load_down";

export interface ProgressionEvent {
  id: string;
  date: string;
  exerciseId: string;
  toExerciseId?: string;
  kind: ProgressionKind;
  from: string;
  to: string;
  reason: string;
}

// ---------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------

export interface WeeklyTargets {
  minimum: number;
  target: number;
  stretch: number;
}

export interface PlannedSession {
  id: string;
  day: string; // suggested day, YYYY-MM-DD
  focus: Focus;
  /** 1 = key session; higher = nice-to-have. */
  priority: number;
  status: "planned" | "done" | "passed";
  completedSessionId?: string;
  movedFrom?: string;
}

export interface WeekPlan {
  id: string; // = weekStart
  weekStart: string;
  weekEnd: string; // inclusive
  targets: WeeklyTargets;
  defaultVariant: Variant;
  sessions: PlannedSession[];
  rationale: string[];
  createdAt: string;
  updatedAt: string;
  adjustments: { at: string; description: string }[];
}

/** Long-lived adaptive settings, updated by weekly reflections and insights. */
export interface Adaptation {
  id: "adaptation";
  targetSessions?: number;
  defaultVariant?: Variant;
  pendingProposal?: { kind: "increase_target" | "longer_sessions"; createdAt: string; weekStart: string; description: string };
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Learning
// ---------------------------------------------------------------------------

export type InsightKey =
  | "prefers_shorter_sessions"
  | "handles_longer_sessions"
  | "evening_low_energy"
  | "best_time_window"
  | "prefers_outdoor_cardio"
  | "prefers_indoor_cardio"
  | "restart_friction"
  | "sessions_too_hard"
  | "sessions_too_easy"
  | "needs_variety"
  | `avoid_exercise:${string}`
  | `enjoys_focus:${string}`
  | `frequent_barrier:${string}`;

export interface Insight {
  key: InsightKey;
  statement: string;
  evidence: string;
  effect: string;
  confidence: "low" | "medium" | "high";
  status: "inferred" | "confirmed" | "rejected";
  data?: Record<string, string | number>;
  createdAt: string;
  updatedAt: string;
}

export interface WeeklyReflection {
  weekStart: string;
  weekEnd: string;
  createdAt: string;
  sessionsDone: number;
  activeMinutes: number;
  targets: WeeklyTargets;
  outcome: "below_minimum" | "minimum" | "target" | "stretch";
  accomplished: string[];
  improved: string[];
  barriers: string[];
  recommendations: string[];
  changes: { kind: "target" | "variant" | "proposal"; description: string; value?: number | string }[];
  dismissedAt?: string;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export interface ReminderSettings {
  enabled: boolean;
  frequency: "planned_days" | "daily" | "weekly_summary";
  time: string; // "HH:mm", or "auto" to use the best time window the app has learned
  quietStart: string; // "HH:mm"
  quietEnd: string; // "HH:mm"
}

export interface Settings {
  id: "settings";
  theme: "system" | "light" | "dark";
  reminders: ReminderSettings;
  ai: {
    enabled: boolean;
    /** Explicit consent to send training data (sessions, plan, progress) to the AI service. */
    shareTraining: boolean;
    /** Explicit consent to also send health data (pain, restrictions, readiness, body metrics). */
    shareHealth: boolean;
    accessToken?: string;
  };
  sound: boolean;
  haptics: boolean;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Engine snapshot
// ---------------------------------------------------------------------------

export interface EngineSnapshot {
  profile: Profile;
  sessions: SessionLog[];
  skips: SkipEvent[];
  pain: PainReport[];
  exerciseStates: Record<string, ExerciseState>;
  patternChoices: Partial<Record<Pattern, PatternChoice>>;
  plan: WeekPlan | null;
  insights: Insight[];
  adaptation: Adaptation | null;
  dayStates: DayState[];
  /** Recent progression events (newest last). */
  events: ProgressionEvent[];
}
