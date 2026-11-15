"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CalendarDays, ShieldCheck, Sparkles } from "lucide-react";
import { ChoiceGroup, Segmented } from "@/components/kit/choice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  evaluateReadiness,
  READINESS_QUESTIONS,
  recommendToday,
  weekdayName,
  type ActivityLevel,
  type ActivityPreference,
  type Barrier,
  type BodyArea,
  type Equipment,
  type Experience,
  type Goal,
  type Location,
  type ReadinessAnswerKey,
  type TimeOfDay,
} from "@/engine";
import { useAppData, useHydrated } from "@/lib/hooks";
import { ACTIVITY_LEVELS, BARRIERS, BODY_AREAS, DISLIKES, EQUIPMENT, EXPERIENCE, FOCUS_NAME, GOALS, LIKES, LOCATIONS, TIMES } from "@/lib/labels";
import { completeOnboarding, confirmClearance, startWorkout } from "@/lib/services";
import { cn } from "@/lib/utils";

type Answers = Record<ReadinessAnswerKey, boolean | null>;

const EMPTY_READINESS: Answers = {
  heart_condition: null,
  chest_pain: null,
  dizziness: null,
  chronic_condition: null,
  medication: null,
  joint_problem: null,
  supervised_only: null,
};

const STEPS = ["welcome", "goals", "level", "time", "place", "likes", "barriers", "health", "details", "plan"] as const;
type Step = (typeof STEPS)[number];

export function OnboardingFlow() {
  const hydrated = useHydrated();
  if (!hydrated) return null;
  return <Flow />;
}

function Flow() {
  const router = useRouter();
  const data = useAppData();
  const [step, setStep] = useState<Step>("welcome");
  const [goals, setGoals] = useState<Goal[]>([]);
  const [activity, setActivity] = useState<ActivityLevel | null>(null);
  const [experience, setExperience] = useState<Experience | null>(null);
  const [days, setDays] = useState<number>(3);
  const [minutes, setMinutes] = useState<5 | 15 | 30>(15);
  const [time, setTime] = useState<TimeOfDay | "varies">("varies");
  const [locations, setLocations] = useState<Location[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [likes, setLikes] = useState<ActivityPreference[]>([]);
  const [dislikes, setDislikes] = useState<ActivityPreference[]>([]);
  const [barriers, setBarriers] = useState<Barrier[]>([]);
  const [readiness, setReadiness] = useState<Answers>(EMPTY_READINESS);
  const [painNow, setPainNow] = useState<BodyArea[]>([]);
  const [painSeverity, setPainSeverity] = useState<Record<string, number>>({});
  const [pastInjury, setPastInjury] = useState<BodyArea[]>([]);
  const [hasPain, setHasPain] = useState<"no" | "yes" | null>(null);
  const [age, setAge] = useState("");
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [units, setUnits] = useState<"metric" | "imperial">("metric");
  const [saving, setSaving] = useState(false);

  // Already onboarded → go to Today (unless we're showing the plan reveal).
  useEffect(() => {
    if (data?.snapshot && step !== "plan") router.replace("/");
  }, [data, step, router]);

  const idx = STEPS.indexOf(step);
  const next = () => setStep(STEPS[Math.min(STEPS.length - 1, idx + 1)]);
  const back = () => setStep(STEPS[Math.max(0, idx - 1)]);

  const readinessDone = Object.values(readiness).every((v) => v !== null);
  const valid: Record<Step, boolean> = {
    welcome: true,
    goals: goals.length > 0,
    level: Boolean(activity && experience),
    time: true,
    place: locations.length > 0,
    likes: true,
    barriers: true,
    health: readinessDone && hasPain !== null && (hasPain === "no" || painNow.length > 0),
    details: true,
    plan: true,
  };

  const toKg = (v: string) => {
    const n = Number(v);
    if (!v || !Number.isFinite(n) || n <= 0) return undefined;
    return units === "imperial" ? Math.round(n * 0.453592 * 10) / 10 : n;
  };
  const toCm = (v: string) => {
    const n = Number(v);
    if (!v || !Number.isFinite(n) || n <= 0) return undefined;
    return units === "imperial" ? Math.round(n * 2.54) : n;
  };

  const finish = async () => {
    setSaving(true);
    try {
      const answers = Object.fromEntries(Object.entries(readiness).map(([k, v]) => [k, Boolean(v)])) as Record<ReadinessAnswerKey, boolean>;
      await completeOnboarding({
        goals,
        activityLevel: activity!,
        experience: experience!,
        daysPerWeek: days,
        sessionMinutes: minutes,
        preferredTime: time,
        locations,
        equipment,
        likes,
        dislikes,
        barriers,
        readiness: answers,
        currentPain: painNow.map((area) => ({ area, severity: painSeverity[area] ?? 3, quality: "ache" as const })),
        cautionAreas: pastInjury.filter((a) => !painNow.includes(a)),
        ageYears: age ? Math.round(Number(age)) || undefined : undefined,
        heightCm: toCm(height),
        weightKg: toKg(weight),
        units,
      });
      setStep("plan");
    } finally {
      setSaving(false);
    }
  };

  const flagged = useMemo(() => {
    const answers = Object.fromEntries(Object.entries(readiness).map(([k, v]) => [k, Boolean(v)])) as Record<ReadinessAnswerKey, boolean>;
    return evaluateReadiness(answers, new Date()).status === "needs_clearance";
  }, [readiness]);

  if (step === "plan") return <PlanReveal />;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4">
      <div className="pt-safe sticky top-0 z-10 -mx-4 bg-background/90 px-4 pb-2 pt-3 backdrop-blur">
        <div className="flex items-center gap-3">
          {idx > 0 ? (
            <button type="button" onClick={back} aria-label="Back" className="flex size-11 items-center justify-center rounded-full border bg-card">
              <ArrowLeft className="size-5" />
            </button>
          ) : (
            <span className="size-11" />
          )}
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Setup progress" aria-valuenow={idx} aria-valuemin={0} aria-valuemax={STEPS.length - 2}>
            <div className="h-full rounded-full bg-chart-1 transition-[width] duration-500" style={{ width: `${(idx / (STEPS.length - 2)) * 100}%` }} />
          </div>
          <span className="w-11 text-right text-xs font-medium tabular-nums text-muted-foreground">{idx > 0 ? `${idx}/8` : ""}</span>
        </div>
      </div>

      <div key={step} className="animate-rise flex-1 pb-6 pt-4">
        {step === "welcome" && (
          <div className="flex min-h-[70dvh] flex-col justify-center">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-hero text-volt">
              <Sparkles className="size-7" />
            </div>
            <h1 className="mt-6 text-[34px] font-semibold leading-[1.08] tracking-[-0.03em]">Let's build training that fits your life.</h1>
            <p className="mt-4 text-[17px] leading-relaxed text-muted-foreground">
              A few quick questions — about two minutes. Then you'll get a realistic first week and can start a workout straight away.
            </p>
            <ul className="mt-6 space-y-2 text-[15px]">
              {["Short sessions, with a 5-minute version of every workout", "Adapts when you're busy, tired or away", "Your data stays on this device"].map((t) => (
                <li key={t} className="flex gap-2.5">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-chart-1" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
        )}

        {step === "goals" && (
          <Question title="What do you want to improve?" why="Pick up to two. The first one leads — it decides how sessions are balanced.">
            <ChoiceGroup ariaLabel="Goals" options={GOALS} value={goals} onChange={setGoals} multiple max={2} layout="list" />
          </Question>
        )}

        {step === "level" && (
          <Question title="Where are you starting from?" why="So the first sessions are challenging but doable. We calibrate from how they feel.">
            <p className="mb-2 text-sm font-semibold">Activity right now</p>
            <ChoiceGroup ariaLabel="Activity level" options={ACTIVITY_LEVELS} value={activity ? [activity] : []} onChange={(v) => setActivity(v[0] ?? null)} layout="list" />
            <p className="mb-2 mt-6 text-sm font-semibold">Strength training experience</p>
            <ChoiceGroup ariaLabel="Experience" options={EXPERIENCE} value={experience ? [experience] : []} onChange={(v) => setExperience(v[0] ?? null)} layout="list" />
          </Question>
        )}

        {step === "time" && (
          <Question title="How much time can you realistically give?" why="Be honest rather than ambitious — a plan you'll actually follow beats a perfect one. You can always do more.">
            <p className="mb-2 text-sm font-semibold">Days per week</p>
            <Segmented ariaLabel="Days per week" options={[1, 2, 3, 4, 5, 6].map((n) => ({ value: n, label: String(n) }))} value={days} onChange={setDays} />
            <p className="mb-2 mt-6 text-sm font-semibold">Typical session</p>
            <Segmented
              ariaLabel="Session length"
              options={[
                { value: 5 as const, label: "5 min" },
                { value: 15 as const, label: "15 min" },
                { value: 30 as const, label: "30 min" },
              ]}
              value={minutes}
              onChange={setMinutes}
            />
            <p className="mb-2 mt-6 text-sm font-semibold">
              Best time of day <span className="font-normal text-muted-foreground">(optional)</span>
            </p>
            <ChoiceGroup ariaLabel="Time of day" options={TIMES} value={[time]} onChange={(v) => setTime(v[0] ?? "varies")} />
          </Question>
        )}

        {step === "place" && (
          <Question title="Where will you train, and with what?" why="Workouts only use equipment you have. Gym means we'll assume standard gym kit.">
            <ChoiceGroup ariaLabel="Locations" options={LOCATIONS} value={locations} onChange={setLocations} multiple />
            <p className="mb-2 mt-6 text-sm font-semibold">
              Equipment at home <span className="font-normal text-muted-foreground">(skip if none)</span>
            </p>
            <ChoiceGroup ariaLabel="Equipment" options={EQUIPMENT} value={equipment} onChange={setEquipment} multiple />
          </Question>
        )}

        {step === "likes" && (
          <Question title="What do you enjoy — and what do you dislike?" why="Enjoyment predicts consistency. Liked activities show up more; disliked ones are avoided.">
            <p className="mb-2 text-sm font-semibold">I enjoy</p>
            <ChoiceGroup ariaLabel="Likes" options={LIKES} value={likes} onChange={setLikes} multiple />
            <p className="mb-2 mt-6 text-sm font-semibold">I'd rather avoid</p>
            <ChoiceGroup ariaLabel="Dislikes" options={DISLIKES} value={dislikes} onChange={setDislikes} multiple />
          </Question>
        )}

        {step === "barriers" && (
          <Question title="What usually gets in the way?" why="Pick any. The plan is built around these — not around a perfect week.">
            <ChoiceGroup ariaLabel="Barriers" options={BARRIERS} value={barriers} onChange={setBarriers} multiple layout="grid" />
          </Question>
        )}

        {step === "health" && (
          <Question title="A quick health check" why="Standard pre-exercise screening. If anything needs a professional's okay first, we'll tell you. Answers stay on your device.">
            <ul className="space-y-3">
              {READINESS_QUESTIONS.map((q) => (
                <li key={q.key} className="rounded-2xl border bg-card p-4">
                  <p className="text-[15px] leading-snug">{q.text}</p>
                  {q.hint && <p className="mt-1 text-xs text-muted-foreground">{q.hint}</p>}
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {([false, true] as const).map((v) => (
                      <button
                        key={String(v)}
                        type="button"
                        aria-pressed={readiness[q.key] === v}
                        onClick={() => setReadiness((r) => ({ ...r, [q.key]: v }))}
                        className={cn(
                          "h-11 rounded-xl border text-sm font-semibold transition",
                          readiness[q.key] === v ? "border-foreground bg-foreground text-background dark:border-primary dark:bg-primary dark:text-primary-foreground" : "bg-background",
                        )}
                      >
                        {v ? "Yes" : "No"}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-6 rounded-2xl border bg-card p-4">
              <p className="text-[15px] font-semibold">Any pain or injury right now?</p>
              <p className="mt-1 text-sm text-muted-foreground">We'll leave out exercises that load it. Nothing is assumed from past conversations.</p>
              <div className="mt-3">
                <Segmented
                  ariaLabel="Current pain"
                  options={[
                    { value: "no", label: "No" },
                    { value: "yes", label: "Yes" },
                  ]}
                  value={hasPain ?? ("" as "no")}
                  onChange={(v) => setHasPain(v)}
                />
              </div>
              {hasPain === "yes" && (
                <div className="animate-rise mt-4 space-y-4">
                  <ChoiceGroup ariaLabel="Painful areas" options={BODY_AREAS} value={painNow} onChange={setPainNow} multiple />
                  {painNow.map((a) => (
                    <div key={a}>
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">{BODY_AREAS.find((b) => b.value === a)?.label} — how bad?</span>
                        <span className="tabular-nums text-muted-foreground">{painSeverity[a] ?? 3}/10</span>
                      </div>
                      <input
                        type="range"
                        min={1}
                        max={10}
                        value={painSeverity[a] ?? 3}
                        onChange={(e) => setPainSeverity((s) => ({ ...s, [a]: Number(e.target.value) }))}
                        aria-label={`Pain severity for ${a}`}
                        className="h-9 w-full accent-[var(--chart-1)]"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-4 rounded-2xl border bg-card p-4">
              <p className="text-[15px] font-semibold">
                Past injuries to be careful with? <span className="font-normal text-muted-foreground">(optional)</span>
              </p>
              <p className="mt-1 text-sm text-muted-foreground">Not painful now, but you'd like to go easy — we'll avoid high-stress moves there.</p>
              <div className="mt-3">
                <ChoiceGroup ariaLabel="Past injuries" options={BODY_AREAS} value={pastInjury} onChange={setPastInjury} multiple />
              </div>
            </div>
            {flagged && (
              <p className="mt-4 rounded-2xl bg-warning-soft p-4 text-sm text-warning-foreground">
                Based on your answers, please check with a doctor or qualified professional before starting structured workouts. You can still finish setup and look around.
              </p>
            )}
          </Question>
        )}

        {step === "details" && (
          <Question title="A few optional details" why="These are optional. Age helps pace progression; height and weight are only shown in Progress if you choose to track them.">
            <div className="mb-4">
              <Segmented
                ariaLabel="Units"
                options={[
                  { value: "metric" as const, label: "kg · cm" },
                  { value: "imperial" as const, label: "lb · in" },
                ]}
                value={units}
                onChange={setUnits}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Age" value={age} onChange={setAge} suffix="yrs" />
              <Field label="Height" value={height} onChange={setHeight} suffix={units === "metric" ? "cm" : "in"} />
              <Field label="Weight" value={weight} onChange={setWeight} suffix={units === "metric" ? "kg" : "lb"} />
            </div>
          </Question>
        )}
      </div>

      <div className="pb-safe sticky bottom-0 -mx-4 bg-background/90 px-4 pb-4 pt-3 backdrop-blur">
        {step === "details" ? (
          <Button className="h-14 w-full rounded-2xl text-base" onClick={finish} disabled={saving}>
            {saving ? "Building your plan…" : "Build my first week"}
          </Button>
        ) : (
          <Button className="h-14 w-full rounded-2xl text-base" onClick={next} disabled={!valid[step]}>
            {step === "welcome" ? "Let's go" : "Continue"}
          </Button>
        )}
      </div>
    </div>
  );
}

function Question({ title, why, children }: { title: string; why: string; children: React.ReactNode }) {
  return (
    <section>
      <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.02em]">{title}</h1>
      <p className="mb-6 mt-2 text-[15px] leading-relaxed text-muted-foreground">{why}</p>
      {children}
    </section>
  );
}

function Field({ label, value, onChange, suffix }: { label: string; value: string; onChange: (v: string) => void; suffix: string }) {
  const id = `f-${label}`;
  return (
    <div>
      <Label htmlFor={id} className="mb-1.5 block text-sm">
        {label}
      </Label>
      <div className="relative">
        <Input id={id} inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))} className="h-12 rounded-xl pr-10 text-base" />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{suffix}</span>
      </div>
    </div>
  );
}

function PlanReveal() {
  const data = useAppData();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState("");
  if (!data?.snapshot?.plan) return <div className="p-8 text-center text-muted-foreground">Building your plan…</div>;
  const snap = data.snapshot;
  const plan = snap.plan!;
  const now = new Date();
  const rec = recommendToday(snap, now);
  const needsClearance = rec.kind === "needs_clearance";

  const startFirst = async (variant?: "minimum") => {
    setBusy(true);
    const r = variant ? recommendToday({ ...snap, dayStates: [{ date: rec.date, variant, updatedAt: now.toISOString() }] }, now) : rec;
    await startWorkout(r);
    router.push("/workout");
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4">
      <div className="pt-safe animate-rise flex-1 pb-6 pt-8">
        <p className="text-[13px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Your first week</p>
        <h1 className="mt-1 text-[30px] font-semibold leading-tight tracking-[-0.025em]">
          {plan.targets.target} sessions. Minimum {plan.targets.minimum}.
        </h1>
        <ul className="mt-4 space-y-1.5 text-[15px] text-muted-foreground">
          {plan.rationale.slice(1).map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <ol className="mt-6 space-y-2">
          {plan.sessions.map((s, i) => (
            <li key={s.id} className={cn("flex items-center gap-4 rounded-2xl border bg-card p-4", i === 0 && "border-foreground/40")}>
              <CalendarDays className="size-5 text-muted-foreground" />
              <div className="flex-1">
                <p className="font-semibold">{FOCUS_NAME[s.focus]}</p>
                <p className="text-sm text-muted-foreground">
                  {i === 0 && s.day === rec.date ? "Today" : weekdayName(s.day)} · {plan.defaultVariant === "minimum" ? 5 : plan.defaultVariant === "quick" ? 15 : 30} min
                  {s.priority > 1 ? " · bonus" : ""}
                </p>
              </div>
            </li>
          ))}
        </ol>
        {needsClearance && (
          <div className="mt-6 rounded-3xl border border-warning/40 bg-warning-soft p-5 text-warning-foreground">
            <div className="flex gap-3">
              <ShieldCheck className="mt-0.5 size-5 shrink-0" />
              <div>
                <p className="font-semibold">Check with a professional first</p>
                <p className="mt-1 text-sm">Your health answers suggest getting the okay from a doctor before structured exercise. When you have it, confirm below and your plan unlocks.</p>
                <Input className="mt-3 h-11 bg-background" placeholder="Optional note, e.g. any restrictions" value={notes} onChange={(e) => setNotes(e.target.value)} />
                <Button variant="outline" className="mt-2 h-11 w-full rounded-xl bg-background" onClick={() => confirmClearance(notes)}>
                  I've been cleared to exercise
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="pb-safe sticky bottom-0 -mx-4 space-y-2 bg-background/90 px-4 pb-4 pt-3 backdrop-blur">
        {!needsClearance && rec.kind === "workout" && (
          <>
            <Button className="h-14 w-full rounded-2xl bg-volt text-base text-volt-foreground hover:bg-volt/90" onClick={() => startFirst()} disabled={busy}>
              Start first workout · {rec.workout?.estimatedMinutes} min
            </Button>
            <Button variant="outline" className="h-12 w-full rounded-2xl" onClick={() => startFirst("minimum")} disabled={busy}>
              Start with just 5 minutes
            </Button>
          </>
        )}
        <Button variant="ghost" className="h-12 w-full rounded-2xl" onClick={() => router.replace("/")}>
          Look around first
        </Button>
      </div>
    </div>
  );
}
