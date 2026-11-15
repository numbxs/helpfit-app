"use client";

import { AlertTriangle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ChoiceGroup } from "@/components/kit/choice";
import { Sheet } from "@/components/kit/sheet";
import { Button } from "@/components/ui/button";
import { painAdvice, RED_FLAG_MESSAGE, type BodyArea, type PainQuality, type PainReport } from "@/engine";
import { db } from "@/lib/db";
import { BODY_AREAS } from "@/lib/labels";
import { reportPain, type PainInput } from "@/lib/services";
import { cn } from "@/lib/utils";

const QUALITIES: { value: PainQuality; label: string }[] = [
  { value: "soreness", label: "Muscle soreness" },
  { value: "ache", label: "Dull ache" },
  { value: "sharp", label: "Sharp / pinching" },
  { value: "unsure", label: "Not sure" },
];

export function PainSheet({
  open,
  onOpenChange,
  context,
  exerciseId,
  sessionId,
  onSaved,
  onRedFlag,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  context: PainInput["context"];
  exerciseId?: string;
  sessionId?: string;
  onSaved?: (r: PainReport) => void;
  onRedFlag?: () => void;
}) {
  const [area, setArea] = useState<BodyArea | "other" | null>(null);
  const [severity, setSeverity] = useState(3);
  const [quality, setQuality] = useState<PainQuality>("ache");
  const [redFlag, setRedFlag] = useState(false);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setArea(null);
    setSeverity(3);
    setQuality("ache");
    setRedFlag(false);
  };

  const save = async () => {
    if (!area) return;
    setSaving(true);
    try {
      const r = await reportPain({ area, severity, quality, context, exerciseId, sessionId });
      const all = await db().pain.toArray();
      const advice = painAdvice(r, all, r.date);
      toast(advice.level === "see_professional" ? "Please get this checked" : "Noted — working around it", { description: advice.message, duration: 8000 });
      onSaved?.(r);
      onOpenChange(false);
      reset();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
      title="Report discomfort"
      description="We'll leave out anything that loads this area. Never push through pain."
      footer={
        redFlag ? (
          <Button
            className="h-12 w-full rounded-2xl text-base"
            variant="destructive"
            onClick={() => {
              onRedFlag?.();
              onOpenChange(false);
              reset();
            }}
          >
            Stop and end the session
          </Button>
        ) : (
          <Button className="h-12 w-full rounded-2xl text-base" disabled={!area || saving} onClick={save}>
            Save
          </Button>
        )
      }
    >
      <div className="space-y-6 pb-2">
        <button
          type="button"
          onClick={() => setRedFlag((v) => !v)}
          className={cn(
            "flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition",
            redFlag ? "border-destructive bg-destructive/10" : "border-border",
          )}
          aria-pressed={redFlag}
        >
          <AlertTriangle className={cn("mt-0.5 size-5 shrink-0", redFlag ? "text-destructive" : "text-muted-foreground")} />
          <span className="text-sm">
            <span className="font-semibold">Chest pain, unusual breathlessness, dizziness or fainting?</span>
            {redFlag ? <span className="mt-1 block text-destructive">{RED_FLAG_MESSAGE}</span> : <span className="mt-0.5 block text-muted-foreground">Tap if you have any of these.</span>}
          </span>
        </button>

        {!redFlag && (
          <>
            <div>
              <p className="mb-2 text-sm font-semibold">Where?</p>
              <ChoiceGroup
                ariaLabel="Body area"
                options={[...BODY_AREAS, { value: "other" as const, label: "Somewhere else" }]}
                value={area ? [area] : []}
                onChange={(v) => setArea(v[0] ?? null)}
              />
            </div>
            <div>
              <div className="mb-2 flex items-baseline justify-between">
                <p className="text-sm font-semibold">How bad?</p>
                <p className="text-sm tabular-nums text-muted-foreground">
                  <span className="text-lg font-semibold text-foreground">{severity}</span>/10
                </p>
              </div>
              <input
                type="range"
                min={1}
                max={10}
                value={severity}
                onChange={(e) => setSeverity(Number(e.target.value))}
                aria-label="Pain severity from 1 to 10"
                className="h-10 w-full accent-[var(--chart-1)]"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Mild</span>
                <span>Severe</span>
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold">What does it feel like?</p>
              <ChoiceGroup ariaLabel="Pain type" options={QUALITIES} value={[quality]} onChange={(v) => setQuality(v[0] ?? "ache")} />
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}
