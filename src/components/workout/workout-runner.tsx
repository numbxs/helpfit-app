"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { HeartPulse, Info, Pause, Play, Repeat2, SkipForward, X } from "lucide-react";
import { Stepper } from "@/components/kit/bits";
import { HowToSheet, ReplaceSheet } from "@/components/shared/exercise-sheets";
import { PainSheet } from "@/components/shared/pain-sheet";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  buildSelectionContext,
  EXERCISE_BY_ID,
  formatLoad,
  formatTarget,
  replacementsFor,
  violatesLimits,
  stressLimits,
  type EngineSnapshot,
  type PainReport,
  type WorkoutFeedback,
  type WorkoutStep,
} from "@/engine";
import type { ActiveWorkout, AppData } from "@/lib/db";
import { finishWorkout, reportRedFlag, saveActive, type FinishResult } from "@/lib/services";
import { cn } from "@/lib/utils";
import { beep, buzz } from "./feedback";
import { FeedbackView, SummaryView } from "./finish-views";
import {
  completeSet,
  enterStep,
  extendWorkout,
  isTimed,
  itemKey,
  LEAD_IN_MS,
  nextIndex,
  pause,
  progressFraction,
  replaceCurrent,
  resume,
  skipItem,
  stepsOf,
  stepTotalSeconds,
} from "./logic";

function useWakeLock() {
  useEffect(() => {
    type Sentinel = { release: () => Promise<void> };
    let lock: Sentinel | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<Sentinel> } };
    const acquire = async () => {
      try {
        if (nav.wakeLock && document.visibilityState === "visible") lock = await nav.wakeLock.request("screen");
      } catch {
        lock = null;
      }
    };
    acquire();
    const onVis = () => document.visibilityState === "visible" && acquire();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      lock?.release().catch(() => undefined);
    };
  }, []);
}

const fmtClock = (secs: number) => {
  const s = Math.max(0, Math.ceil(secs));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export function WorkoutRunner({ data, initial }: { data: AppData; initial: ActiveWorkout }) {
  const router = useRouter();
  const snap = data.snapshot as EngineSnapshot;
  const settings = data.settings;
  const [a, setA] = useState<ActiveWorkout>(() => ({ ...initial, skippedItems: initial.skippedItems ?? [], restExtra: initial.restExtra ?? 0 }));
  const [result, setResult] = useState<FinishResult | null>(null);
  const [confirmExit, setConfirmExit] = useState(false);
  const [howTo, setHowTo] = useState<string | null>(null);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [painOpen, setPainOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const aRef = useRef(a);
  useWakeLock();

  const steps = useMemo(() => stepsOf(a), [a]);
  const step: WorkoutStep | undefined = steps[a.stepIndex];
  const ex = step ? EXERCISE_BY_ID[step.exerciseId] : undefined;
  const effectiveNow = a.pausedAt ?? now;

  const update = useCallback((next: ActiveWorkout) => {
    aRef.current = next;
    setA(next);
    saveActive(next).catch(() => undefined);
  }, []);

  const cue = useCallback(
    (kind: "tick" | "go" | "done") => {
      if (settings.sound) beep(kind);
      if (settings.haptics) buzz(kind === "done" ? [80, 60, 80] : 50);
    },
    [settings.sound, settings.haptics],
  );

  // ---- Timer loop: automatic transitions and audio cues --------------------
  const lastCueRef = useRef<string>("");
  useEffect(() => {
    const id = window.setInterval(() => {
      const t = Date.now();
      setNow(t);
      const cur = aRef.current;
      if (cur.pausedAt) return;
      const list = stepsOf(cur);
      const st = list[cur.stepIndex];
      if (!st) return;
      const e = EXERCISE_BY_ID[st.exerciseId];
      const el = (t - cur.phaseStartedAt) / 1000;
      let key = "";
      if (cur.phase === "work" && isTimed(st) && cur.timerRunning) {
        const total = stepTotalSeconds(st, Boolean(e?.perSide && !st.intervals));
        if (el >= total) {
          cue("done");
          update(completeSet(cur, { seconds: st.seconds ?? st.intervals?.workSeconds, loadKg: st.loadKg }, t));
          return;
        }
        if (el < 0) {
          const left = Math.ceil(-el);
          if (left <= 3) key = `lead-${cur.stepIndex}-${left}`;
        } else if (st.intervals) {
          const cycle = st.intervals.workSeconds + st.intervals.restSeconds;
          key = `iv-${cur.stepIndex}-${Math.floor(el / cycle)}-${el % cycle < st.intervals.workSeconds ? "w" : "r"}`;
        } else if (e?.perSide && st.seconds && el >= st.seconds) {
          key = `side-${cur.stepIndex}`;
        }
      } else if (cur.phase === "rest") {
        const total = st.restAfterSeconds + cur.restExtra;
        if (el >= total) {
          cue("go");
          update(enterStep(cur, nextIndex(list, cur.stepIndex, cur.skippedItems), t));
          return;
        }
        const left = Math.ceil(total - el);
        if (left <= 3) key = `rest-${cur.stepIndex}-${left}`;
      }
      if (key && key !== lastCueRef.current) {
        lastCueRef.current = key;
        cue(key.startsWith("iv") || key.startsWith("side") ? "go" : "tick");
      }
    }, 200);
    return () => window.clearInterval(id);
  }, [update, cue]);

  const elapsed = (effectiveNow - a.phaseStartedAt) / 1000;
  const restTotal = step ? step.restAfterSeconds + a.restExtra : 0;

  // ---- Actions -----------------------------------------------------------------
  // Per-step adjustments; keyed so they reset automatically when the step changes.
  const stepToken = `${a.stepIndex}:${a.phase}`;
  const [adj, setAdj] = useState<{ token: string; reps: number | null; load: number | null }>({ token: "", reps: null, load: null });
  const reps = adj.token === stepToken ? adj.reps : null;
  const load = adj.token === stepToken ? adj.load : null;
  const setReps = (v: number) => setAdj({ token: stepToken, reps: v, load });
  const setLoad = (v: number) => setAdj({ token: stepToken, reps, load: v });

  const lastLoadFor = (key: string) => a.logs[key]?.sets.filter((s) => s.loadKg !== undefined).at(-1)?.loadKg;

  const doneSet = () => {
    if (!step) return;
    const key = itemKey(step);
    const usedLoad = load ?? lastLoadFor(key) ?? step.loadKg;
    if (isTimed(step)) {
      const secs = Math.max(1, Math.round(Math.max(0, elapsed)));
      update(completeSet(a, { seconds: Math.min(secs, step.seconds ?? secs), loadKg: usedLoad }, Date.now()));
    } else {
      update(completeSet(a, { reps: reps ?? step.reps, loadKg: usedLoad }, Date.now()));
    }
    cue("tick");
  };

  const togglePause = () => update(a.pausedAt ? resume(a, Date.now()) : pause(a, Date.now()));

  const ctx = useMemo(() => buildSelectionContext(snap), [snap]);
  const replacementOptions = useMemo(() => (ex ? replacementsFor(ex.id, ctx) : []), [ex, ctx]);

  const onReplace = (id: string) => {
    const nx = EXERCISE_BY_ID[id];
    const [min, max] = nx.defaults.repRange ?? [8, 12];
    const defaults =
      nx.logging === "reps" || nx.logging === "reps_load"
        ? { reps: Math.round(min + (max - min) * 0.25), loadKg: snap.exerciseStates[id]?.loadKg ?? nx.defaults.loadKg }
        : { seconds: step?.seconds ?? nx.defaults.seconds ?? 30 };
    update(replaceCurrent(a, id, Date.now(), defaults));
    setReplaceOpen(false);
    toast(`Swapped to ${nx.name}`);
  };

  const onPainSaved = (report: PainReport) => {
    if (!step) return;
    const key = itemKey(step);
    const log = a.logs[key];
    let next: ActiveWorkout = { ...a, logs: log ? { ...a.logs, [key]: { ...log, painReported: true } } : a.logs };
    // Skip every remaining exercise that loads the painful area.
    const limits = stressLimits(snap.profile, [
      ...snap.pain,
      report,
    ]);
    const toSkip = new Set<string>();
    steps.forEach((s, i) => {
      if (i < a.stepIndex) return;
      const e = EXERCISE_BY_ID[s.exerciseId];
      if (violatesLimits(e, limits)) toSkip.add(itemKey(s));
    });
    const names: string[] = [];
    for (const k of toSkip) {
      const s = steps.find((x) => itemKey(x) === k)!;
      names.push(EXERCISE_BY_ID[s.exerciseId].name);
      next = skipItem(next, "pain", Date.now(), k);
    }
    if (!toSkip.has(key)) next = { ...next, logs: { ...next.logs, [key]: { ...(next.logs[key] ?? { exerciseId: step.exerciseId, role: step.role, prescribed: { sets: step.totalSets }, sets: [] }), painReported: true } } };
    update(next.phase === "complete" ? next : next);
    if (names.length) toast("Skipping exercises that load that area", { description: [...new Set(names)].join(", ") });
  };

  const saveFeedback = async (fb: WorkoutFeedback) => {
    setSaving(true);
    try {
      await saveActive(a);
      const r = await finishWorkout(fb);
      setResult(r);
    } finally {
      setSaving(false);
    }
  };

  // ---- Screens -------------------------------------------------------------
  if (result) return <SummaryView result={result} onDone={() => router.replace("/")} />;

  if (a.phase === "feedback") {
    return <FeedbackView saving={saving} onSave={saveFeedback} onBack={() => update({ ...a, phase: "complete" })} title={a.workout.title} />;
  }

  if (a.phase === "complete") {
    const isMin = a.workout.variant === "minimum" && !a.extended;
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
        <div className="animate-pop flex size-20 items-center justify-center rounded-full bg-volt text-4xl text-volt-foreground">✓</div>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight">{isMin ? "That's your 5 minutes" : "Workout complete"}</h1>
        <p className="mt-2 max-w-xs text-muted-foreground">{isMin ? "It counts. Want to keep going, or call it a win?" : "Nice work. Two quick questions and you're done."}</p>
        <div className="mt-8 grid w-full max-w-sm gap-2">
          {isMin && (
            <Button className="h-14 rounded-2xl text-base" onClick={() => update(extendWorkout(a, Date.now()))}>
              Keep going — about 5 more minutes
            </Button>
          )}
          <Button variant={isMin ? "outline" : "default"} className="h-14 rounded-2xl text-base" onClick={() => update({ ...a, phase: "feedback" })}>
            {isMin ? "Finish here" : "Continue"}
          </Button>
        </div>
      </div>
    );
  }

  if (!step || !ex) return null;

  const block = a.workout.blocks[step.blockIndex];
  const item = block.items[step.itemIndex];
  const elapsedTotal = (effectiveNow - a.startedAt - a.pausedMs) / 1000;
  const roundLabel = block.format === "straight" ? (step.totalSets > 1 ? `Set ${step.set} of ${step.totalSets}` : null) : block.rounds > 1 ? `Round ${step.set} of ${step.totalSets}` : null;
  const nextIdx = nextIndex(steps, a.stepIndex, a.skippedItems);
  const nextStep = steps[nextIdx];
  const nextEx = nextStep ? EXERCISE_BY_ID[nextStep.exerciseId] : null;
  const units = snap.profile.units;
  const key = itemKey(step);
  const currentLoad = load ?? lastLoadFor(key) ?? step.loadKg;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4">
      {/* Top bar */}
      <div className="pt-safe sticky top-0 z-10 -mx-4 bg-background/90 px-4 pb-3 backdrop-blur">
        <div className="flex items-center gap-3 pt-3">
          <button type="button" aria-label="End workout" onClick={() => setConfirmExit(true)} className="flex size-11 items-center justify-center rounded-full border bg-card">
            <X className="size-5" />
          </button>
          <div className="flex-1">
            <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round(progressFraction(a) * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Workout progress">
              <div className="h-full rounded-full bg-chart-1 transition-[width] duration-500" style={{ width: `${progressFraction(a) * 100}%` }} />
            </div>
            <p className="mt-1.5 flex justify-between text-xs font-medium text-muted-foreground">
              <span className="truncate">{a.workout.title}</span>
              <span className="tabular-nums">{fmtClock(elapsedTotal)}</span>
            </p>
          </div>
          <button type="button" aria-label={a.pausedAt ? "Resume" : "Pause"} onClick={togglePause} className="flex size-11 items-center justify-center rounded-full border bg-card">
            {a.pausedAt ? <Play className="size-5" /> : <Pause className="size-5" />}
          </button>
        </div>
      </div>

      {a.pausedAt && (
        <div className="mb-3 rounded-2xl bg-warning-soft px-4 py-3 text-center text-sm font-semibold text-warning-foreground">Paused — tap ▶ to resume</div>
      )}

      {a.phase === "rest" ? (
        <RestView
          left={restTotal - elapsed}
          total={restTotal}
          nextName={nextEx?.name}
          nextTarget={nextStep && nextEx ? formatTarget(nextEx, nextStep, units) : undefined}
          onAdd={() => update({ ...a, restExtra: a.restExtra + 15 })}
          onSkip={() => update(enterStep(a, nextIdx, Date.now()))}
          effortFor={step.set === step.totalSets && (step.role === "main" || step.role === "core") ? ex.name : null}
          effort={a.logs[key]?.effort}
          onEffort={(e) => update({ ...a, logs: { ...a.logs, [key]: { ...a.logs[key], effort: e } } })}
        />
      ) : (
        <div key={a.stepIndex} className="animate-rise flex flex-1 flex-col">
          <div className="pt-2">
            <p className="text-[13px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              {block.title}
              {roundLabel ? ` · ${roundLabel}` : ""}
            </p>
            <div className="mt-1 flex items-start justify-between gap-2">
              <h1 className="text-[32px] font-semibold leading-[1.08] tracking-[-0.025em]">{ex.name}</h1>
              <button type="button" onClick={() => setHowTo(ex.id)} aria-label={`How to do ${ex.name}`} className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted">
                <Info className="size-5" />
              </button>
            </div>
            {(item.note || step.note) && <p className="mt-1 text-[15px] text-muted-foreground">{item.note ?? step.note}</p>}
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {ex.cues.slice(0, 2).map((c) => (
                <li key={c} className="rounded-full bg-accent px-3 py-1 text-[13px] font-medium text-accent-foreground">
                  {c}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-1 flex-col justify-center py-6">
            {isTimed(step) ? (
              <TimerView step={step} perSide={Boolean(ex.perSide)} elapsed={elapsed} running={a.timerRunning} paused={Boolean(a.pausedAt)} />
            ) : (
              <div className="space-y-6">
                <div className="rounded-3xl border bg-card p-5">
                  <Stepper size="lg" value={reps ?? step.reps ?? 0} onChange={setReps} min={0} max={200} label={`reps${ex.perSide ? " each side" : ""}`} />
                  <p className="mt-3 text-center text-sm text-muted-foreground">Target {step.reps}. Adjust if you did more or fewer.</p>
                </div>
                {currentLoad !== undefined && (
                  <div className="rounded-3xl border bg-card p-4">
                    <Stepper value={currentLoad} onChange={setLoad} min={0} max={300} step={ex.defaults.loadStepKg ?? 1} label="weight" format={(v) => formatLoad(v, units)} />
                    {!snap.exerciseStates[ex.id] && <p className="mt-2 text-center text-xs text-muted-foreground">Suggested start — set it to what you actually use.</p>}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="pb-safe space-y-2 pb-4">
            {isTimed(step) ? (
              <Button className="h-16 w-full rounded-2xl text-lg" variant="outline" onClick={doneSet} disabled={Boolean(a.pausedAt)}>
                {elapsed < 0 ? "Skip countdown" : "Done early"}
              </Button>
            ) : (
              <button
                type="button"
                onClick={doneSet}
                disabled={Boolean(a.pausedAt)}
                className="h-16 w-full rounded-2xl bg-volt text-lg font-semibold text-volt-foreground shadow-[0_8px_24px_-12px_var(--volt)] transition active:scale-[0.98] disabled:opacity-50"
              >
                Done
              </button>
            )}
            <div className="grid grid-cols-3 gap-2">
              <ToolButton icon={<Repeat2 className="size-5" />} label="Replace" onClick={() => setReplaceOpen(true)} disabled={step.role === "warmup" || step.role === "cooldown"} />
              <ToolButton icon={<SkipForward className="size-5" />} label="Skip" onClick={() => update(skipItem(a, "skipped", Date.now()))} />
              <ToolButton icon={<HeartPulse className="size-5" />} label="Pain" onClick={() => setPainOpen(true)} />
            </div>
            {nextEx && (
              <p className="pt-1 text-center text-sm text-muted-foreground">
                Next: <span className="font-medium text-foreground">{nextEx.name}</span>
              </p>
            )}
          </div>
        </div>
      )}

      <HowToSheet exerciseId={howTo} open={Boolean(howTo)} onOpenChange={(o) => !o && setHowTo(null)} />
      <ReplaceSheet exerciseId={ex.id} options={replacementOptions} open={replaceOpen} onOpenChange={setReplaceOpen} onPick={onReplace} />
      <PainSheet
        open={painOpen}
        onOpenChange={setPainOpen}
        context="workout"
        exerciseId={ex.id}
        sessionId={a.sessionId}
        onSaved={onPainSaved}
        onRedFlag={async () => {
          await reportRedFlag();
          router.replace("/");
        }}
      />
      <AlertDialog open={confirmExit} onOpenChange={setConfirmExit}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End this workout?</AlertDialogTitle>
            <AlertDialogDescription>What you've done so far still counts. Nothing to make up later.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              className="h-12 w-full rounded-2xl"
              onClick={() => {
                setConfirmExit(false);
                update({ ...a, phase: "feedback", pausedAt: undefined });
              }}
            >
              Save what I did
            </Button>
            <Button
              variant="outline"
              className="h-12 w-full rounded-2xl"
              onClick={async () => {
                await finishWorkout(null, new Date(), { discard: true });
                router.replace("/");
              }}
            >
              Discard workout
            </Button>
            <Button variant="ghost" className="h-12 w-full rounded-2xl" onClick={() => setConfirmExit(false)}>
              Keep going
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ToolButton({ icon, label, onClick, disabled }: { icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-2xl border bg-card text-xs font-semibold transition active:scale-95 disabled:opacity-40"
    >
      {icon}
      {label}
    </button>
  );
}

function Ring({ fraction, children, tone = "volt" }: { fraction: number; children: React.ReactNode; tone?: "volt" | "muted" }) {
  const size = 248;
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <svg width={size} height={size} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeOpacity={0.1} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={tone === "volt" ? "var(--chart-1)" : "var(--chart-3)"}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c * Math.max(0, Math.min(1, fraction))} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dasharray 200ms linear" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}

function TimerView({ step, perSide, elapsed, running, paused }: { step: WorkoutStep; perSide: boolean; elapsed: number; running: boolean; paused: boolean }) {
  if (running && elapsed < 0) {
    return (
      <Ring fraction={1 + elapsed / (LEAD_IN_MS / 1000)} tone="muted">
        <p className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">Get ready</p>
        <p className="text-7xl font-semibold tabular-nums">{Math.ceil(-elapsed)}</p>
      </Ring>
    );
  }
  if (step.intervals) {
    const { workSeconds, restSeconds, rounds } = step.intervals;
    const cycle = workSeconds + restSeconds;
    const t = Math.max(0, elapsed);
    const round = Math.min(rounds, Math.floor(t / cycle) + 1);
    const within = t % cycle;
    const working = within < workSeconds;
    const left = working ? workSeconds - within : cycle - within;
    const total = rounds * cycle;
    return (
      <div>
        <Ring fraction={working ? within / workSeconds : (within - workSeconds) / restSeconds} tone={working ? "volt" : "muted"}>
          <p className={cn("text-sm font-semibold uppercase tracking-[0.12em]", working ? "text-chart-1" : "text-muted-foreground")}>{working ? "Work" : "Easy"}</p>
          <p className="text-7xl font-semibold tabular-nums">{fmtClock(left)}</p>
          <p className="mt-1 text-sm text-muted-foreground tabular-nums">
            Round {round} of {rounds}
          </p>
        </Ring>
        <p className="mt-4 text-center text-sm text-muted-foreground tabular-nums">{fmtClock(total - t)} left {paused ? "· paused" : ""}</p>
      </div>
    );
  }
  const total = (step.seconds ?? 0) * (perSide ? 2 : 1);
  const t = Math.max(0, elapsed);
  const left = total - t;
  const side = perSide ? (t < (step.seconds ?? 0) ? "First side" : "Switch sides") : null;
  return (
    <Ring fraction={total ? t / total : 0}>
      {side && <p className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">{side}</p>}
      <p className="text-7xl font-semibold tabular-nums">{fmtClock(left)}</p>
      {paused && <p className="mt-1 text-sm text-muted-foreground">Paused</p>}
    </Ring>
  );
}

function RestView({
  left,
  total,
  nextName,
  nextTarget,
  onAdd,
  onSkip,
  effortFor,
  effort,
  onEffort,
}: {
  left: number;
  total: number;
  nextName?: string;
  nextTarget?: string;
  onAdd: () => void;
  onSkip: () => void;
  effortFor: string | null;
  effort?: "easy" | "good" | "tough";
  onEffort: (e: "easy" | "good" | "tough") => void;
}) {
  return (
    <div className="animate-rise flex flex-1 flex-col">
      <div className="flex flex-1 flex-col justify-center py-6">
        <Ring fraction={total ? left / total : 0} tone="muted">
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">Rest</p>
          <p className="text-7xl font-semibold tabular-nums">{fmtClock(left)}</p>
        </Ring>
        {nextName && (
          <div className="mx-auto mt-6 w-full max-w-sm rounded-3xl border bg-card p-4 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">Up next</p>
            <p className="mt-1 text-lg font-semibold">{nextName}</p>
            {nextTarget && <p className="text-sm text-muted-foreground tabular-nums">{nextTarget}</p>}
          </div>
        )}
        {effortFor && (
          <div className="mx-auto mt-4 w-full max-w-sm text-center">
            <p className="text-sm text-muted-foreground">How did {effortFor.toLowerCase()} feel? (optional)</p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {(["easy", "good", "tough"] as const).map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => onEffort(e)}
                  aria-pressed={effort === e}
                  className={cn("h-11 rounded-2xl border text-sm font-semibold capitalize transition", effort === e ? "border-foreground bg-foreground text-background" : "bg-card")}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="pb-safe grid grid-cols-2 gap-2 pb-4">
        <Button variant="outline" className="h-14 rounded-2xl text-base" onClick={onAdd}>
          +15 s
        </Button>
        <Button className="h-14 rounded-2xl text-base" onClick={onSkip}>
          Skip rest
        </Button>
      </div>
    </div>
  );
}
