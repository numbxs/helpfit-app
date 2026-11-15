"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { HeartPulse, Minus, Plus, RotateCcw, Shuffle, Trophy, X } from "lucide-react";
import { useData } from "@/components/app/data-context";
import { ProgressRing } from "@/components/kit/bits";
import { ActivitySheet } from "@/components/shared/activity-sheet";
import { HowToSheet, ReplaceSheet } from "@/components/shared/exercise-sheets";
import { PainSheet } from "@/components/shared/pain-sheet";
import { buildSelectionContext, daysBetween, recommendToday, replacementsFor, type DayState, type Variant } from "@/engine";
import { useNow, useRecommendation } from "@/lib/hooks";
import { patchDayState, recordShown, resetToday, startWorkout, undoNotToday, reportRedFlag } from "@/lib/services";
import { CheckIn } from "./check-in";
import { PainNotice, ProposalCard, ReflectionCard, ResumeBanner, StateCard } from "./cards";
import { ExerciseList } from "./exercise-list";
import { WorkoutHero } from "./hero";
import { NotTodaySheet } from "./not-today-sheet";

function greeting(d: Date) {
  const h = d.getHours();
  if (h < 5) return "Late night";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export function TodayView() {
  const data = useData();
  const snap = data.snapshot!;
  const now = useNow();
  const rec = useRecommendation(data, now)!;
  const router = useRouter();
  const [howTo, setHowTo] = useState<string | null>(null);
  const [replaceFor, setReplaceFor] = useState<string | null>(null);
  const [notToday, setNotToday] = useState(false);
  const [activity, setActivity] = useState(false);
  const [pain, setPain] = useState(false);
  const [starting, setStarting] = useState(false);
  const ds = snap.dayStates.find((d) => d.date === rec.date);

  useEffect(() => {
    recordShown(rec).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rec.date, rec.kind, rec.focus]);

  const replacements = useMemo(() => (replaceFor ? replacementsFor(replaceFor, buildSelectionContext(snap)) : []), [replaceFor, snap]);

  const start = async (patch?: Partial<DayState>) => {
    setStarting(true);
    try {
      let r = rec;
      if (patch) {
        await patchDayState(patch);
        const merged: DayState = { ...(ds ?? { date: rec.date, updatedAt: "" }), ...patch };
        r = recommendToday({ ...snap, dayStates: [...snap.dayStates.filter((d) => d.date !== rec.date), merged] }, new Date());
      }
      await startWorkout(r);
      router.push("/workout");
    } finally {
      setStarting(false);
    }
  };

  const hasOverrides = Boolean(ds && (ds.variant || ds.intensity !== undefined || ds.focus || ds.shuffle || (ds.swaps && Object.keys(ds.swaps).length)));
  const top = data.reflections[0];
  const latestReflection = top && !top.dismissedAt && daysBetween(top.weekEnd, rec.date) <= 7 ? top : undefined;
  const proposal = snap.adaptation?.pendingProposal;
  const intensity = ds?.intensity ?? rec.intensity;
  const dateLabel = now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  const showCheckIn = rec.kind === "workout" || rec.kind === "rest_day";

  return (
    <div className="space-y-4 pb-4">
      <header className="flex items-end justify-between gap-4 pb-1 pt-6">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-muted-foreground">{dateLabel}</p>
          <h1 className="mt-0.5 text-[28px] font-semibold leading-tight tracking-[-0.02em]">{greeting(now)}</h1>
        </div>
        <Link href="/plan" className="flex items-center gap-2.5 rounded-2xl py-1 pl-3 pr-1 hover:bg-muted" aria-label={`${rec.week.done} of ${rec.week.target} sessions this week. Open plan.`}>
          <span className="text-right leading-tight">
            <span className="block text-[15px] font-semibold tabular-nums">
              {rec.week.done}/{rec.week.target}
            </span>
            <span className="block text-xs text-muted-foreground">this week</span>
          </span>
          <ProgressRing value={rec.week.done} max={rec.week.target} marker={rec.week.minimum} size={46} stroke={5}>
            {rec.week.done >= rec.week.target ? <Trophy className="size-4 text-chart-1" /> : null}
          </ProgressRing>
        </Link>
      </header>

      {data.activeWorkout && <ResumeBanner title={data.activeWorkout.workout.title} />}

      {rec.painNotices.map(({ report, advice }) => (
        <PainNotice key={report.id} report={report} advice={advice} />
      ))}

      {latestReflection && <ReflectionCard reflection={latestReflection} />}
      {proposal && <ProposalCard description={proposal.description} />}

      {showCheckIn && !data.activeWorkout && <CheckIn feeling={ds?.feeling} />}

      {rec.kind === "workout" && rec.workout ? (
        <>
          <WorkoutHero
            rec={rec}
            starting={starting}
            onStart={() => (data.activeWorkout ? router.push("/workout") : start())}
            onVariant={(v: Variant) => patchDayState({ variant: v })}
            onJustFive={rec.leadWithMinimum && !data.activeWorkout ? () => start({ variant: "minimum" }) : undefined}
          />
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4" role="group" aria-label="Adjust today's session">
            <ActionPill onClick={() => patchDayState({ intensity: Math.max(-2, intensity - 1) })} disabled={intensity <= -2} icon={<Minus className="size-4" />}>
              Easier
            </ActionPill>
            <ActionPill onClick={() => patchDayState({ intensity: Math.min(2, intensity + 1) })} disabled={intensity >= 2} icon={<Plus className="size-4" />}>
              Harder
            </ActionPill>
            <ActionPill onClick={() => patchDayState({ shuffle: (ds?.shuffle ?? 0) + 1, focus: undefined })} icon={<Shuffle className="size-4" />}>
              Something different
            </ActionPill>
            <ActionPill onClick={() => setNotToday(true)} icon={<X className="size-4" />}>
              Not today
            </ActionPill>
            {hasOverrides && (
              <ActionPill onClick={() => resetToday()} icon={<RotateCcw className="size-4" />}>
                Reset
              </ActionPill>
            )}
          </div>
          <ExerciseList workout={rec.workout} units={snap.profile.units} onInfo={setHowTo} onReplace={setReplaceFor} />
        </>
      ) : (
        <StateCard
          rec={rec}
          onDoAnyway={
            rec.kind === "rest_day"
              ? () => patchDayState({ focus: rec.upNext?.focus ?? rec.focus })
              : rec.kind === "not_today"
                ? async () => {
                    await undoNotToday();
                    await patchDayState({ variant: "minimum" });
                  }
                : undefined
          }
          onOptional={
            rec.kind === "done_today"
              ? () => start()
              : rec.kind === "week_complete"
                ? () => patchDayState({ focus: rec.focus })
                : rec.kind === "rest_day"
                  ? () => patchDayState({ focus: "mobility", variant: "minimum" })
                  : undefined
          }
          onUndo={rec.kind === "not_today" ? () => undoNotToday() : undefined}
        />
      )}

      <div className="grid grid-cols-2 gap-2 pt-2">
        <button type="button" onClick={() => setActivity(true)} className="flex min-h-14 items-center gap-2 rounded-2xl border bg-card px-4 text-left text-sm font-semibold transition hover:border-foreground/30">
          <span aria-hidden className="text-lg">
            ⚽
          </span>
          Log football, hike…
        </button>
        <button type="button" onClick={() => setPain(true)} className="flex min-h-14 items-center gap-2 rounded-2xl border bg-card px-4 text-left text-sm font-semibold transition hover:border-foreground/30">
          <HeartPulse className="size-5 text-muted-foreground" />
          Report discomfort
        </button>
      </div>

      <HowToSheet exerciseId={howTo} open={Boolean(howTo)} onOpenChange={(o) => !o && setHowTo(null)} />
      <ReplaceSheet
        exerciseId={replaceFor}
        options={replacements}
        open={Boolean(replaceFor)}
        onOpenChange={(o) => !o && setReplaceFor(null)}
        onPick={async (id) => {
          const from = replaceFor!;
          await patchDayState({ swaps: { ...(ds?.swaps ?? {}), [from]: id } });
          setReplaceFor(null);
        }}
      />
      <NotTodaySheet open={notToday} onOpenChange={setNotToday} rec={rec} onFive={() => patchDayState({ variant: "minimum" })} />
      <ActivitySheet open={activity} onOpenChange={setActivity} />
      <PainSheet open={pain} onOpenChange={setPain} context="checkin" onRedFlag={() => reportRedFlag()} />
    </div>
  );
}

function ActionPill({ children, icon, onClick, disabled }: { children: React.ReactNode; icon: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border bg-card px-4 text-sm font-semibold transition hover:border-foreground/30 active:scale-95 disabled:opacity-40"
    >
      {icon}
      {children}
    </button>
  );
}
