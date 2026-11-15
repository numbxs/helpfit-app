"use client";

import { buildCoachContext, localCoachReply, type CoachReply, type Recommendation, type StatsSummary } from "@/engine";
import type { AppData, CoachMessage } from "./db";
import { coachResponseSchema } from "./coach-schema";

export interface CoachStatus {
  available: boolean;
  requiresToken: boolean;
}

export async function fetchCoachStatus(): Promise<CoachStatus> {
  try {
    const res = await fetch("/api/coach", { method: "GET", cache: "no-store" });
    if (!res.ok) return { available: false, requiresToken: false };
    const j = (await res.json()) as Partial<CoachStatus>;
    return { available: Boolean(j.available), requiresToken: Boolean(j.requiresToken) };
  } catch {
    return { available: false, requiresToken: false };
  }
}

export interface AskResult extends CoachReply {
  notice?: string;
}

/**
 * Answers a coach message. Uses the AI endpoint only when the user enabled it AND
 * consented to sharing training data; health data is included only with separate consent.
 * Always falls back to the on-device coach.
 */
export async function askCoach(message: string, history: CoachMessage[], data: AppData, rec: Recommendation, stats: StatsSummary): Promise<AskResult> {
  const snap = data.snapshot!;
  const { ai } = data.settings;
  const ctx = buildCoachContext(snap, rec, stats, new Date(), { includeHealth: ai.shareHealth });
  const local = localCoachReply(message, ctx);
  if (!ai.enabled || !ai.shareTraining) return local;

  // Safety-critical messages are always answered by deterministic rules first.
  if (/chest (pain|tight|pressure)|faint|dizz|can'?t breathe/i.test(message)) return local;

  try {
    const messages = [...history.slice(-10).map((m) => ({ role: m.role, content: m.text.slice(0, 2000) })), { role: "user" as const, content: message.slice(0, 2000) }];
    // The API requires the conversation to start with a user turn.
    while (messages.length && messages[0].role !== "user") messages.shift();
    const res = await fetch("/api/coach", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(ai.accessToken ? { Authorization: `Bearer ${ai.accessToken}` } : {}) },
      body: JSON.stringify({ messages, context: ctx, consent: { training: true, health: ai.shareHealth } }),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      return { ...local, notice: err.error ?? `AI coach unavailable (${res.status}). Answered on-device.` };
    }
    const parsed = coachResponseSchema.safeParse(await res.json());
    if (!parsed.success) return { ...local, notice: "AI coach returned an unexpected response. Answered on-device." };
    return { text: parsed.data.text, proposals: parsed.data.proposals, source: "ai" };
  } catch {
    return { ...local, notice: "You're offline or the AI coach is unreachable. Answered on-device." };
  }
}
