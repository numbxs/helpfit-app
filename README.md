# HelpFit — adaptive personal fitness coach

A mobile-first, local-first Progressive Web App that behaves like a good personal trainer: it plans short, effective workouts around your real life, makes starting easy, learns from what you actually do, and progresses you safely.

> **Principle:** the best workout is one that improves your fitness *and* that you'll actually complete.

## What it does

| Area | What you get |
|---|---|
| **Onboarding** | ~2 minutes, one question per screen: goals, starting level, realistic time, places & equipment, likes/dislikes, barriers, a pre-exercise health screen, current pain/past injuries, optional body details. Ends with a realistic first week and a **Start first workout** button. |
| **Today** | One recommended workout with duration, objective, and a short *why*. One-tap **5 / 15 / 30 min** versions of the same session, *Easier*, *Harder*, *Something different*, *Not today*, per-exercise swap, an optional "How are you feeling?" check-in, weekly progress ring, pain follow-ups, weekly review and optional step-up proposals. |
| **Active workout** | One exercise at a time, big targets, rep/weight steppers, auto-running timers with lead-in, interval phases, rest timer (+15 s / skip), pause/resume, replace/skip/report pain mid-session, screen wake lock, sound/haptic cues, "That's your 5 minutes — keep going?", then 3-tap feedback and a summary of what progresses next time. Survives reloads. |
| **Plan** | This week day by day, minimum / target / stretch, move sessions, adjust sessions-per-week and default length, export the week to your calendar (`.ics` with alarms), log football/hikes/runs (they fill cardio slots). |
| **Progress** | Sessions, active minutes, 4-week consistency, comebacks after breaks, workouts per week vs target, per-pattern strength sparklines from logged reps, milestones, cardio minutes and level, follow-through by session length and time of day, barriers, enjoyment, often-skipped exercises, weekly reviews, optional body weight. No invented numbers. |
| **Mind** | Attention and focus training. **Focus blocks** on real work (one task, phone away, tap "I got distracted" and return) with an adaptive focus span that grows 5 minutes after two clean blocks. **Mindfulness** (breath anchor, breath counting, noting, body scan, 3-step breathing space, urge surfing, mindful walk) with timed cues, optional voice guidance and bells. **Breathing** (box, long exhale, cyclic sighing) with an animated pacer. **Measured drills**: Steady tap (sustained attention, SART-style), Arrow focus (flanker interference), Memory track (adaptive n-back), Number grid (Schulte). A daily recommendation adapts to time of day, how you feel and what you've done; Progress shows real trends; the coach can hand you a practice. |
| **Coach** | Works offline with no API key (rule-based, grounded in your data). Optional AI coach (Claude) behind a protected server endpoint, with separate consent for training data and health data. The coach can only *propose* changes; you confirm, the deterministic engine applies them. |
| **Profile** | Goals, equipment, preferences, barriers, health screen & clearance, caution areas, discomfort log, **what the app has learned** (confirm / "not true"), reminders, AI consent, theme, training history, export / import / delete. |

### The seven journeys (all covered by end-to-end tests)
A first use → workout in minutes · B busy day, 5-minute session · C four missed days → friendly restart, no catch-up · D progressions recognised and shown · E low motivation → one easy action · F pain → conservative, area avoided, red-flag symptoms stop everything · G behaviour learned over weeks → recommendations change.

## Quick start

Requirements: Node 20.9+ (22 recommended).

```bash
npm install
npm run dev          # http://localhost:3000
```

Open it on your phone on the same network (`http://<your-computer-ip>:3000`) or use desktop devtools device mode. The service worker (offline support) only registers in production builds — use `npm run build && npm start` to try offline/installation locally.

### Scripts

| Command | |
|---|---|
| `npm run dev` | Dev server (Turbopack) |
| `npm run build` / `npm start` | Production build / server |
| `npm test` | Unit tests for the training and mind engines (Vitest, 195 tests) |
| `npm run test:e2e` | End-to-end journeys in Chromium (Playwright; builds and starts the app on port 3100). Set `E2E_BASE_URL=http://localhost:3000 E2E_SKIP_OFFLINE=1` to run against a dev server. |
| `npm run check` | Typecheck + lint + unit tests |

## Install on your phone (PWA)

Deploy over HTTPS (see below), open the URL, then:
- **iPhone (Safari):** Share → *Add to Home Screen*.
- **Android (Chrome):** menu → *Install app*.

After the first visit the app shell is cached: it opens, navigates, and records full workouts offline. All data lives on the device.

## Deploy

**Vercel (simplest):** import the repo, no configuration needed. Add environment variables only if you want the AI coach.

**Docker:**
```bash
docker build -t helpfit .
docker run -p 3000:3000 -e ANTHROPIC_API_KEY=... -e COACH_ACCESS_TOKEN=... helpfit
```
(The image uses Next's standalone output; put it behind HTTPS — PWAs and service workers require it.)

**Any Node host:** `npm ci && npm run build && npm start` (port via `PORT`).

### Optional: AI coach

Copy `.env.example` to `.env.local` and set:

| Variable | |
|---|---|
| `ANTHROPIC_API_KEY` | Enables the AI coach. Server-side only. |
| `COACH_ACCESS_TOKEN` | **Required in production** when a key is set (otherwise the endpoint refuses requests so strangers can't spend your key). Enter the same value in the app: *Profile → AI coach → Access token*. |
| `COACH_MODEL` | Optional, defaults to `claude-opus-5-5`. |

Then enable it in *Profile → AI coach* and consent to sharing training data (health data is a separate, optional consent). Without a key everything still works — the coach answers on-device. The endpoint uses server-side refusal fallbacks (`fallbacks: "default"`), low effort for chat latency/cost, validates and size-limits requests, rate-limits per IP, never logs content, strips health data unless consented, and only returns proposals from a fixed action list.

## Architecture

```
src/
  engine/            Pure, deterministic training engine (no DOM, no I/O, no randomness)
    types.ts           Domain model
    exercises/         Seeded library (~95 exercises) + selection/filters
    safety.ts          Pre-exercise screen, pain → stress limits, professional-assessment advice
    builder.ts         Session templates → 5/15/30-min variants of the same objective
    progression.ts     Double progression, one variable at a time; regressions; cardio level
    planner.ts         Weekly targets, goal-weighted focus allocation, day spacing, reflow
    recommender.ts     Today's session from plan + check-in + history + insights + overrides
    insights.ts        Behaviour learning (inferred vs confirmed vs rejected)
    reflection.ts      Weekly review; decreases auto-apply, increases are only proposed
    reminders.ts       Guilt-free reminder scheduling with quiet hours; .ics export
    coach.ts           Coach context builder + rule-based coach
    stats.ts           Analytics for Progress
    __tests__/         Unit + multi-week simulation tests
  lib/
    db.ts              IndexedDB schema (Dexie)
    services.ts        All mutations: onboarding, week rollover, workouts, learning, safety
    data-transfer.ts   Validated export / import / delete
    coach-client.ts    Consent-aware AI call with on-device fallback
  app/                 Next.js App Router (all screens are client-rendered from local data)
    api/coach/         Protected AI endpoint
    sw.js/             Versioned service worker (precache + offline + reminder delivery)
  components/          UI (shadcn/ui on Base UI, Tailwind v4)
e2e/                   Playwright journeys, offline test, screenshot helper
```

**Deterministic code owns every training decision** — scheduling, progression, exercise constraints, safety. The LLM is used only for conversation and can only propose actions from a fixed list, which the engine validates and applies after the user confirms.

### Key engine rules (summary)
- **Targets:** minimum (achievable in a hard week), target, stretch (= target + 1, never pressured). First week starts conservatively.
- **Variants:** every focus has minimum/quick/full built from the same movement patterns, fitted to 4–7 / 10–16 / 20–32 minute windows (tested for many profiles).
- **Progression:** a success = all sets at target, manageable effort, no discomfort. Two successes → +1 rep (+2 above 10) up to the top of the range → then +load (weighted) or harder variation (bodyweight). Calibration: an easy first few sessions step up faster. Two struggles → step back. "Make it easier" sessions never progress. Logged weights replace starting suggestions.
- **Missed days:** sessions reflow forward without stacking; when the week runs out, lower-priority sessions quietly drop. After 4+ quiet days (3 if restart friction is learned) Today switches to a gentle restart session; long gaps restart easier.
- **Safety:** flagged health answers block structured workouts until the user confirms professional clearance. Active pain limits how much any exercise may load that area (mild → low stress only; moderate/sharp → none); past injuries exclude high-stress moves; lower-limb issues remove high impact. Severe, sharp, persistent, recurring or worsening pain → recommend professional assessment. Chest pain, dizziness, fainting or unusual breathlessness → stop, seek medical help, clearance required again.
- **Learning:** shorter-vs-longer sessions, evening energy, best time window, outdoor vs indoor cardio enjoyment, restart friction, difficulty trends, boredom, repeatedly replaced exercises, enjoyed session types, frequent barriers. Each insight shows its evidence and its concrete effect; rejected insights are never applied.

### Mind engine (`src/engine/mind/`)
- Same rules as training: pure, deterministic (drills use a seeded generator), unit-tested.
- Adaptive targets, one variable each: focus span ±5 min (two clean blocks up, two struggles down), breath-counting duration by accuracy, n-back level by block performance, number-grid size by speed.
- Honest framing in the app: drills mostly improve the drilled skill; real-world focus improves most with focus blocks, mindfulness, exercise and sleep. Not a treatment for ADHD, anxiety or depression.

### Data & privacy
- Stored locally in IndexedDB; nothing leaves the device unless you export it or opt in to the AI coach.
- Export (JSON, secrets excluded), validated import, and permanent delete in *Profile → Your data*.
- Every record has an id and `updatedAt`, so a sync layer (per-record last-write-wins) can be added without changing the model.

## Honest limitations / next phases
- **Reminders:** browsers can't schedule notifications reliably without a push server. The app shows reminders while open, uses Periodic Background Sync on installed Chrome/Android PWAs, and offers calendar export (`.ics` with alarms) as the reliable path. True push needs a small backend with VAPID keys (not included).
- **Apple Health / Health Connect:** not available to browser PWAs. Treat as a native (Capacitor/React Native) phase; the data model already separates external activities.
- **Sync / multi-device:** export/import works today; cloud sync is a later phase.
- **AI coach:** verified end-to-end up to the Anthropic API (auth, validation, consent filtering, error fallbacks); a live model response needs your own API key.
- Not a medical device. It gives general fitness guidance and errs on the side of caution.
