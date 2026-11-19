import type { MindPractice } from "./types";

const WANDER = [
  "If your mind has wandered, that's completely normal. Notice where it went, and gently come back to the breath.",
  "Each time you notice you've drifted and come back — that's the repetition that trains attention.",
  "Thinking again? No problem. Label it 'thinking', and return to the next breath.",
];

const DISTRESS =
  "If this brings up strong or distressing feelings, open your eyes, look around the room, and stop — that's fine. If difficult feelings keep coming up, talk to a mental-health professional.";

export const MIND_PRACTICES: MindPractice[] = [
  // ---------------------------------------------------------------------------
  // Mindfulness
  // ---------------------------------------------------------------------------
  {
    id: "breath_anchor",
    name: "Breath anchor",
    kind: "guided",
    category: "mindfulness",
    summary: "Rest attention on the breath. Notice drifting, come back.",
    why: "Focused-attention meditation is a direct workout for attention: every time you notice your mind has wandered and bring it back, you practise the exact skill you need at your desk. Regular short practice is linked to better sustained attention and less mind-wandering.",
    howTo: [
      "Sit comfortably, back upright but not stiff.",
      "Close your eyes or lower your gaze.",
      "Feel the breath where it's clearest — nostrils, chest or belly.",
      "When you notice you've drifted, note it kindly and return.",
    ],
    safety: [DISTRESS],
    durations: [3, 5, 10, 15, 20],
    defaultMinutes: 5,
    bestFor: ["morning", "midday", "any"],
    goals: ["focus", "attention_span", "mindfulness", "calm"],
    eyesClosed: true,
    script: {
      intro: [
        "Settle into a comfortable, upright position. Let your hands rest.",
        "Close your eyes, or let your gaze rest softly on the floor.",
        "Take one slow, deeper breath… and let it go.",
      ],
      sections: [
        {
          weight: 1,
          cues: [
            "Now let the breath breathe itself. No need to control it.",
            "Find where you feel the breath most clearly — the nostrils, the chest, or the belly.",
            "Rest your attention there, on the sensations of breathing in… and breathing out.",
          ],
        },
        { weight: 3, cues: ["Just this breath. Then just the next one."], reminders: WANDER, reminderEvery: 75 },
        { weight: 1, cues: ["Notice the start of each in-breath… and the end of each out-breath."], reminders: WANDER, reminderEvery: 90 },
      ],
      outro: ["Let go of the focus on the breath. Notice your whole body sitting here.", "When you're ready, open your eyes. Take this steadiness into whatever's next."],
    },
  },
  {
    id: "breath_counting",
    name: "Breath counting",
    kind: "breath_count",
    category: "attention",
    summary: "Count exhales 1 to 9, tap a different button on 10. Lost count? Start again.",
    why: "Breath counting is both a mindfulness practice and an objective measure of it: the app can tell how often you lose count, so you can actually see your attention improve over weeks.",
    howTo: [
      "Breathe naturally. Don't speed up.",
      "Tap COUNT on each out-breath, for breaths 1 to 9.",
      "On the 10th out-breath, tap TEN — then start again at 1.",
      "If you lose track, tap 'Lost count' and restart at 1. That's part of the practice.",
    ],
    durations: [3, 5, 8, 10, 15],
    defaultMinutes: 5,
    bestFor: ["morning", "midday", "any"],
    goals: ["attention_span", "focus", "mindfulness"],
  },
  {
    id: "noting",
    name: "Noting practice",
    kind: "guided",
    category: "mindfulness",
    summary: "Notice what grabs attention — thinking, hearing, feeling — and label it lightly.",
    why: "Open-monitoring practice builds meta-awareness: catching distraction sooner. That's the difference between losing 30 seconds and losing 30 minutes to a stray thought.",
    howTo: ["Start with a few breaths.", "Whatever pulls attention, give it a one-word label: 'thinking', 'hearing', 'feeling', 'planning'.", "Then let it go and return to the breath."],
    safety: [DISTRESS],
    durations: [5, 10, 15],
    defaultMinutes: 5,
    bestFor: ["midday", "any"],
    goals: ["focus", "mindfulness", "calm"],
    eyesClosed: true,
    script: {
      intro: ["Sit comfortably and close your eyes.", "Begin with three slower breaths, letting your shoulders drop."],
      sections: [
        {
          weight: 1,
          cues: [
            "Rest attention on the breath for now.",
            "In a moment, you'll start noticing whatever pulls your attention away — and give it a quiet label.",
          ],
        },
        {
          weight: 4,
          cues: [
            "When something takes your attention, label it softly: thinking… hearing… feeling… planning.",
            "No need to analyse it. Label, let go, return to the breath.",
          ],
          reminders: [
            "What's here right now? Label it, and come back.",
            "Notice how labels make thoughts lighter. Thinking… just thinking.",
            "If you've been lost in thought, that's fine. Label it 'wandering', and return.",
          ],
          reminderEvery: 60,
        },
      ],
      outro: ["Let the labels go. Rest for a few breaths in simple awareness.", "Gently open your eyes."],
    },
  },
  {
    id: "body_scan",
    name: "Body scan",
    kind: "guided",
    category: "mindfulness",
    summary: "Move attention slowly through the body, noticing without changing anything.",
    why: "A body scan trains sustained, deliberate attention and helps the nervous system downshift — useful after mentally demanding days and before sleep.",
    howTo: ["Lie down or sit back.", "Follow the cues from feet to head.", "Notice sensations without trying to change them."],
    safety: [DISTRESS, "If attending to a painful area is uncomfortable, simply move on to the next area."],
    durations: [5, 10, 15, 20],
    defaultMinutes: 10,
    bestFor: ["evening"],
    goals: ["calm", "sleep", "mindfulness"],
    eyesClosed: true,
    script: {
      intro: ["Lie down or sit back comfortably. Let the floor or chair take your weight.", "Close your eyes. Take a slow breath in… and a long breath out."],
      sections: [
        { weight: 1, cues: ["Bring attention to your feet. Toes, soles, heels. Just notice what's there — warmth, pressure, tingling, or nothing at all."] },
        { weight: 1, cues: ["Move up to your lower legs and knees.", "If your mind drifts, simply come back to where you were."] },
        { weight: 1, cues: ["Now the thighs and hips. Notice their weight, resting."] },
        { weight: 1, cues: ["The lower back and belly. Feel the belly rise and fall with the breath."] },
        { weight: 1, cues: ["The chest and upper back. Notice the breath moving here too."] },
        { weight: 1, cues: ["Your hands and arms, up to the shoulders. Let the shoulders soften."] },
        { weight: 1, cues: ["The neck, jaw and face. Let the jaw unclench. Soften around the eyes."] },
        { weight: 1, cues: ["Now sense the whole body at once, breathing.", "Rest here."] },
      ],
      outro: ["Begin to deepen the breath a little. Wiggle your fingers and toes.", "When you're ready, open your eyes."],
    },
  },
  {
    id: "breathing_space",
    name: "3-step breathing space",
    kind: "guided",
    category: "mindfulness",
    summary: "A 3-minute reset: notice what's here, gather on the breath, widen out.",
    why: "A short, structured reset you can use between meetings or when you feel scattered. It interrupts autopilot and gives you a clean restart.",
    howTo: ["Step 1: notice thoughts, feelings and body sensations.", "Step 2: gather attention on the breath.", "Step 3: widen attention to the whole body."],
    durations: [3, 5],
    defaultMinutes: 3,
    bestFor: ["midday", "any"],
    goals: ["focus", "calm", "mindfulness"],
    eyesClosed: true,
    script: {
      intro: ["Sit upright and close your eyes, or lower your gaze."],
      sections: [
        { weight: 1, cues: ["Step one. What's here right now? Notice thoughts… feelings… sensations in the body. Just acknowledge them."] },
        { weight: 1, cues: ["Step two. Gather your attention on the breath, low in the belly. Follow each breath all the way in, and all the way out."] },
        { weight: 1, cues: ["Step three. Widen attention to the whole body breathing — posture, face, hands. Hold everything in a wider, calmer awareness."] },
      ],
      outro: ["Open your eyes. Pick one next thing, and do just that."],
    },
  },
  {
    id: "urge_surfing",
    name: "Urge surfing",
    kind: "guided",
    category: "mindfulness",
    summary: "For the pull to check your phone or switch tasks: ride the urge without acting.",
    why: "Distraction usually starts as an urge. Watching an urge rise, peak and fade — without acting on it — weakens the habit loop that fragments focus.",
    howTo: ["Notice the urge (to check, switch, scroll).", "Locate it in the body.", "Breathe with it until it fades."],
    durations: [2, 3, 5],
    defaultMinutes: 3,
    bestFor: ["any"],
    goals: ["focus", "attention_span"],
    script: {
      intro: ["Put the phone face down, or keep this screen open and look away from it."],
      sections: [
        { weight: 1, cues: ["Notice the urge — to check something, switch tasks, or scroll. Name it: 'urge'."] },
        { weight: 1, cues: ["Where do you feel it in the body? Restlessness in the hands? Tension in the chest? Just observe."] },
        { weight: 2, cues: ["Breathe with it. Urges rise like a wave, peak, and pass. You don't have to act — just watch it move."], reminders: ["Still there? Let it be there. Breathe."], reminderEvery: 45 },
      ],
      outro: ["Notice what the urge is like now. Then return to the one thing you meant to do."],
    },
  },
  {
    id: "mindful_walk",
    name: "Mindful walk",
    kind: "guided",
    category: "mindfulness",
    summary: "Walk slowly and attend to steps, sounds and surroundings. Pocket the phone.",
    why: "Moving meditation combines light activity with attention training — a good option when sitting still feels impossible, and a great way to clear your head between deep-work blocks.",
    howTo: ["Start walking at a relaxed pace.", "Follow the voice cues — no need to look at the screen.", "Feel each step; notice sounds and sights without commentary."],
    safety: ["Stay aware of traffic and obstacles — keep your eyes open."],
    durations: [5, 10, 15],
    defaultMinutes: 10,
    bestFor: ["midday", "any"],
    goals: ["calm", "mindfulness", "focus"],
    script: {
      intro: ["Start walking at a relaxed pace. Keep your eyes open and aware of your surroundings."],
      sections: [
        { weight: 1, cues: ["Feel your feet: the heel landing, the roll through the foot, the push away."] },
        { weight: 1, cues: ["Notice the movement of your legs and the swing of your arms."] },
        { weight: 1, cues: ["Open your attention to sounds — near and far. Just hearing, no labels needed."] },
        { weight: 1, cues: ["Notice what you can see: colours, light, movement."], reminders: ["If you're lost in thought, come back to the feeling of the next step."], reminderEvery: 70 },
      ],
      outro: ["Take a few steps with full attention. Then let your pace return to normal."],
    },
  },

  // ---------------------------------------------------------------------------
  // Breathing
  // ---------------------------------------------------------------------------
  {
    id: "box_breathing_mind",
    name: "Box breathing",
    kind: "guided",
    category: "breathing",
    summary: "In 4, hold 4, out 4, hold 4. Steady and focusing.",
    why: "A slow, structured breathing pattern gives your mind a simple, rhythmic task and slows your breathing rate — a reliable way to settle before focused work.",
    howTo: ["Follow the circle: breathe in as it grows, hold, breathe out as it shrinks, hold.", "Breathe through the nose if comfortable."],
    safety: ["If holding feels uncomfortable, shorten the holds or skip them."],
    durations: [2, 3, 5],
    defaultMinutes: 3,
    bestFor: ["morning", "midday", "any"],
    goals: ["focus", "calm"],
    pacer: { inhale: 4, hold: 4, exhale: 4, hold2: 4 },
    script: { intro: ["Sit upright. Follow the circle and the count."], sections: [{ weight: 1, cues: [] }], outro: ["Let your breathing return to normal."] },
  },
  {
    id: "extended_exhale",
    name: "Long exhale",
    kind: "guided",
    category: "breathing",
    summary: "In for 4, out for 6–8. Downshifts stress and racing thoughts.",
    why: "Making the out-breath longer than the in-breath is one of the simplest ways to calm the body's stress response. Use it when you're wired, anxious, or winding down for sleep.",
    howTo: ["Breathe in gently for 4.", "Breathe out slowly for 6, through the nose or pursed lips."],
    durations: [2, 3, 5, 10],
    defaultMinutes: 3,
    bestFor: ["evening", "any"],
    goals: ["calm", "sleep"],
    pacer: { inhale: 4, exhale: 6 },
    script: { intro: ["Get comfortable. Follow the circle — the out-breath is longer."], sections: [{ weight: 1, cues: [] }], outro: ["Let the breath find its own rhythm again."] },
  },
  {
    id: "cyclic_sigh",
    name: "Cyclic sighing",
    kind: "guided",
    category: "breathing",
    summary: "Two inhales through the nose, one long exhale through the mouth. A fast reset.",
    why: "In a controlled study, a few minutes a day of cyclic sighing improved mood and lowered breathing rate more than mindfulness meditation alone. Great for a quick reset between meetings.",
    howTo: ["Inhale through the nose.", "Take a second, short sip of air on top.", "Exhale slowly and fully through the mouth."],
    safety: ["Breathe gently — if you feel light-headed, return to normal breathing."],
    durations: [1, 2, 3, 5],
    defaultMinutes: 2,
    bestFor: ["midday", "any"],
    goals: ["calm", "focus"],
    pacer: { inhale: 3, topUp: 1, exhale: 6 },
    script: { intro: ["Sit or stand comfortably. Follow the circle."], sections: [{ weight: 1, cues: [] }], outro: ["Return to normal breathing. Notice how you feel."] },
  },

  // ---------------------------------------------------------------------------
  // Attention & memory drills
  // ---------------------------------------------------------------------------
  {
    id: "sart",
    name: "Steady tap",
    kind: "sart",
    category: "attention",
    summary: "Tap for every digit — except 3. Trains sustained attention and impulse control.",
    why: "Based on a classic sustained-attention test. It's built to catch autopilot: the rhythm makes you want to tap the 3 too. Your no-go accuracy and steadiness show how well you stay present on a boring task.",
    howTo: ["Digits flash one at a time.", "Tap anywhere for every digit, as soon as it appears.", "Do NOT tap when you see a 3."],
    durations: [2, 4],
    defaultMinutes: 2,
    bestFor: ["morning", "midday"],
    goals: ["attention_span", "focus"],
  },
  {
    id: "flanker",
    name: "Arrow focus",
    kind: "flanker",
    category: "attention",
    summary: "Which way does the middle arrow point? Ignore the rest.",
    why: "A standard selective-attention task: it measures how much distracting information slows you down. A smaller 'interference cost' means better filtering of distractions.",
    howTo: ["Five arrows appear.", "Tap the side the MIDDLE arrow points to.", "Be fast but accurate."],
    durations: [2, 3],
    defaultMinutes: 2,
    bestFor: ["morning", "midday"],
    goals: ["focus", "attention_span"],
  },
  {
    id: "nback",
    name: "Memory track (n-back)",
    kind: "nback",
    category: "memory",
    summary: "Tap Match when the letter equals the one n steps back. Adapts to you.",
    why: "Working-memory training with an adaptive level. Honest note: n-back reliably improves n-back, and effects on everyday memory are modest. It's a demanding focus workout — use it alongside real focus practice, not instead of it.",
    howTo: ["Letters appear one at a time.", "Tap MATCH if the letter is the same as the one n steps back.", "The level goes up when you do well and down when it's too hard."],
    durations: [3, 5],
    defaultMinutes: 3,
    bestFor: ["morning", "midday"],
    goals: ["memory", "focus"],
  },
  {
    id: "schulte",
    name: "Number grid",
    kind: "schulte",
    category: "attention",
    summary: "Find and tap the numbers in order, as fast as you can.",
    why: "A visual search task that demands narrow, continuous focus. Short, game-like, and a decent warm-up before deep work.",
    howTo: ["Tap 1, then 2, then 3… in order.", "Keep your eyes soft and near the centre — let numbers come to you."],
    durations: [1, 2],
    defaultMinutes: 1,
    bestFor: ["any"],
    goals: ["focus", "attention_span"],
  },

  // ---------------------------------------------------------------------------
  // Real-world focus
  // ---------------------------------------------------------------------------
  {
    id: "focus_block",
    name: "Focus block",
    kind: "focus_block",
    category: "focus",
    summary: "One task, one timer, phone away. Log each distraction and return. Grows as you do.",
    why: "Attention span grows most from practising focus on real work. Each block is a set; each distraction you notice and return from is a rep. The target grows by 5 minutes after two clean blocks — and eases off if it's too long.",
    howTo: [
      "Pick one task and write it down.",
      "Put your phone out of reach; close unrelated tabs.",
      "Work until the timer ends. When you notice a distraction, tap 'Distracted' and return.",
    ],
    durations: [10, 15, 20, 25, 30, 45, 60, 90],
    defaultMinutes: 20,
    bestFor: ["morning", "midday"],
    goals: ["attention_span", "focus"],
  },
];

export const MIND_PRACTICE_BY_ID: Record<string, MindPractice> = Object.fromEntries(MIND_PRACTICES.map((p) => [p.id, p]));

export function getPractice(id: string): MindPractice {
  const p = MIND_PRACTICE_BY_ID[id];
  if (!p) throw new Error(`Unknown practice: ${id}`);
  return p;
}
