import type { ActivityLevel, ActivityPreference, Barrier, BodyArea, Equipment, Experience, ExternalActivity, Focus, Goal, Location, TimeOfDay, Variant } from "@/engine";

export const GOALS: { value: Goal; label: string; hint: string }[] = [
  { value: "general_fitness", label: "General fitness", hint: "Feel fitter and healthier overall" },
  { value: "strength", label: "Strength", hint: "Get stronger in everyday and sport movements" },
  { value: "muscle", label: "Build muscle", hint: "Add muscle and tone" },
  { value: "endurance", label: "Endurance", hint: "Last longer — in football, on hikes" },
  { value: "weight_management", label: "Weight management", hint: "Support a healthy weight" },
  { value: "mobility", label: "Mobility", hint: "Move freely, feel less stiff" },
  { value: "sports_performance", label: "Sports performance", hint: "Play better, get injured less" },
];

export const ACTIVITY_LEVELS: { value: ActivityLevel; label: string; hint: string }[] = [
  { value: "sedentary", label: "Mostly sitting", hint: "Little exercise right now" },
  { value: "light", label: "Lightly active", hint: "Some walking, occasional exercise" },
  { value: "moderate", label: "Moderately active", hint: "Exercise 1–3 times a week" },
  { value: "active", label: "Very active", hint: "Exercise 4+ times a week" },
];

export const EXPERIENCE: { value: Experience; label: string; hint: string }[] = [
  { value: "none", label: "New to it", hint: "Little or no strength training" },
  { value: "some", label: "Some experience", hint: "I know the basics" },
  { value: "regular", label: "Experienced", hint: "I've trained regularly" },
];

export const LOCATIONS: { value: Location; label: string }[] = [
  { value: "home", label: "At home" },
  { value: "gym", label: "At a gym" },
  { value: "outdoors", label: "Outdoors" },
];

export const EQUIPMENT: { value: Equipment; label: string }[] = [
  { value: "dumbbells", label: "Dumbbells" },
  { value: "kettlebell", label: "Kettlebell" },
  { value: "bands", label: "Resistance bands" },
  { value: "pullup_bar", label: "Pull-up bar" },
  { value: "bench", label: "Bench" },
  { value: "step", label: "Stairs or a sturdy step" },
  { value: "jump_rope", label: "Jump rope" },
  { value: "bike", label: "Bike" },
];

export const LIKES: { value: ActivityPreference; label: string }[] = [
  { value: "football", label: "Football" },
  { value: "hiking", label: "Hiking" },
  { value: "walking", label: "Walking" },
  { value: "running", label: "Running" },
  { value: "cycling", label: "Cycling" },
  { value: "swimming", label: "Swimming" },
  { value: "strength", label: "Strength training" },
  { value: "hiit", label: "Intervals / HIIT" },
  { value: "mobility", label: "Stretching / yoga" },
];

export const DISLIKES: { value: ActivityPreference; label: string }[] = [
  { value: "running", label: "Running" },
  { value: "jumping", label: "Jumping" },
  { value: "burpees", label: "Burpees" },
  { value: "floor_work", label: "Getting on the floor" },
  { value: "hiit", label: "Intense intervals" },
  { value: "machines", label: "Gym machines" },
];

export const BARRIERS: { value: Barrier; label: string }[] = [
  { value: "no_time", label: "No time" },
  { value: "low_energy", label: "Low energy" },
  { value: "mental_fatigue", label: "Mentally drained after work" },
  { value: "motivation", label: "Hard to get started" },
  { value: "unpredictable_schedule", label: "Unpredictable schedule" },
  { value: "boredom", label: "Get bored" },
  { value: "forgot", label: "Forget" },
  { value: "too_hard", label: "Plans get too hard" },
  { value: "pain_soreness", label: "Pain or soreness" },
  { value: "equipment_location", label: "No equipment / place" },
];

export const SKIP_REASONS: { value: Barrier | "rest"; label: string }[] = [
  { value: "no_time", label: "No time" },
  { value: "low_energy", label: "Low energy" },
  { value: "mental_fatigue", label: "Mentally drained" },
  { value: "motivation", label: "Not feeling it" },
  { value: "pain_soreness", label: "Sore or in pain" },
  { value: "boredom", label: "Bored of it" },
  { value: "equipment_location", label: "Wrong place / no equipment" },
  { value: "rest", label: "Planned rest" },
];

export const BODY_AREAS: { value: BodyArea; label: string }[] = [
  { value: "neck", label: "Neck" },
  { value: "shoulder", label: "Shoulder" },
  { value: "elbow", label: "Elbow" },
  { value: "wrist", label: "Wrist / hand" },
  { value: "upper_back", label: "Upper back" },
  { value: "lower_back", label: "Lower back" },
  { value: "hip", label: "Hip" },
  { value: "knee", label: "Knee" },
  { value: "ankle", label: "Ankle" },
  { value: "foot", label: "Foot" },
];

export const TIMES: { value: TimeOfDay | "varies"; label: string }[] = [
  { value: "morning", label: "Morning" },
  { value: "midday", label: "Midday" },
  { value: "afternoon", label: "Afternoon" },
  { value: "evening", label: "Evening" },
  { value: "varies", label: "It varies" },
];

export const ACTIVITIES: { value: ExternalActivity; label: string }[] = [
  { value: "football", label: "Football" },
  { value: "hiking", label: "Hike" },
  { value: "walking", label: "Walk" },
  { value: "running", label: "Run" },
  { value: "cycling", label: "Ride" },
  { value: "swimming", label: "Swim" },
  { value: "other", label: "Other" },
];

export const FOCUS_NAME: Record<Focus, string> = {
  strength: "Strength",
  cardio: "Cardio",
  mobility: "Mobility & core",
  recovery: "Recovery",
  restart: "Restart",
};

export const VARIANT_NAME: Record<Variant, string> = { minimum: "5 min", quick: "15 min", full: "30 min" };

export const labelOf = <T extends string>(list: { value: T; label: string }[], v: T) => list.find((x) => x.value === v)?.label ?? v;
