"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Brain, ChevronRight, Info, Play, Sparkles, Target, Timer, Wind } from "lucide-react";
import { useData } from "@/components/app/data-context";
import { PageHeader } from "@/components/app/page-header";
import { ProgressRing, SectionTitle, Surface } from "@/components/kit/bits";
import { ChoiceGroup, Segmented } from "@/components/kit/choice";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { dayKey, MIND_PRACTICE_BY_ID, mindStats, recommendMind, type MindCategory, type MindGoal, type MindSuggestion } from "@/engine";
import { useNow } from "@/lib/hooks";
import { saveMindProfile } from "@/lib/mind-services";
import { cn } from "@/lib/utils";

export const MIND_GOALS: { value: MindGoal; label: string; hint: string }[] = [
  { value: "attention_span", label: "Longer attention span", hint: "Stay on one thing longer" },
  { value: "focus", label: "Sharper focus", hint: "Recover focus, resist distraction" },
  { value: "calm", label: "Calmer mind", hint: "Less stress and mental noise" },
  { value: "memory", label: "Working memory", hint: "Hold more in mind at once" },
  { value: "mindfulness", label: "Mindfulness habit", hint: "Be present more often" },
  { value: "sleep", label: "Better wind-down", hint: "Switch off in the evening" },
];

export const CATEGORY_LABEL: Record<MindCategory, string> = {
  mindfulness: "Mindfulness",
  breathing: "Breathing",
  attention: "Attention",
  memory: "Memory",
  focus: "Deep focus",
};

export const practiceHref = (s: Pick<MindSuggestion, "practiceId" | "minutes">) => `/practice?p=${s.practiceId}&m=${s.minutes}`;

export function MindView() {
  const data = useData();
  const now = useNow(60_000);
  const { profile, state, sessions } = data.mind;
  const today = dayKey(now);
  const feeling = data.snapshot?.dayStates.find((d) => d.date === today)?.feeling;
  const trainedToday = Boolean(data.snapshot?.sessions.some((s) => s.date === today && (s.status === "completed" || s.status === "partial")));
  const rec = useMemo(() => recommendMind({ profile, state, sessions, now, feeling, trainedToday }), [profile, state, sessions, now, feeling, trainedToday]);
  const stats = useMemo(() => mindStats(sessions, state, now, data.snapshot?.profile.weekStartsOn ?? 1), [sessions, state, now, data.snapshot]);

  if (!profile) return <MindSetup />;

  const primary = rec.primary!;
  const p = MIND_PRACTICE_BY_ID[primary.practiceId];
  const groups: { title: string; ids: string[] }[] = [
    { title: "Mindfulness", ids: ["breath_anchor", "breath_counting", "noting", "body_scan", "breathing_space", "urge_surfing", "mindful_walk"] },
    { title: "Breathing", ids: ["box_breathing_mind", "cyclic_sigh", "extended_exhale"] },
    { title: "Attention & memory drills", ids: ["sart", "flanker", "schulte", "nback"] },
  ];

  return (
    <div className="space-y-6 pb-4">
      <PageHeader eyebrow="Focus, attention & calm" title="Mind" />

      <section aria-labelledby="mind-today" className="mind-glow animate-rise relative overflow-hidden rounded-[2rem] p-5 text-white shadow-[0_20px_50px_-25px_rgba(40,20,90,0.6)]">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-white/70">
            {rec.kind === "done" ? "Done today ✓" : "Today's practice"} · {CATEGORY_LABEL[p.category]} · <span className="tabular-nums">{primary.minutes} min</span>
          </p>
          <ProgressRing value={rec.week.days} max={rec.week.target} size={40} stroke={4} className="text-white">
            <span className="text-[11px] font-semibold tabular-nums">{rec.week.days}</span>
          </ProgressRing>
        </div>
        <h2 id="mind-today" className="mt-2 text-[28px] font-semibold leading-tight tracking-[-0.02em]">
          {p.name}
        </h2>
        <p className="mt-1.5 text-[15px] leading-snug text-white/75">{p.summary}</p>
        <p className="mt-3 flex gap-2 border-t border-white/10 pt-3 text-[14px] leading-snug">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-[oklch(0.85_0.12_285)]" />
          {rec.kind === "done" ? "You've practised today. Anything more is a bonus." : primary.reason}
        </p>
        <Link
          href={practiceHref(primary)}
          className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-white text-[17px] font-semibold text-[oklch(0.25_0.05_285)] transition active:scale-[0.98]"
        >
          <Play className="size-5 fill-current" /> {rec.kind === "done" ? "Practise again" : "Start"}
        </Link>
        <div className="no-scrollbar -mx-5 mt-3 flex gap-2 overflow-x-auto px-5">
          {rec.alternatives.map((a) => (
            <Link key={a.practiceId} href={practiceHref(a)} className="shrink-0 rounded-full bg-white/10 px-3.5 py-2 text-sm font-medium text-white hover:bg-white/15">
              {MIND_PRACTICE_BY_ID[a.practiceId].name} · {a.minutes}m
            </Link>
          ))}
        </div>
        <p className="mt-3 text-xs text-white/60">
          {rec.week.days} of {rec.week.target} practice days this week · {rec.week.minutes} min
        </p>
      </section>

      <section aria-labelledby="focus-span">
        <Surface className="p-5">
          <div className="flex items-start gap-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-mind-soft text-mind">
              <Target className="size-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Your focus span</p>
              <h2 id="focus-span" className="text-[26px] font-semibold tabular-nums tracking-tight">
                {state?.focusTargetMinutes ?? 20} min
              </h2>
              <p className="text-sm text-muted-foreground">{rec.focusBlock.reason}</p>
              <div className="mt-2 flex items-center gap-1.5" aria-label={`${state?.focusSuccessStreak ?? 0} of 2 clean blocks toward the next step`}>
                {[0, 1].map((i) => (
                  <span key={i} className={cn("h-1.5 w-8 rounded-full", i < (state?.focusSuccessStreak ?? 0) ? "bg-mind" : "bg-muted")} />
                ))}
                <span className="ml-1 text-xs text-muted-foreground">to +5 min</span>
              </div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
            <Link href={practiceHref(rec.focusBlock)} className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-mind font-semibold text-mind-foreground transition active:scale-[0.98]">
              <Timer className="size-5" /> Start a focus block
            </Link>
            <Link href={practiceHref({ practiceId: "urge_surfing", minutes: 3 })} className="flex h-12 items-center rounded-2xl border px-4 text-sm font-semibold">
              Phone urge?
            </Link>
          </div>
          {stats.focus.blocks > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              {stats.focus.completed} of {stats.focus.blocks} blocks completed · longest {stats.focus.longestMinutes} min
              {stats.focus.distractionsPerHour !== null ? ` · ${stats.focus.distractionsPerHour} distractions/hour lately` : ""}
            </p>
          )}
        </Surface>
      </section>

      {groups.map((g) => (
        <section key={g.title}>
          <SectionTitle>{g.title}</SectionTitle>
          <ul className="overflow-hidden rounded-3xl border bg-card">
            {g.ids.map((id) => {
              const pr = MIND_PRACTICE_BY_ID[id];
              const minutes = id === "breath_counting" && state ? state.breathCountMinutes : pr.defaultMinutes;
              const best = bestFor(id, stats);
              return (
                <li key={id} className="border-b last:border-b-0">
                  <Link href={practiceHref({ practiceId: id, minutes })} className="flex items-center gap-3 px-4 py-3.5 hover:bg-muted/40">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-mind-soft text-mind">
                      {pr.category === "breathing" ? <Wind className="size-5" /> : pr.category === "attention" || pr.category === "memory" ? <Brain className="size-5" /> : <Sparkles className="size-5" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-semibold">{pr.name}</span>
                      <span className="block truncate text-sm text-muted-foreground">{pr.summary}</span>
                    </span>
                    <span className="shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                      {minutes} min
                      {best && <span className="block font-semibold text-foreground">{best}</span>}
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <HonestNote />
    </div>
  );
}

function bestFor(id: string, stats: ReturnType<typeof mindStats>): string | null {
  const d = stats.drills;
  const last = (arr: { value: number }[]) => arr.at(-1)?.value;
  switch (id) {
    case "sart":
      return d.sart.length ? `${last(d.sart)}% no-go` : null;
    case "flanker":
      return d.flanker.length ? `${last(d.flanker)} ms cost` : null;
    case "nback":
      return d.nback.length ? `${last(d.nback)}-back` : null;
    case "schulte":
      return d.schulte.length ? `best ${Math.min(...d.schulte.map((x) => x.value))}s` : null;
    case "breath_counting":
      return d.breathCount.length ? `${last(d.breathCount)}%` : null;
    default:
      return null;
  }
}

function HonestNote() {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-3xl bg-muted/60 p-4 text-sm">
      <button type="button" className="flex w-full items-center gap-2 text-left font-semibold" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <Info className="size-4" /> What this can — and can't — do
      </button>
      {open && (
        <div className="mt-2 space-y-2 text-muted-foreground">
          <p>Brain-training games mostly make you better at those games; the effect on everyday focus is modest. What reliably helps real-world attention: practising focus on real work (focus blocks), regular mindfulness, physical exercise, and good sleep. That's why this section combines all four.</p>
          <p>Drill scores and focus blocks are measured, so you can see real change — not a made-up "brain age".</p>
          <p>This isn't treatment for ADHD, anxiety or depression. If concentration problems are severe, sudden or persistent, talk to a doctor.</p>
        </div>
      )}
    </section>
  );
}

function MindSetup() {
  const [goals, setGoals] = useState<MindGoal[]>(["attention_span", "focus"]);
  const [minutes, setMinutes] = useState<3 | 5 | 10 | 15>(5);
  const [baseline, setBaseline] = useState<number | null>(null);
  const [voice, setVoice] = useState(true);
  const [saving, setSaving] = useState(false);
  return (
    <div className="space-y-6 pb-4">
      <PageHeader eyebrow="Focus, attention & calm" title="Mind" />
      <section className="mind-glow rounded-[2rem] p-6 text-white">
        <Brain className="size-8 text-[oklch(0.85_0.12_285)]" />
        <h2 className="mt-4 text-[26px] font-semibold leading-tight tracking-tight">Train attention like a muscle.</h2>
        <p className="mt-2 text-[15px] text-white/75">
          Short mindfulness and breathing practices, measurable attention drills, and focus blocks that grow your attention span on real work. Three quick questions.
        </p>
      </section>
      <section>
        <h3 className="mb-2 text-[17px] font-semibold">What do you want from it?</h3>
        <ChoiceGroup ariaLabel="Mind goals" options={MIND_GOALS} value={goals} onChange={setGoals} multiple layout="list" />
      </section>
      <section>
        <h3 className="mb-1 text-[17px] font-semibold">How long can you focus on one task right now?</h3>
        <p className="mb-2 text-sm text-muted-foreground">Before switching or checking your phone. Honest answer — your focus blocks start here and grow.</p>
        <ChoiceGroup
          ariaLabel="Current focus span"
          options={[
            { value: 8, label: "Under 10 minutes" },
            { value: 15, label: "10–20 minutes" },
            { value: 30, label: "20–40 minutes" },
            { value: 45, label: "40+ minutes" },
          ]}
          value={baseline === null ? [] : [baseline]}
          onChange={(v) => setBaseline(v[0] ?? null)}
          layout="grid"
        />
      </section>
      <section>
        <h3 className="mb-2 text-[17px] font-semibold">Daily practice time</h3>
        <Segmented
          ariaLabel="Daily practice minutes"
          options={[
            { value: 3 as const, label: "3 min" },
            { value: 5 as const, label: "5 min" },
            { value: 10 as const, label: "10 min" },
            { value: 15 as const, label: "15 min" },
          ]}
          value={minutes}
          onChange={setMinutes}
        />
      </section>
      <label className="flex items-start justify-between gap-4 rounded-2xl border bg-card p-4">
        <span>
          <span className="block font-semibold">Voice guidance</span>
          <span className="block text-sm text-muted-foreground">Read cues aloud so you can close your eyes. Uses your device's built-in voice.</span>
        </span>
        <Switch checked={voice} onCheckedChange={setVoice} aria-label="Voice guidance" className="mt-1" />
      </label>
      <Button
        className="h-14 w-full rounded-2xl text-base"
        disabled={!goals.length || baseline === null || saving}
        onClick={async () => {
          setSaving(true);
          await saveMindProfile({ goals, dailyMinutes: minutes, focusBaselineMinutes: baseline ?? 15, voice, bells: true });
          setSaving(false);
        }}
      >
        Set up my mind training
      </Button>
    </div>
  );
}


