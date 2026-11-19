import { describe, expect, it } from "vitest";
import {
  applyMindSession,
  breathCountAccuracy,
  buildCues,
  flankerArrows,
  flankerSequence,
  getPractice,
  initialMindState,
  MIND_PRACTICES,
  mindStats,
  nbackBlock,
  nextNBackLevel,
  pacerAt,
  pacerCycleSeconds,
  recommendMind,
  sartNoGoAccuracy,
  sartSequence,
  scoreBreathCount,
  scoreFlanker,
  scoreNBackBlock,
  scoreSart,
  schulteGrid,
  SART_NO_GO,
  type MindProfile,
  type MindSessionLog,
} from "../mind";

const NOW = new Date(2026, 10, 16, 9, 0);
const profile: MindProfile = {
  id: "mind",
  goals: ["attention_span", "focus", "calm"],
  dailyMinutes: 5,
  focusBaselineMinutes: 17,
  voice: true,
  bells: true,
  createdAt: NOW.toISOString(),
  updatedAt: NOW.toISOString(),
};

let n = 0;
function log(partial: Partial<MindSessionLog> & Pick<MindSessionLog, "practiceId" | "kind">): MindSessionLog {
  n++;
  const date = partial.date ?? "2026-11-16";
  return {
    id: `m${n}`,
    date,
    startedAt: `${date}T09:00:00.000Z`,
    endedAt: `${date}T09:10:00.000Z`,
    category: "focus",
    plannedMinutes: 10,
    actualMinutes: 10,
    completed: true,
    updatedAt: "",
    ...partial,
  };
}

describe("practice library", () => {
  it("every practice is complete and honest about what it does", () => {
    expect(MIND_PRACTICES.length).toBeGreaterThanOrEqual(14);
    for (const p of MIND_PRACTICES) {
      expect(p.why.length, p.id).toBeGreaterThan(60);
      expect(p.howTo.length, p.id).toBeGreaterThan(0);
      expect(p.durations, p.id).toContain(p.defaultMinutes);
      if (p.kind === "guided") expect(p.script, p.id).toBeDefined();
    }
    expect(getPractice("nback").why).toMatch(/modest/);
  });
});

describe("guided scripts", () => {
  for (const p of MIND_PRACTICES.filter((x) => x.kind === "guided")) {
    for (const m of p.durations) {
      it(`${p.id} ${m} min: cues fit, are ordered and never overlap`, () => {
        const cues = buildCues(p, m);
        expect(cues.length).toBeGreaterThan(0);
        for (let i = 0; i < cues.length; i++) {
          expect(cues[i].at).toBeGreaterThanOrEqual(0);
          expect(cues[i].at).toBeLessThan(m * 60);
          if (i) expect(cues[i].at - cues[i - 1].at).toBeGreaterThanOrEqual(8);
        }
      });
    }
  }
  it("longer sessions get periodic wandering reminders", () => {
    const cues = buildCues(getPractice("breath_anchor"), 10);
    expect(cues.filter((c) => /wandered|drifted|Thinking again/.test(c.text)).length).toBeGreaterThanOrEqual(4);
  });
});

describe("breathing pacer", () => {
  it("box breathing cycles through all four phases", () => {
    const p = getPractice("box_breathing_mind").pacer!;
    expect(pacerCycleSeconds(p)).toBe(16);
    expect(pacerAt(p, 1).phase).toBe("inhale");
    expect(pacerAt(p, 5).phase).toBe("hold");
    expect(pacerAt(p, 9).phase).toBe("exhale");
    expect(pacerAt(p, 13).phase).toBe("hold2");
    expect(pacerAt(p, 17).cycle).toBe(1);
    expect(pacerAt(p, 5).scale).toBe(1);
  });
  it("cyclic sigh tops up before the long exhale", () => {
    const p = getPractice("cyclic_sigh").pacer!;
    expect(pacerAt(p, 3.5).phase).toBe("topUp");
    expect(pacerAt(p, 3.5).scale).toBeGreaterThan(0.85);
    expect(pacerAt(p, 6).phase).toBe("exhale");
  });
});

describe("drills", () => {
  it("SART: balanced digits, ~1 in 9 no-go, deterministic", () => {
    const seq = sartSequence("a", 2);
    expect(seq).toEqual(sartSequence("a", 2));
    expect(seq.length % 9).toBe(0);
    expect(seq.filter((d) => d === SART_NO_GO).length).toBe(seq.length / 9);
  });
  it("SART scoring separates impulsive taps from lapses", () => {
    const m = scoreSart([
      { digit: 1, rtMs: 300 },
      { digit: 3, rtMs: 280 },
      { digit: 5, rtMs: null },
      { digit: 3, rtMs: null },
      { digit: 7, rtMs: 340 },
    ]);
    expect(m.commissionErrors).toBe(1);
    expect(m.omissionErrors).toBe(1);
    expect(sartNoGoAccuracy(m)).toBe(0.5);
    expect(m.meanRtMs).toBe(320);
  });
  it("Flanker: balanced trials and interference cost", () => {
    const seq = flankerSequence("x", 2);
    expect(seq.filter((t) => t.congruent).length).toBe(seq.length / 2);
    expect(flankerArrows({ direction: "left", congruent: false })).toBe("→→←→→");
    const m = scoreFlanker([
      { trial: { direction: "left", congruent: true }, answer: "left", rtMs: 400 },
      { trial: { direction: "right", congruent: false }, answer: "right", rtMs: 500 },
      { trial: { direction: "right", congruent: false }, answer: "left", rtMs: 450 },
    ]);
    expect(m.interferenceMs).toBe(100);
    expect(m.accuracy).toBeCloseTo(0.667, 2);
  });
  it("N-back: targets are real matches, levels adapt both ways", () => {
    const { letters, targets } = nbackBlock("s", 2);
    targets.forEach((t, i) => {
      if (i < 2) expect(t).toBe(false);
      else expect(letters[i] === letters[i - 2]).toBe(t);
    });
    const perfect = scoreNBackBlock(2, targets, targets);
    expect(nextNBackLevel(perfect)).toBe(3);
    const none = scoreNBackBlock(2, targets, targets.map(() => false));
    expect(nextNBackLevel(none)).toBe(1);
  });
  it("Schulte grid contains each number once", () => {
    const g = schulteGrid("q", 5);
    expect([...g].sort((a, b) => a - b)).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
  });
  it("breath counting: 9 counts + ten is a round; miscounts and lost count are errors", () => {
    const round = [...Array(9).fill("count"), "ten"] as const;
    const m = scoreBreathCount([...round, "count", "ten", ...round, "count", "lost"]);
    expect(m.correctRounds).toBe(2);
    expect(m.errors).toBe(1);
    expect(m.lostCount).toBe(1);
    expect(breathCountAccuracy(m)).toBe(0.5);
  });
});

describe("mind progression", () => {
  it("starts focus blocks at the self-reported span", () => {
    expect(initialMindState(profile, NOW).focusTargetMinutes).toBe(15);
    expect(initialMindState({ ...profile, focusBaselineMinutes: 3 }, NOW).focusTargetMinutes).toBe(10);
  });
  it("focus span grows after two clean blocks and eases after two struggles", () => {
    let st = initialMindState(profile, NOW);
    const block = (completed: boolean, distractions: number, focused = st.focusTargetMinutes) =>
      log({ practiceId: "focus_block", kind: "focus_block", focus: { task: "x", targetMinutes: st.focusTargetMinutes, focusedMinutes: focused, distractions, completed } });
    st = applyMindSession(st, block(true, 1), NOW).state;
    expect(st.focusTargetMinutes).toBe(15);
    const r = applyMindSession(st, block(true, 2), NOW);
    st = r.state;
    expect(st.focusTargetMinutes).toBe(20);
    expect(r.changes[0].label).toBe("Focus span");
    st = applyMindSession(st, block(false, 1, 8), NOW).state;
    st = applyMindSession(st, block(true, 6), NOW).state;
    expect(st.focusTargetMinutes).toBe(15);
  });
  it("breath counting duration steps up with accuracy", () => {
    const st = initialMindState(profile, NOW);
    const r = applyMindSession(st, log({ practiceId: "breath_counting", kind: "breath_count", plannedMinutes: 5, breathCount: { correctRounds: 5, errors: 1, lostCount: 0 } }), NOW);
    expect(r.state.breathCountMinutes).toBe(8);
  });
  it("n-back level carries over", () => {
    const st = initialMindState(profile, NOW);
    const r = applyMindSession(st, log({ practiceId: "nback", kind: "nback", nback: { blocks: [], startLevel: 2, endLevel: 3, accuracy: 0.9 } }), NOW);
    expect(r.state.nbackLevel).toBe(3);
  });
});

describe("mind recommender", () => {
  const state = initialMindState(profile, NOW);
  it("asks for setup first", () => {
    expect(recommendMind({ profile: null, state: null, sessions: [], now: NOW }).kind).toBe("setup");
  });
  it("starts beginners with mindfulness within their time budget", () => {
    const r = recommendMind({ profile, state, sessions: [], now: NOW });
    expect(r.kind).toBe("practice");
    expect(getPractice(r.primary!.practiceId).category).not.toBe("memory");
    expect(r.primary!.minutes).toBeLessThanOrEqual(5);
    expect(r.focusBlock.minutes).toBe(15);
  });
  it("offers a short reset when tired or busy, and wind-down in the evening", () => {
    expect(recommendMind({ profile, state, sessions: [], now: NOW, feeling: "busy" }).primary!.practiceId).toBe("cyclic_sigh");
    expect(recommendMind({ profile, state, sessions: [], now: new Date(2026, 10, 16, 21, 0) }).primary!.practiceId).toBe("body_scan");
  });
  it("rotates practices and marks the day done after a session", () => {
    const first = recommendMind({ profile, state, sessions: [], now: NOW }).primary!.practiceId;
    const done = [log({ practiceId: first, kind: "guided", category: "mindfulness" })];
    const r = recommendMind({ profile, state, sessions: done, now: NOW });
    expect(r.kind).toBe("done");
    const tomorrow = recommendMind({ profile, state, sessions: done, now: new Date(2026, 10, 17, 9, 0) });
    expect(tomorrow.primary!.practiceId).not.toBe(first);
  });
  it("brings attention drills in once a habit exists", () => {
    const sessions: MindSessionLog[] = [];
    let drills = 0;
    for (let d = 16; d < 30; d++) {
      const r = recommendMind({ profile, state, sessions, now: new Date(2026, 10, d, 9, 0) });
      if (["sart", "flanker", "schulte", "nback"].includes(r.primary!.practiceId)) drills++;
      sessions.push(log({ practiceId: r.primary!.practiceId, kind: getPractice(r.primary!.practiceId).kind, date: `2026-11-${d}` }));
    }
    expect(drills).toBeGreaterThanOrEqual(3);
    expect(drills).toBeLessThanOrEqual(10);
  });
});

describe("mind stats", () => {
  it("summarises real logged data only", () => {
    const sessions = [
      log({ practiceId: "focus_block", kind: "focus_block", focus: { task: "a", targetMinutes: 20, focusedMinutes: 20, distractions: 2, completed: true } }),
      log({ practiceId: "focus_block", kind: "focus_block", date: "2026-11-17", focus: { task: "b", targetMinutes: 25, focusedMinutes: 25, distractions: 1, completed: true } }),
      ...[1, 2, 3].map((i) => log({ practiceId: "breath_anchor", kind: "guided", date: `2026-11-1${i + 5}`, actualMinutes: 5, before: { calm: 2 }, after: { calm: 4 } })),
    ];
    const s = mindStats(sessions, initialMindState(profile, NOW), new Date(2026, 10, 19, 9), 1);
    expect(s.focus.longestMinutes).toBe(25);
    expect(s.focus.distractionsPerHour).toBe(4);
    expect(s.calmShift).toEqual({ avg: 2, n: 3 });
    expect(s.observations.join(" ")).toMatch(/calmer/);
    expect(mindStats([], null, NOW).totalSessions).toBe(0);
  });
});
