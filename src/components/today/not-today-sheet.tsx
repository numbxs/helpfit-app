"use client";

import { useState } from "react";
import { ChoiceGroup } from "@/components/kit/choice";
import { Sheet } from "@/components/kit/sheet";
import { Button } from "@/components/ui/button";
import type { Barrier, Recommendation } from "@/engine";
import { SKIP_REASONS } from "@/lib/labels";
import { skipToday } from "@/lib/services";

export function NotTodaySheet({ open, onOpenChange, rec, onFive }: { open: boolean; onOpenChange: (o: boolean) => void; rec: Recommendation; onFive: () => void }) {
  const [reason, setReason] = useState<Barrier | "rest" | null>(null);
  const offerFive = rec.variant !== "minimum" && reason !== "pain_soreness" && reason !== "rest";
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setReason(null);
      }}
      title="Not today — that's OK"
      description="What's getting in the way? It helps the plan adapt to you. No judgement."
      footer={
        <div className="grid gap-2">
          {offerFive && reason && (
            <Button
              variant="outline"
              className="h-12 rounded-2xl text-base"
              onClick={() => {
                onFive();
                onOpenChange(false);
                setReason(null);
              }}
            >
              Actually, I'll do 5 minutes
            </Button>
          )}
          <Button
            className="h-12 rounded-2xl text-base"
            disabled={!reason}
            onClick={async () => {
              if (!reason) return;
              await skipToday(reason, rec);
              onOpenChange(false);
              setReason(null);
            }}
          >
            Take today off
          </Button>
        </div>
      }
    >
      <ChoiceGroup ariaLabel="Reason" options={SKIP_REASONS} value={reason ? [reason] : []} onChange={(v) => setReason(v[0] ?? null)} layout="grid" />
    </Sheet>
  );
}
