"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowLeft, ArrowUpRight, ShieldAlert } from "lucide-react";
import { useData } from "@/components/app/data-context";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { MIND_PRACTICE_BY_ID, type MindChange, type MindPractice } from "@/engine";
import { logMindSession, updateMindProfile } from "@/lib/mind-services";
import { cn } from "@/lib/utils";
import { CATEGORY_LABEL } from "./mind-view";
import { BreathCountPlayer } from "./players/breath-count";
import type { PlayerResult } from "./players/common";
import { FlankerPlayer } from "./players/flanker";
import { FocusBlockPlayer } from "./players/focus-block";
import { GuidedPlayer } from "./players/guided";
import { NBackPlayer } from "./players/nback";
import { SartPlayer } from "./players/sart";
import { SchultePlayer } from "./players/schulte";

const RATED = new Set(["guided", "breath_count"]);

export function PracticeScreen() {
  const params = useSearchParams();
  const practice = MIND_PRACTICE_BY_ID[params.get("p") ?? ""];
  const m = Number(params.get("m"));
  if (!practice) return <NotFound />;
  const minutes = Number.isFinite(m) && m > 0 && m <= 120 ? m : practice.defaultMinutes;
  return <Practice key={`${practice.id}-${minutes}`} practice={practice} initialMinutes={minutes} />;
}

function NotFound() {
  const router = useRouter();
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-lg font-semibold">That practice doesn't exist.</p>
      <Button onClick={() => router.replace("/mind")}>Back to Mind</Button>
    </div>
  );
}

function Rating({ label, value, onChange }: { label: string; value?: number; onChange: (v: number) => void }) {
  return (
    <div>
      <p className="mb-2 text-sm font-semibold">{label}</p>
      <div className="grid grid-cols-5 gap-2" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            onClick={() => onChange(n)}
            className={cn("h-11 rounded-xl border text-sm font-semibold tabular-nums", value === n ? "border-mind bg-mind text-mind-foreground" : "bg-card")}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

function Practice({ practice, initialMinutes }: { practice: MindPractice; initialMinutes: number }) {
  const router = useRouter();
  const data = useData();
  const mind = data.mind;
  const [minutes, setMinutes] = useState(initialMinutes);
  const [stage, setStage] = useState<"intro" | "play" | "finish" | "saved">(practice.kind === "focus_block" ? "play" : "intro");
  const [before, setBefore] = useState<{ calm?: number; focus?: number }>({});
  const [after, setAfter] = useState<{ calm?: number; focus?: number }>({});
  const [result, setResult] = useState<PlayerResult | null>(null);
  const [changes, setChanges] = useState<MindChange[]>([]);
  const [startedAt, setStartedAt] = useState(() => new Date());
  const [saving, setSaving] = useState(false);
  const seed = useMemo(() => `${practice.id}|${startedAt.toISOString()}`, [practice.id, startedAt]);
  const voice = mind.profile?.voice ?? true;
  const bells = mind.profile?.bells ?? true;
  const exit = () => router.replace("/mind");

  const save = async () => {
    if (!result) return;
    setSaving(true);
    const end = new Date();
    const res = await logMindSession({
      date: `${startedAt.getFullYear()}-${String(startedAt.getMonth() + 1).padStart(2, "0")}-${String(startedAt.getDate()).padStart(2, "0")}`,
      startedAt: startedAt.toISOString(),
      endedAt: end.toISOString(),
      practiceId: practice.id,
      kind: practice.kind,
      category: practice.category,
      plannedMinutes: minutes,
      actualMinutes: result.actualMinutes,
      completed: result.completed,
      before: Object.keys(before).length ? before : undefined,
      after: Object.keys(after).length ? after : undefined,
      ...result.extra,
    });
    setChanges(res.changes);
    setSaving(false);
    setStage("saved");
  };

  if (stage === "play") {
    const common = { minutes, seed, voice, bells, onExit: exit, onDone: (r: PlayerResult) => (setResult(r), setStage("finish")) };
    return (
      <div className="mx-auto w-full max-w-lg px-4">
        {practice.kind === "guided" && <GuidedPlayer {...common} practice={practice} />}
        {practice.kind === "breath_count" && <BreathCountPlayer {...common} />}
        {practice.kind === "sart" && <SartPlayer {...common} />}
        {practice.kind === "flanker" && <FlankerPlayer {...common} />}
        {practice.kind === "nback" && <NBackPlayer {...common} startLevel={mind.state?.nbackLevel ?? 2} />}
        {practice.kind === "schulte" && <SchultePlayer {...common} size={mind.state?.schulteSize ?? 5} />}
        {practice.kind === "focus_block" && <FocusBlockPlayer {...common} />}
      </div>
    );
  }

  if (stage === "finish" || stage === "saved") {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4">
        <div className="pt-safe flex-1 pt-10">
          <div className="animate-pop flex size-16 items-center justify-center rounded-full bg-mind text-3xl text-mind-foreground">✓</div>
          <h1 className="mt-5 text-[30px] font-semibold leading-tight tracking-[-0.02em]">{result?.completed ? "Well done" : "Saved what you did"}</h1>
          <p className="mt-1 text-muted-foreground">{practice.name}</p>
          {result && result.summary.length > 0 && (
            <dl className="mt-6 grid grid-cols-2 gap-2">
              {result.summary.map((s) => (
                <div key={s.label} className="rounded-2xl border bg-card p-4">
                  <dt className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">{s.label}</dt>
                  <dd className="mt-1 text-xl font-semibold tabular-nums">{s.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {stage === "finish" && RATED.has(practice.kind) && (
            <div className="mt-6 space-y-4 rounded-3xl border bg-card p-4">
              <p className="text-sm text-muted-foreground">Optional — helps you see what works for you.</p>
              <Rating label="How calm do you feel now?" value={after.calm} onChange={(v) => setAfter((a) => ({ ...a, calm: v }))} />
              <Rating label="How focused do you feel now?" value={after.focus} onChange={(v) => setAfter((a) => ({ ...a, focus: v }))} />
            </div>
          )}
          {stage === "saved" && changes.length > 0 && (
            <section className="mt-6 rounded-3xl border bg-card p-5">
              <h2 className="text-[15px] font-semibold">Next time</h2>
              <ul className="mt-3 space-y-3">
                {changes.map((c) => (
                  <li key={c.label} className="flex gap-3">
                    <ArrowUpRight className="mt-0.5 size-5 shrink-0 text-mind" />
                    <span>
                      <span className="block font-medium">
                        {c.label}: {c.from} → {c.to}
                      </span>
                      <span className="block text-sm text-muted-foreground">{c.reason}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
        <div className="pb-safe space-y-2 pb-4 pt-4">
          {stage === "finish" ? (
            <>
              <Button className="h-14 w-full rounded-2xl bg-mind text-base text-mind-foreground hover:bg-mind/90" onClick={save} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
              <Button variant="ghost" className="h-11 w-full rounded-2xl" onClick={exit}>
                Discard
              </Button>
            </>
          ) : (
            <Button className="h-14 w-full rounded-2xl text-base" onClick={exit}>
              Done
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4">
      <div className="pt-safe flex-1 pb-6 pt-3">
        <button type="button" onClick={exit} aria-label="Back" className="flex size-11 items-center justify-center rounded-full border bg-card">
          <ArrowLeft className="size-5" />
        </button>
        <p className="mt-6 text-[13px] font-semibold uppercase tracking-[0.1em] text-mind">{CATEGORY_LABEL[practice.category]}</p>
        <h1 className="mt-1 text-[32px] font-semibold leading-tight tracking-[-0.025em]">{practice.name}</h1>
        <p className="mt-2 text-[16px] text-muted-foreground">{practice.summary}</p>

        {practice.durations.length > 1 && !["schulte"].includes(practice.kind) && (
          <div className="mt-6 flex flex-wrap gap-2" role="radiogroup" aria-label="Duration">
            {practice.durations.map((d) => (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={minutes === d}
                onClick={() => setMinutes(d)}
                className={cn("min-h-11 rounded-full border px-4 text-sm font-semibold tabular-nums", minutes === d ? "border-mind bg-mind text-mind-foreground" : "bg-card")}
              >
                {d} min
              </button>
            ))}
          </div>
        )}

        <section className="mt-6 rounded-3xl border bg-card p-4">
          <h2 className="text-sm font-semibold">How it works</h2>
          <ol className="mt-2 space-y-1.5 text-[15px]">
            {practice.howTo.map((h, i) => (
              <li key={h} className="flex gap-2.5">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-mind-soft text-xs font-semibold text-mind">{i + 1}</span>
                {h}
              </li>
            ))}
          </ol>
        </section>
        <p className="mt-4 text-[14px] leading-relaxed text-muted-foreground">{practice.why}</p>
        {practice.safety?.map((s) => (
          <p key={s} className="mt-3 flex gap-2 rounded-2xl bg-warning-soft p-3 text-sm text-warning-foreground">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" />
            {s}
          </p>
        ))}

        {RATED.has(practice.kind) && (
          <div className="mt-6 space-y-4">
            <Rating label="Before you start: how calm do you feel? (optional)" value={before.calm} onChange={(v) => setBefore((b) => ({ ...b, calm: v }))} />
            <Rating label="How focused? (optional)" value={before.focus} onChange={(v) => setBefore((b) => ({ ...b, focus: v }))} />
          </div>
        )}
        {practice.kind === "guided" && (
          <label className="mt-6 flex items-start justify-between gap-4 rounded-2xl border bg-card p-4">
            <span>
              <span className="block font-semibold">Voice guidance</span>
              <span className="block text-sm text-muted-foreground">{practice.eyesClosed ? "Recommended — you can close your eyes." : "Reads cues aloud."}</span>
            </span>
            <Switch checked={voice} onCheckedChange={(v) => updateMindProfile({ voice: v })} aria-label="Voice guidance" className="mt-1" />
          </label>
        )}
      </div>
      <div className="pb-safe sticky bottom-0 -mx-4 bg-background/90 px-4 pb-4 pt-3 backdrop-blur">
        <Button
          className="h-14 w-full rounded-2xl bg-mind text-base text-mind-foreground hover:bg-mind/90"
          onClick={() => {
            setStartedAt(new Date());
            setStage("play");
          }}
        >
          Begin{practice.kind === "schulte" ? "" : ` · ${minutes} min`}
        </Button>
      </div>
    </div>
  );
}
