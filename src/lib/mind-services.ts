"use client";

import { applyMindSession, initialMindState, type MindChange, type MindProfile, type MindSessionLog } from "@/engine";
import { db } from "./db";
import { uid } from "./services";

export async function saveMindProfile(input: Omit<MindProfile, "id" | "createdAt" | "updatedAt">, now = new Date()): Promise<void> {
  const d = db();
  const existing = await d.mindProfile.get("mind");
  const profile: MindProfile = { ...input, id: "mind", createdAt: existing?.createdAt ?? now.toISOString(), updatedAt: now.toISOString() };
  await d.transaction("rw", d.mindProfile, d.mindState, async () => {
    await d.mindProfile.put(profile);
    if (!(await d.mindState.get("mind-state"))) await d.mindState.put(initialMindState(profile, now));
  });
}

export async function updateMindProfile(patch: Partial<MindProfile>, now = new Date()): Promise<void> {
  const d = db();
  const cur = await d.mindProfile.get("mind");
  if (!cur) return;
  await d.mindProfile.put({ ...cur, ...patch, id: "mind", updatedAt: now.toISOString() });
}

/** Saves a finished practice and updates adaptive targets. Returns what changed for next time. */
export async function logMindSession(session: Omit<MindSessionLog, "id" | "updatedAt">, now = new Date()): Promise<{ session: MindSessionLog; changes: MindChange[] }> {
  const d = db();
  const full: MindSessionLog = { ...session, id: uid(), updatedAt: now.toISOString() };
  let changes: MindChange[] = [];
  await d.transaction("rw", d.mindSessions, d.mindState, d.mindProfile, async () => {
    await d.mindSessions.put(full);
    const profile = await d.mindProfile.get("mind");
    const state = (await d.mindState.get("mind-state")) ?? (profile ? initialMindState(profile, now) : null);
    if (state) {
      const res = applyMindSession(state, full, now);
      changes = res.changes;
      await d.mindState.put(res.state);
    }
  });
  return { session: full, changes };
}

export async function deleteMindSession(id: string): Promise<void> {
  await db().mindSessions.delete(id);
}
