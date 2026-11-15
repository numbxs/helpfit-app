import type { Metadata } from "next";
import { AppGate } from "@/components/app/app-gate";
import { WorkoutScreen } from "@/components/workout/workout-screen";

export const metadata: Metadata = { title: "Workout" };

export default function WorkoutPage() {
  return (
    <AppGate>
      <WorkoutScreen />
    </AppGate>
  );
}
