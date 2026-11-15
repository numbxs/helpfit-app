"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ChoiceGroup, Segmented } from "@/components/kit/choice";
import { Stepper } from "@/components/kit/bits";
import { Sheet } from "@/components/kit/sheet";
import { Button } from "@/components/ui/button";
import { addDays, dayKey, type ExternalActivity } from "@/engine";
import { ACTIVITIES } from "@/lib/labels";
import { logActivity } from "@/lib/services";

export function ActivitySheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [activity, setActivity] = useState<ExternalActivity>("football");
  const [minutes, setMinutes] = useState(60);
  const [effort, setEffort] = useState<"light" | "moderate" | "hard">("moderate");
  const [enjoyment, setEnjoyment] = useState<"no" | "ok" | "yes">("yes");
  const [when, setWhen] = useState<"today" | "yesterday">("today");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const today = dayKey(new Date());
      await logActivity({ activity, minutes, effort, enjoyment, date: when === "today" ? today : addDays(today, -1) });
      toast("Activity logged", { description: "It counts toward your week." });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Log an activity"
      description="Football, a hike, a run — it all counts, and fills a cardio slot in your plan."
      footer={
        <Button className="h-12 w-full rounded-2xl text-base" onClick={save} disabled={saving}>
          Save activity
        </Button>
      }
    >
      <div className="space-y-6 pb-2">
        <ChoiceGroup ariaLabel="Activity" options={ACTIVITIES} value={[activity]} onChange={(v) => setActivity(v[0] ?? "other")} />
        <div className="rounded-2xl border p-4">
          <Stepper value={minutes} onChange={setMinutes} min={5} max={300} step={5} label="minutes" />
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold">Effort</p>
          <Segmented
            ariaLabel="Effort"
            options={[
              { value: "light", label: "Easy" },
              { value: "moderate", label: "Moderate" },
              { value: "hard", label: "Hard" },
            ]}
            value={effort}
            onChange={setEffort}
          />
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold">Did you enjoy it?</p>
          <Segmented
            ariaLabel="Enjoyment"
            options={[
              { value: "no", label: "Not really" },
              { value: "ok", label: "It was OK" },
              { value: "yes", label: "Loved it" },
            ]}
            value={enjoyment}
            onChange={setEnjoyment}
          />
        </div>
        <Segmented
          ariaLabel="When"
          options={[
            { value: "today", label: "Today" },
            { value: "yesterday", label: "Yesterday" },
          ]}
          value={when}
          onChange={setWhen}
        />
      </div>
    </Sheet>
  );
}
