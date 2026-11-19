import { z } from "zod";

/** Shared by the /api/coach route and the client. Proposals are validated on both sides. */

export const coachActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("set_variant"), variant: z.enum(["minimum", "quick", "full"]) }),
  z.object({ type: z.literal("adjust_intensity"), delta: z.union([z.literal(-1), z.literal(1)]) }),
  z.object({ type: z.literal("set_focus"), focus: z.enum(["strength", "cardio", "mobility", "recovery", "restart"]) }),
  z.object({ type: z.literal("change_format") }),
  z.object({
    type: z.literal("not_today"),
    reason: z.enum([
      "rest",
      "no_time",
      "low_energy",
      "mental_fatigue",
      "motivation",
      "boredom",
      "forgot",
      "too_hard",
      "equipment_location",
      "pain_soreness",
      "unpredictable_schedule",
    ]),
  }),
  z.object({ type: z.literal("report_pain") }),
  z.object({ type: z.literal("reset_today") }),
  z.object({
    type: z.literal("start_practice"),
    practiceId: z.enum([
      "breath_anchor",
      "breath_counting",
      "noting",
      "body_scan",
      "breathing_space",
      "urge_surfing",
      "mindful_walk",
      "box_breathing_mind",
      "extended_exhale",
      "cyclic_sigh",
      "sart",
      "flanker",
      "nback",
      "schulte",
      "focus_block",
    ]),
    minutes: z.number().int().min(1).max(90),
  }),
]);

export const coachProposalSchema = z.object({
  label: z.string().min(1).max(60),
  actions: z.array(coachActionSchema).min(1).max(3),
});

export const coachRequestSchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(2000) }))
    .min(1)
    .max(20),
  context: z.record(z.string(), z.unknown()),
  consent: z.object({ training: z.literal(true), health: z.boolean() }),
});

export const coachResponseSchema = z.object({
  text: z.string(),
  proposals: z.array(coachProposalSchema).max(3),
  model: z.string().optional(),
});

export type CoachRequest = z.infer<typeof coachRequestSchema>;
export type CoachResponse = z.infer<typeof coachResponseSchema>;
