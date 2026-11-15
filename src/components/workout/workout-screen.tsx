"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useData } from "@/components/app/data-context";
import { WorkoutRunner } from "./workout-runner";

export function WorkoutScreen() {
  const data = useData();
  const router = useRouter();
  // Captured once: the runner owns the session from here (and shows the summary after it's saved).
  const [initial] = useState(() => data.activeWorkout);
  useEffect(() => {
    if (!initial) router.replace("/");
  }, [initial, router]);
  if (!initial) return null;
  return <WorkoutRunner key={initial.sessionId} data={data} initial={initial} />;
}
