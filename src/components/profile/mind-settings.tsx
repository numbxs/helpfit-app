"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Brain } from "lucide-react";
import { useData } from "@/components/app/data-context";
import { SectionTitle, Surface } from "@/components/kit/bits";
import { ChoiceGroup, Segmented } from "@/components/kit/choice";
import { Sheet } from "@/components/kit/sheet";
import { MIND_GOALS } from "@/components/mind/mind-view";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { MindGoal } from "@/engine";
import { db } from "@/lib/db";
import { updateMindProfile } from "@/lib/mind-services";

export function MindSettingsSection() {
  const { mind } = useData();
  const [editing, setEditing] = useState(false);
  const [goals, setGoals] = useState<MindGoal[]>(mind.profile?.goals ?? []);
  const p = mind.profile;
  return (
    <section id="mind">
      <SectionTitle>Mind training</SectionTitle>
      {!p ? (
        <Surface className="flex items-center gap-3">
          <Brain className="size-5 text-mind" />
          <p className="flex-1 text-sm text-muted-foreground">Not set up yet.</p>
          <Link href="/mind" className="text-sm font-semibold underline">
            Set up
          </Link>
        </Surface>
      ) : (
        <Surface className="space-y-5">
          <button type="button" onClick={() => (setGoals(p.goals), setEditing(true))} className="flex w-full items-center justify-between gap-3 text-left">
            <span>
              <span className="block font-semibold">Goals</span>
              <span className="block text-sm text-muted-foreground">{p.goals.map((g) => MIND_GOALS.find((x) => x.value === g)?.label ?? g).join(", ")}</span>
            </span>
            <span className="text-sm font-semibold text-mind">Edit</span>
          </button>
          <div>
            <p className="mb-2 text-sm font-semibold">Daily practice time</p>
            <Segmented
              ariaLabel="Daily practice minutes"
              options={[
                { value: 3 as const, label: "3 min" },
                { value: 5 as const, label: "5 min" },
                { value: 10 as const, label: "10 min" },
                { value: 15 as const, label: "15 min" },
              ]}
              value={p.dailyMinutes}
              onChange={(v) => updateMindProfile({ dailyMinutes: v })}
            />
          </div>
          <Toggle label="Voice guidance" hint="Reads meditation cues aloud with your device's voice." checked={p.voice} onChange={(v) => updateMindProfile({ voice: v })} />
          <Toggle label="Bells" hint="A soft chime at the start, transitions and end." checked={p.bells} onChange={(v) => updateMindProfile({ bells: v })} />
          {mind.state && (
            <div className="flex items-center justify-between gap-3 rounded-2xl bg-muted/60 p-3 text-sm">
              <span>
                Focus span <span className="font-semibold">{mind.state.focusTargetMinutes} min</span> · n-back level <span className="font-semibold">{mind.state.nbackLevel}</span>
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 rounded-full"
                onClick={async () => {
                  const st = await db().mindState.get("mind-state");
                  if (!st) return;
                  await db().mindState.put({ ...st, focusTargetMinutes: Math.max(5, st.focusTargetMinutes - 5), focusSuccessStreak: 0, focusStruggleStreak: 0, updatedAt: new Date().toISOString() });
                  toast("Focus span reduced by 5 minutes");
                }}
              >
                −5 min
              </Button>
            </div>
          )}
        </Surface>
      )}
      <Sheet
        open={editing}
        onOpenChange={setEditing}
        title="Mind goals"
        footer={
          <Button
            className="h-12 w-full rounded-2xl"
            disabled={!goals.length}
            onClick={async () => {
              await updateMindProfile({ goals });
              setEditing(false);
              toast("Saved");
            }}
          >
            Save
          </Button>
        }
      >
        <ChoiceGroup ariaLabel="Mind goals" options={MIND_GOALS} value={goals} onChange={setGoals} multiple layout="list" />
      </Sheet>
    </section>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start justify-between gap-4">
      <span>
        <span className="block font-semibold">{label}</span>
        <span className="block text-sm text-muted-foreground">{hint}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} className="mt-1" />
    </label>
  );
}
