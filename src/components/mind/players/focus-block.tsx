"use client";

import { useRef, useState } from "react";
import { Check, Pause, Play } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { chime, vibrate } from "../audio";
import { BigButton, fmtClock, TopBar, useInterval, type PlayerProps } from "./common";

const CHECKS = ["Phone out of reach (or face down, silent)", "Notifications off", "Only the tabs/apps this task needs"];

async function notifyEnd(task: string) {
  try {
    if (document.visibilityState === "visible" || !("Notification" in window) || Notification.permission !== "granted") return;
    const reg = await navigator.serviceWorker?.getRegistration();
    const body = `Focus block done: ${task}. Take a short break.`;
    if (reg) await reg.showNotification("Focus block complete", { body, icon: "/icons/icon-192.png", tag: "focus-block" });
    else new Notification("Focus block complete", { body });
  } catch {
    // optional
  }
}

/** A single-task deep-work timer. Each noticed distraction is logged — then you return. */
export function FocusBlockPlayer({ minutes: initialMinutes, bells, onDone, onExit }: PlayerProps) {
  const [stage, setStage] = useState<"setup" | "run" | "rate">("setup");
  const [task, setTask] = useState("");
  const [minutes, setMinutes] = useState(initialMinutes);
  const [checks, setChecks] = useState<boolean[]>(CHECKS.map(() => false));
  const [startedAt, setStartedAt] = useState(0);
  const [now, setNow] = useState(0);
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  const [pausedMs, setPausedMs] = useState(0);
  const [distractions, setDistractions] = useState(0);
  const [note, setNote] = useState<{ text: string; at: number } | null>(null);
  const [completed, setCompleted] = useState(false);
  const [focusedMin, setFocusedMin] = useState(0);
  const ended = useRef(false);

  const total = minutes * 60;
  const elapsed = stage === "run" ? ((pausedAt ?? now) - startedAt - pausedMs) / 1000 : 0;

  const end = (didComplete: boolean) => {
    if (ended.current) return;
    ended.current = true;
    const e = ((pausedAt ?? Date.now()) - startedAt - pausedMs) / 1000;
    setCompleted(didComplete);
    setFocusedMin(Math.round((Math.min(e, total) / 60) * 10) / 10);
    if (bells) chime("full");
    vibrate([80, 60, 80]);
    if (didComplete) notifyEnd(task);
    setStage("rate");
  };

  useInterval(
    () => {
      const t = Date.now();
      setNow(t);
      if ((t - startedAt - pausedMs) / 1000 >= total) end(true);
      if (note && t - note.at > 4000) setNote(null);
    },
    250,
    stage === "run" && pausedAt === null,
  );

  if (stage === "setup") {
    return (
      <div className="flex min-h-dvh flex-col">
        <TopBar title="Focus block" onExit={onExit} />
        <div className="flex-1 space-y-6 pt-2">
          <div>
            <h1 className="text-[26px] font-semibold tracking-tight">What will you focus on?</h1>
            <p className="mt-1 text-muted-foreground">One task. Be specific — "Draft the Q3 roadmap section", not "work".</p>
            <Input value={task} onChange={(e) => setTask(e.target.value.slice(0, 120))} placeholder="One specific task" aria-label="Task" className="mt-3 h-12 rounded-xl text-base" autoFocus />
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold">Duration</p>
            <div className="flex flex-wrap gap-2">
              {[...new Set([initialMinutes, 10, 15, 20, 25, 30, 45, 60, 90])].sort((a, b) => a - b).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMinutes(m)}
                  aria-pressed={minutes === m}
                  className={cn("min-h-11 rounded-full border px-4 text-sm font-semibold tabular-nums", minutes === m ? "border-mind bg-mind text-mind-foreground" : "bg-card")}
                >
                  {m} min{m === initialMinutes ? " · your span" : ""}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold">Set up for focus</p>
            <ul className="space-y-2">
              {CHECKS.map((c, i) => (
                <li key={c}>
                  <button
                    type="button"
                    onClick={() => setChecks((x) => x.map((v, j) => (j === i ? !v : v)))}
                    aria-pressed={checks[i]}
                    className="flex w-full items-center gap-3 rounded-2xl border bg-card p-3.5 text-left text-[15px]"
                  >
                    <span className={cn("flex size-6 items-center justify-center rounded-full border", checks[i] && "border-transparent bg-mind text-mind-foreground")}>{checks[i] && <Check className="size-4" />}</span>
                    {c}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="pb-safe pb-4 pt-4">
          <BigButton
            className="w-full"
            disabled={!task.trim()}
            onClick={() => {
              const t = Date.now();
              setStartedAt(t);
              setNow(t);
              setStage("run");
              if (bells) chime("soft");
            }}
          >
            Start {minutes}-minute block
          </BigButton>
        </div>
      </div>
    );
  }

  if (stage === "rate") {
    return (
      <div className="flex min-h-dvh flex-col justify-center gap-6 text-center">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">{completed ? "Block complete" : "Block ended"}</p>
          <h1 className="mt-1 text-[28px] font-semibold tracking-tight">How focused were you?</h1>
          <p className="mt-1 text-muted-foreground">
            {focusedMin} min on “{task}” · {distractions} distraction{distractions === 1 ? "" : "s"} noticed
          </p>
        </div>
        <div className="grid grid-cols-5 gap-2">
          {[1, 2, 3, 4, 5].map((r) => (
            <button
              key={r}
              type="button"
              onClick={() =>
                onDone({
                  completed,
                  actualMinutes: focusedMin,
                  extra: { focus: { task, targetMinutes: minutes, focusedMinutes: focusedMin, distractions, completed, rating: r } },
                  summary: [
                    { label: "Focused", value: `${focusedMin} min` },
                    { label: "Distractions", value: String(distractions) },
                    { label: "Self-rating", value: `${r}/5` },
                  ],
                })
              }
              className="flex aspect-square flex-col items-center justify-center rounded-2xl border bg-card text-2xl font-semibold"
              aria-label={`Focus rating ${r} of 5`}
            >
              {r}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">1 = constantly pulled away · 5 = fully absorbed</p>
      </div>
    );
  }

  const left = total - elapsed;
  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar title={task} onExit={() => end(false)} progress={elapsed / total} right={`${distractions}×`} />
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">{pausedAt ? "Paused" : "Focusing on"}</p>
        <p className="max-w-sm text-xl font-semibold">{task}</p>
        <p className="text-[5.5rem] font-semibold leading-none tabular-nums tracking-tight">{fmtClock(left)}</p>
        <p className="min-h-6 text-[15px] text-mind" aria-live="polite">
          {note?.text ?? "You can leave this screen — the timer keeps running."}
        </p>
      </div>
      <div className="pb-safe space-y-2 pb-4">
        <BigButton
          className="min-h-20 w-full"
          onClick={() => {
            setDistractions((d) => d + 1);
            setNote({ text: `Noticed. That's the skill. Back to: ${task}`, at: Date.now() });
            vibrate(20);
          }}
        >
          I got distracted
        </BigButton>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              if (pausedAt === null) setPausedAt(Date.now());
              else {
                setPausedMs((m) => m + (Date.now() - pausedAt));
                setPausedAt(null);
              }
            }}
            className="flex h-12 items-center justify-center gap-2 rounded-2xl border bg-card text-sm font-semibold"
          >
            {pausedAt ? <Play className="size-4" /> : <Pause className="size-4" />} {pausedAt ? "Resume" : "Interrupted — pause"}
          </button>
          <button type="button" onClick={() => end(false)} className="h-12 rounded-2xl border bg-card text-sm font-semibold">
            End early
          </button>
        </div>
      </div>
    </div>
  );
}
