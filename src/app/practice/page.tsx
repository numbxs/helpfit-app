import type { Metadata } from "next";
import { Suspense } from "react";
import { AppGate } from "@/components/app/app-gate";
import { PracticeScreen } from "@/components/mind/practice-screen";

export const metadata: Metadata = { title: "Practice" };

export default function PracticePage() {
  return (
    <AppGate>
      <Suspense fallback={null}>
        <PracticeScreen />
      </Suspense>
    </AppGate>
  );
}
