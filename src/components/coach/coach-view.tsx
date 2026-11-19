"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowUp, Check, Cpu, Sparkles, Trash2 } from "lucide-react";
import { useData } from "@/components/app/data-context";
import { PageHeader } from "@/components/app/page-header";
import { PainSheet } from "@/components/shared/pain-sheet";
import { Button } from "@/components/ui/button";
import type { CoachAction } from "@/engine";
import { askCoach, fetchCoachStatus, type CoachStatus } from "@/lib/coach-client";
import { coachActionSchema } from "@/lib/coach-schema";
import { db, type CoachMessage } from "@/lib/db";
import { useNow, useRecommendation, useStats } from "@/lib/hooks";
import { applyCoachActions, clearCoachHistory, markProposalApplied, reportRedFlag, saveCoachMessage } from "@/lib/services";
import { cn } from "@/lib/utils";

const SUGGESTIONS = [
  "I can't focus today",
  "I have 10 minutes and I'm exhausted",
  "I haven't exercised for a week",
  "I'm getting bored with this routine",
  "Why this workout today?",
  "How am I progressing?",
  "Make today easier",
];

export function CoachView() {
  const data = useData();
  const now = useNow(60_000);
  const rec = useRecommendation(data, now)!;
  const stats = useStats(data, now)!;
  const router = useRouter();
  const messages = useLiveQuery(() => db().coachMessages.orderBy("at").toArray(), []) ?? [];
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<CoachStatus | null>(null);
  const [painOpen, setPainOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const ai = data.settings.ai;
  const aiActive = Boolean(ai.enabled && ai.shareTraining && status?.available);

  useEffect(() => {
    fetchCoachStatus().then(setStatus);
  }, []);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, busy]);

  const send = async (msg: string) => {
    const m = msg.trim();
    if (!m || busy) return;
    setText("");
    setBusy(true);
    try {
      const history = messages;
      await saveCoachMessage({ role: "user", text: m });
      const reply = await askCoach(m, history, data, rec, stats);
      await saveCoachMessage({
        role: "assistant",
        text: reply.notice ? `${reply.text}\n\n— ${reply.notice}` : reply.text,
        source: reply.source,
        proposals: reply.proposals.map((p) => ({ label: p.label, actions: p.actions })),
      });
    } finally {
      setBusy(false);
    }
  };

  const apply = async (msg: CoachMessage, index: number) => {
    const p = msg.proposals?.[index];
    if (!p) return;
    const actions = p.actions.map((a) => coachActionSchema.safeParse(a)).filter((r) => r.success).map((r) => r.data as CoachAction);
    if (actions.some((a) => a.type === "report_pain")) {
      setPainOpen(true);
      return;
    }
    const practice = actions.find((a) => a.type === "start_practice");
    if (practice && practice.type === "start_practice") {
      await markProposalApplied(msg.id, index);
      router.push(`/practice?p=${practice.practiceId}&m=${practice.minutes}`);
      return;
    }
    await applyCoachActions(actions, rec);
    await markProposalApplied(msg.id, index);
    toast("Today's session updated", { action: { label: "View", onClick: () => router.push("/") } });
  };

  return (
    <div className="flex min-h-[calc(100dvh-7rem)] flex-col">
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-1.5">
            {aiActive ? <Sparkles className="size-3.5" /> : <Cpu className="size-3.5" />}
            {aiActive ? "AI coach · uses your shared training data" : "On-device coach · your data stays here"}
          </span>
        }
        title="Coach"
        action={
          messages.length > 0 ? (
            <Button variant="ghost" size="icon" className="size-11 rounded-full" aria-label="Clear conversation" onClick={() => clearCoachHistory()}>
              <Trash2 className="size-5" />
            </Button>
          ) : undefined
        }
      />

      <div className="flex-1 space-y-3 pb-4" aria-live="polite">
        <Bubble role="assistant">
          I know your plan, recent sessions and progress. Ask me to adjust today, explain a choice, or help you restart. I'll only suggest changes — you decide.
        </Bubble>
        {messages.map((m) => (
          <div key={m.id} className="space-y-2">
            <Bubble role={m.role} ai={m.source === "ai"}>
              {m.text}
            </Bubble>
            {m.role === "assistant" && m.proposals && m.proposals.length > 0 && (
              <div className="flex flex-wrap gap-2 pl-1">
                {m.proposals.map((p, i) => (
                  <button
                    key={i}
                    type="button"
                    disabled={Boolean(p.appliedAt)}
                    onClick={() => apply(m, i)}
                    className={cn(
                      "flex min-h-10 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold transition active:scale-95",
                      p.appliedAt ? "border-transparent bg-accent text-accent-foreground" : "bg-card hover:border-foreground/30",
                    )}
                  >
                    {p.appliedAt && <Check className="size-4" />}
                    {p.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        {busy && (
          <Bubble role="assistant">
            <span className="inline-flex gap-1" aria-label="Thinking">
              <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.2s]" />
              <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.1s]" />
              <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground" />
            </span>
          </Bubble>
        )}
        <div ref={endRef} />
      </div>

      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] -mx-4 space-y-2 bg-background/90 px-4 pb-3 pt-2 backdrop-blur">
        {messages.length < 2 && (
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" onClick={() => send(s)} className="min-h-10 shrink-0 rounded-full border bg-card px-4 text-sm font-medium hover:border-foreground/30">
                {s}
              </button>
            ))}
          </div>
        )}
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send(text);
          }}
        >
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 2000))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(text);
              }
            }}
            rows={1}
            placeholder="Message your coach…"
            aria-label="Message your coach"
            className="max-h-32 min-h-12 flex-1 resize-none rounded-3xl border bg-card px-4 py-3 text-[15px] outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
          />
          <Button type="submit" size="icon" className="size-12 shrink-0 rounded-full" disabled={!text.trim() || busy} aria-label="Send">
            <ArrowUp className="size-5" />
          </Button>
        </form>
        {!aiActive && (
          <p className="px-1 text-xs text-muted-foreground">
            {status?.available ? (
              <>
                Optional AI coaching is available — <Link href="/profile#ai" className="underline">enable it in Profile</Link> (requires your consent to share training data).
              </>
            ) : (
              "Answers come from the on-device coach, built on your real data. No AI service is used."
            )}
          </p>
        )}
      </div>
      <PainSheet
        open={painOpen}
        onOpenChange={setPainOpen}
        context="coach"
        onRedFlag={() => reportRedFlag()}
        onSaved={() => toast("Logged. Today's session now works around it.")}
      />
    </div>
  );
}

function Bubble({ role, ai, children }: { role: "user" | "assistant"; ai?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn("flex", role === "user" ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] whitespace-pre-wrap rounded-3xl px-4 py-3 text-[15px] leading-relaxed",
          role === "user" ? "rounded-br-lg bg-foreground text-background dark:bg-primary dark:text-primary-foreground" : "rounded-bl-lg border bg-card",
        )}
      >
        {ai && role === "assistant" && <span className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"><Sparkles className="size-3" /> AI</span>}
        {children}
      </div>
    </div>
  );
}
