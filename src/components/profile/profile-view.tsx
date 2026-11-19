"use client";

import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Bell, Brain, CalendarPlus, ChevronRight, Download, HeartPulse, Palette, ShieldCheck, Sparkles, Trash2, Upload, UserRound } from "lucide-react";
import { useData } from "@/components/app/data-context";
import { PageHeader } from "@/components/app/page-header";
import { ChoiceGroup, Segmented } from "@/components/kit/choice";
import { Pill, SectionTitle, Surface } from "@/components/kit/bits";
import { Sheet } from "@/components/kit/sheet";
import { PainSheet } from "@/components/shared/pain-sheet";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  AREA_LABEL,
  buildICS,
  READINESS_QUESTIONS,
  readinessFlags,
  WEEKDAY_LONG,
  type ActivityLevel,
  type ActivityPreference,
  type Barrier,
  type BodyArea,
  type Equipment,
  type Experience,
  type Goal,
  type Insight,
  type Location,
  type Profile,
  type ReadinessAnswerKey,
  type ReminderSettings,
  type TimeOfDay,
} from "@/engine";
import { fetchCoachStatus, type CoachStatus } from "@/lib/coach-client";
import { useHydrated } from "@/lib/hooks";
import { deleteAllData, downloadBlob, downloadJson, exportData, importData } from "@/lib/data-transfer";
import {
  ACTIVITIES,
  ACTIVITY_LEVELS,
  BARRIERS,
  BODY_AREAS,
  DISLIKES,
  EQUIPMENT,
  EXPERIENCE,
  FOCUS_NAME,
  GOALS,
  labelOf,
  LIKES,
  LOCATIONS,
  TIMES,
} from "@/lib/labels";
import { confirmClearance, deleteSession, setInsightStatus, updatePain, updateProfile, updateReadiness, updateSettings } from "@/lib/services";
import { cn } from "@/lib/utils";
import { MindSettingsSection } from "./mind-settings";

type EditKey = null | "goals" | "level" | "place" | "likes" | "barriers" | "cautions" | "details" | "readiness";

export function ProfileView() {
  const data = useData();
  const snap = data.snapshot!;
  const p = snap.profile;
  const [edit, setEdit] = useState<EditKey>(null);
  const [painOpen, setPainOpen] = useState(false);
  const since = new Date(p.createdAt).toLocaleDateString(undefined, { month: "long", year: "numeric" });

  return (
    <div className="space-y-7 pb-4">
      <PageHeader eyebrow={`Training since ${since}`} title="Profile" showProfile={false} />

      <section>
        <SectionTitle>Training</SectionTitle>
        <div className="overflow-hidden rounded-3xl border bg-card">
          <Row icon={<UserRound className="size-5" />} title="Goals & schedule" value={`${p.goals.map((g) => labelOf(GOALS, g)).join(", ")} · ${p.daysPerWeek}×/week · ${p.sessionMinutes} min`} onClick={() => setEdit("goals")} />
          <Row title="Starting level" value={`${labelOf(ACTIVITY_LEVELS, p.activityLevel)} · ${labelOf(EXPERIENCE, p.experience)}`} onClick={() => setEdit("level")} />
          <Row
            title="Places & equipment"
            value={`${p.locations.map((l) => labelOf(LOCATIONS, l)).join(", ")}${p.equipment.length ? ` · ${p.equipment.map((e) => labelOf(EQUIPMENT, e)).join(", ")}` : " · no equipment"}`}
            onClick={() => setEdit("place")}
          />
          <Row
            title="Likes & dislikes"
            value={[p.likes.length ? `Likes ${p.likes.map((l) => labelOf(LIKES, l)).join(", ")}` : "", p.dislikes.length ? `avoids ${p.dislikes.map((l) => labelOf(DISLIKES, l)).join(", ")}` : ""].filter(Boolean).join(" · ") || "Not set"}
            onClick={() => setEdit("likes")}
          />
          <Row title="What gets in the way" value={p.barriers.map((b) => labelOf(BARRIERS, b)).join(", ") || "Not set"} onClick={() => setEdit("barriers")} />
          <Row title="Body details (optional)" value={[p.ageYears && `${p.ageYears} yrs`, p.heightCm && `${p.heightCm} cm`, p.weightKg && `${p.weightKg} kg`].filter(Boolean).join(" · ") || "Not shared"} onClick={() => setEdit("details")} />
        </div>
      </section>

      <MindSettingsSection />
      <HealthSection onEdit={setEdit} onReport={() => setPainOpen(true)} />
      <InsightsSection insights={snap.insights} />
      <RemindersSection />
      <AiSection />
      <AppearanceSection />
      <HistorySection />
      <DataSection />

      <p className="px-1 text-xs leading-relaxed text-muted-foreground">
        HelpFit gives general fitness guidance and is not a medical device. It doesn't diagnose or treat conditions. Stop if something hurts and talk to a qualified professional about pain, injuries or health conditions.
      </p>

      <EditSheets edit={edit} onClose={() => setEdit(null)} profile={p} />
      <PainSheet open={painOpen} onOpenChange={setPainOpen} context="checkin" />
    </div>
  );
}

function Row({ icon, title, value, onClick }: { icon?: React.ReactNode; title: string; value: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 border-b px-4 py-3.5 text-left last:border-b-0 hover:bg-muted/40">
      {icon && <span className="text-muted-foreground">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold">{title}</span>
        <span className="block truncate text-sm text-muted-foreground">{value}</span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
    </button>
  );
}

// ---------------------------------------------------------------------------

function HealthSection({ onEdit, onReport }: { onEdit: (k: EditKey) => void; onReport: () => void }) {
  const data = useData();
  const snap = data.snapshot!;
  const r = snap.profile.readiness;
  const [notes, setNotes] = useState("");
  const pain = [...snap.pain].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  const flags = readinessFlags(r);
  return (
    <section id="health" className="scroll-mt-6">
      <SectionTitle>Health & safety</SectionTitle>
      <Surface className="space-y-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className={cn("mt-0.5 size-5 shrink-0", r.status === "needs_clearance" ? "text-warning-foreground" : "text-chart-1")} />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">
              {r.status === "clear" ? "Health check: clear" : r.status === "cleared_by_professional" ? "Cleared by a professional" : "Professional clearance recommended"}
            </p>
            <p className="text-sm text-muted-foreground">
              {r.status === "needs_clearance"
                ? `${flags.length} answer${flags.length === 1 ? "" : "s"} suggest checking with a doctor before structured workouts.`
                : `Checked ${new Date(r.completedAt).toLocaleDateString()}.`}
              {r.clearanceNotes ? ` Note: ${r.clearanceNotes}` : ""}
            </p>
          </div>
        </div>
        {r.status === "needs_clearance" && (
          <div className="space-y-2 rounded-2xl bg-warning-soft p-4 text-warning-foreground">
            <p className="text-sm">When a doctor or qualified professional has cleared you for exercise, confirm here. Add any restrictions they gave you.</p>
            <Input className="h-11 bg-background text-foreground" placeholder="Optional note" value={notes} onChange={(e) => setNotes(e.target.value)} />
            <Button className="h-11 w-full rounded-xl" onClick={() => confirmClearance(notes).then(() => toast("Plan unlocked"))}>
              I've been cleared to exercise
            </Button>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="h-10 rounded-full" onClick={() => onEdit("readiness")}>
            Review health answers
          </Button>
          <Button variant="outline" className="h-10 rounded-full" onClick={() => onEdit("cautions")}>
            Areas to be careful with
          </Button>
          <Button variant="outline" className="h-10 rounded-full" onClick={onReport}>
            <HeartPulse className="size-4" /> Report discomfort
          </Button>
        </div>
        {snap.profile.cautionAreas.length > 0 && (
          <p className="text-sm text-muted-foreground">Careful with: {snap.profile.cautionAreas.map((a) => AREA_LABEL[a]).join(", ")} — no high-stress moves there.</p>
        )}
        {pain.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-semibold">Discomfort log</p>
            <ul className="space-y-2">
              {pain.map((x) => (
                <li key={x.id} className="flex items-center justify-between gap-3 rounded-2xl border p-3 text-sm">
                  <span className="min-w-0">
                    <span className="block font-medium capitalize">
                      {AREA_LABEL[x.area]} · {x.severity}/10
                    </span>
                    <span className="block text-muted-foreground">
                      {x.date} · {x.status === "resolved" ? "resolved" : x.status === "improving" ? "improving" : "active"}
                    </span>
                  </span>
                  {x.status !== "resolved" ? (
                    <Button size="sm" variant="outline" className="h-9 rounded-full" onClick={() => updatePain(x.id, "resolved")}>
                      Mark gone
                    </Button>
                  ) : (
                    <Pill>Resolved</Pill>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Surface>
    </section>
  );
}

// ---------------------------------------------------------------------------

function InsightsSection({ insights }: { insights: Insight[] }) {
  return (
    <section>
      <SectionTitle>What I've learned about you</SectionTitle>
      {insights.length === 0 ? (
        <Surface className="text-sm text-muted-foreground">
          Nothing yet. After a few sessions and skips, patterns appear here — like which session lengths or times work best. You can confirm or correct each one.
        </Surface>
      ) : (
        <ul className="space-y-2">
          {insights.map((i) => (
            <li key={i.key}>
              <Surface className={cn("p-4", i.status === "rejected" && "opacity-60")}>
                <div className="flex items-start gap-3">
                  <Brain className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{i.statement}</p>
                      <Pill tone={i.status === "confirmed" ? "volt" : i.status === "rejected" ? "outline" : "muted"}>
                        {i.status === "confirmed" ? "Confirmed" : i.status === "rejected" ? "Not true" : `Inferred · ${i.confidence}`}
                      </Pill>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{i.evidence}</p>
                    {i.status !== "rejected" && <p className="mt-1 text-sm">→ {i.effect}</p>}
                    <div className="mt-3 flex gap-2">
                      {i.status !== "confirmed" && (
                        <Button size="sm" variant="outline" className="h-9 rounded-full" onClick={() => setInsightStatus(i.key, "confirmed")}>
                          That's right
                        </Button>
                      )}
                      {i.status !== "rejected" ? (
                        <Button size="sm" variant="ghost" className="h-9 rounded-full" onClick={() => setInsightStatus(i.key, "rejected")}>
                          Not true
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost" className="h-9 rounded-full" onClick={() => setInsightStatus(i.key, "inferred")}>
                          Undo
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </Surface>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------

function RemindersSection() {
  const data = useData();
  const r = data.settings.reminders;
  const [perm, setPerm] = useState<string>(() => (typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported"));
  const set = (patch: Partial<ReminderSettings>) => updateSettings({ reminders: { ...r, ...patch } });
  return (
    <section id="reminders" className="scroll-mt-6">
      <SectionTitle>Reminders</SectionTitle>
      <Surface className="space-y-5">
        <label className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-3">
            <Bell className="size-5 text-muted-foreground" />
            <span>
              <span className="block font-semibold">Gentle reminders</span>
              <span className="block text-sm text-muted-foreground">One a day at most. Never guilt.</span>
            </span>
          </span>
          <Switch
            checked={r.enabled}
            onCheckedChange={async (v) => {
              if (v && "Notification" in window && Notification.permission === "default") {
                const res = await Notification.requestPermission();
                setPerm(res);
              }
              set({ enabled: v });
            }}
            aria-label="Enable reminders"
          />
        </label>
        {r.enabled && (
          <>
            <Segmented
              ariaLabel="Reminder frequency"
              options={[
                { value: "planned_days", label: "Planned days" },
                { value: "daily", label: "Daily nudge" },
                { value: "weekly_summary", label: "Weekly only" },
              ]}
              value={r.frequency}
              onChange={(v) => set({ frequency: v })}
            />
            <div className="grid grid-cols-3 gap-3 text-sm">
              <label className="space-y-1.5">
                <span className="font-medium">Time</span>
                <select
                  className="h-11 w-full rounded-xl border bg-background px-2"
                  value={r.time}
                  onChange={(e) => set({ time: e.target.value })}
                  aria-label="Reminder time"
                >
                  <option value="auto">Learned</option>
                  {["06:30", "07:00", "07:30", "08:00", "12:00", "12:30", "16:00", "17:00", "17:30", "18:00", "18:30", "19:00", "20:00"].map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1.5">
                <span className="font-medium">Quiet from</span>
                <Input type="time" className="h-11 rounded-xl" value={r.quietStart} onChange={(e) => set({ quietStart: e.target.value })} />
              </label>
              <label className="space-y-1.5">
                <span className="font-medium">Quiet until</span>
                <Input type="time" className="h-11 rounded-xl" value={r.quietEnd} onChange={(e) => set({ quietEnd: e.target.value })} />
              </label>
            </div>
            <div className="rounded-2xl bg-muted/70 p-3 text-xs leading-relaxed text-muted-foreground">
              {perm === "granted"
                ? "Notifications are allowed. "
                : perm === "denied"
                  ? "Notifications are blocked in your browser settings — you'll see reminders inside the app instead. "
                  : perm === "unsupported"
                    ? "This browser doesn't support notifications — reminders appear inside the app. "
                    : "Allow notifications when asked to get reminders outside the app. "}
              Browsers only deliver reminders reliably while the app is open (and via background sync on installed Android/Chrome apps). For guaranteed reminders, add your week to your calendar:
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                className="h-10 rounded-full"
                onClick={() => {
                  if (!data.snapshot?.plan) return;
                  const ics = buildICS(data.snapshot.plan, r, new Date(), window.location.origin);
                  downloadBlob(new Blob([ics], { type: "text/calendar" }), `helpfit-week-${data.snapshot.plan.weekStart}.ics`);
                }}
              >
                <CalendarPlus className="size-4" /> Add week to calendar
              </Button>
              {perm === "granted" && (
                <Button
                  variant="ghost"
                  className="h-10 rounded-full"
                  onClick={async () => {
                    const reg = await navigator.serviceWorker?.getRegistration();
                    if (reg) await reg.showNotification("HelpFit", { body: "Reminders are working.", icon: "/icons/icon-192.png" });
                    else new Notification("HelpFit", { body: "Reminders are working." });
                  }}
                >
                  Send a test
                </Button>
              )}
            </div>
          </>
        )}
      </Surface>
    </section>
  );
}

// ---------------------------------------------------------------------------

function AiSection() {
  const data = useData();
  const ai = data.settings.ai;
  const [status, setStatus] = useState<CoachStatus | null>(null);
  const [token, setToken] = useState(ai.accessToken ?? "");
  useEffect(() => {
    fetchCoachStatus().then(setStatus);
  }, []);
  const set = (patch: Partial<typeof ai>) => updateSettings({ ai: { ...ai, ...patch } });
  return (
    <section id="ai" className="scroll-mt-6">
      <SectionTitle>AI coach (optional)</SectionTitle>
      <Surface className="space-y-4">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            The app works fully without AI: plans, progressions and safety rules are computed on your device. The AI coach only adds natural-language conversation and can only <em>suggest</em> changes you confirm.
          </p>
        </div>
        {status && !status.available ? (
          <p className="rounded-2xl bg-muted/70 p-3 text-sm text-muted-foreground">Not configured on this server (no API key). The on-device coach is used.</p>
        ) : (
          <>
            <ToggleRow label="Use the AI coach" hint="Messages go to a protected server endpoint, then to Anthropic's API." checked={ai.enabled} onChange={(v) => set({ enabled: v, shareTraining: v ? ai.shareTraining : false, shareHealth: v ? ai.shareHealth : false })} />
            {ai.enabled && (
              <>
                <ToggleRow
                  label="Share training data"
                  hint="Required: goals, plan, sessions, progress and learned preferences, sent with each message. Not stored by the app's server."
                  checked={ai.shareTraining}
                  onChange={(v) => set({ shareTraining: v })}
                />
                <ToggleRow
                  label="Also share health data"
                  hint="Optional: pain reports, areas to be careful with, health-check status and body details. Off by default."
                  checked={ai.shareHealth}
                  onChange={(v) => set({ shareHealth: v })}
                />
                {status?.requiresToken && (
                  <div className="space-y-1.5">
                    <p className="text-sm font-medium">Access token</p>
                    <div className="flex gap-2">
                      <Input type="password" autoComplete="off" className="h-11 rounded-xl" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Set by whoever deployed this app" />
                      <Button className="h-11 rounded-xl" onClick={() => set({ accessToken: token.trim() || undefined }).then(() => toast("Saved on this device"))}>
                        Save
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </Surface>
    </section>
  );
}

function ToggleRow({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start justify-between gap-4">
      <span>
        <span className="block font-semibold">{label}</span>
        <span className="block text-sm text-muted-foreground">{hint}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} className="mt-1" />
    </label>
  );
}

// ---------------------------------------------------------------------------

function AppearanceSection() {
  const data = useData();
  const { theme, setTheme } = useTheme();
  const mounted = useHydrated();
  return (
    <section>
      <SectionTitle>Appearance & feedback</SectionTitle>
      <Surface className="space-y-4">
        <div className="flex items-center gap-3">
          <Palette className="size-5 text-muted-foreground" />
          <div className="flex-1">
            <Segmented
              ariaLabel="Theme"
              options={[
                { value: "system", label: "Auto" },
                { value: "light", label: "Light" },
                { value: "dark", label: "Dark" },
              ]}
              value={mounted ? (theme ?? "system") : "system"}
              onChange={(v) => {
                setTheme(v);
                updateSettings({ theme: v as "system" | "light" | "dark" });
              }}
            />
          </div>
        </div>
        <ToggleRow label="Timer sounds" hint="A soft beep when timers end." checked={data.settings.sound} onChange={(v) => updateSettings({ sound: v })} />
        <ToggleRow label="Vibration" hint="Haptic cues during workouts, where supported." checked={data.settings.haptics} onChange={(v) => updateSettings({ haptics: v })} />
      </Surface>
    </section>
  );
}

// ---------------------------------------------------------------------------

function HistorySection() {
  const data = useData();
  const sessions = [...data.snapshot!.sessions].filter((s) => s.status !== "in_progress").reverse().slice(0, 12);
  if (!sessions.length) return null;
  return (
    <section>
      <SectionTitle>Training history</SectionTitle>
      <ul className="overflow-hidden rounded-3xl border bg-card">
        {sessions.map((s) => (
          <li key={s.id} className="flex items-center gap-3 border-b px-4 py-3 text-sm last:border-b-0">
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{s.source === "external" ? labelOf(ACTIVITIES, s.activity ?? "other") : FOCUS_NAME[s.focus]}</span>
              <span className="block text-muted-foreground">
                {new Date(s.startedAt).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} · {Math.round(s.actualMinutes)} min
                {s.status !== "completed" ? ` · ${s.status}` : ""}
              </span>
            </span>
            <button
              type="button"
              className="flex size-10 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
              aria-label="Delete this session"
              onClick={() =>
                toast("Delete this session?", {
                  action: { label: "Delete", onClick: () => deleteSession(s.id) },
                })
              }
            >
              <Trash2 className="size-4" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------

function DataSection() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingImport, setPendingImport] = useState<unknown>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [typed, setTyped] = useState("");
  return (
    <section>
      <SectionTitle>Your data</SectionTitle>
      <Surface className="space-y-3">
        <p className="text-sm text-muted-foreground">Everything is stored on this device only. Export a backup any time, or move to another device by importing it there.</p>
        <div className="grid gap-2">
          <Button
            variant="outline"
            className="h-12 justify-start gap-3 rounded-2xl"
            onClick={async () => {
              const file = await exportData();
              downloadJson(file, `helpfit-backup-${new Date().toISOString().slice(0, 10)}.json`);
            }}
          >
            <Download className="size-5" /> Export data (JSON)
          </Button>
          <Button variant="outline" className="h-12 justify-start gap-3 rounded-2xl" onClick={() => fileRef.current?.click()}>
            <Upload className="size-5" /> Import a backup
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              if (f.size > 20_000_000) return toast.error("That file is too large.");
              try {
                setPendingImport(JSON.parse(await f.text()));
              } catch {
                toast.error("That file isn't valid JSON.");
              }
            }}
          />
          <Button variant="destructive" className="h-12 justify-start gap-3 rounded-2xl" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="size-5" /> Delete all data
          </Button>
        </div>
      </Surface>

      <AlertDialog open={pendingImport !== null} onOpenChange={(o) => !o && setPendingImport(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace all data with this backup?</AlertDialogTitle>
            <AlertDialogDescription>Your current data on this device will be overwritten. Export first if you want to keep it.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="ghost" onClick={() => setPendingImport(null)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                try {
                  const res = await importData(pendingImport);
                  toast("Backup imported", { description: `${res.tables.sessions ?? 0} sessions restored.` });
                  setPendingImport(null);
                  router.replace("/");
                } catch (err) {
                  toast.error((err as Error).message);
                  setPendingImport(null);
                }
              }}
            >
              Import
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDelete} onOpenChange={(o) => { setConfirmDelete(o); if (!o) setTyped(""); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete everything?</AlertDialogTitle>
            <AlertDialogDescription>This permanently removes your profile, workouts, progress and settings from this device. Type DELETE to confirm.</AlertDialogDescription>
          </AlertDialogHeader>
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="DELETE" aria-label="Type DELETE to confirm" className="h-11" />
          <AlertDialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={typed !== "DELETE"}
              onClick={async () => {
                await deleteAllData();
                setConfirmDelete(false);
                router.replace("/onboarding");
              }}
            >
              Delete permanently
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

// ---------------------------------------------------------------------------

function EditSheets({ edit, onClose, profile }: { edit: EditKey; onClose: () => void; profile: Profile }) {
  return (
    <>
      {edit === "goals" && <GoalsEditor profile={profile} onClose={onClose} />}
      {edit === "level" && <LevelEditor profile={profile} onClose={onClose} />}
      {edit === "place" && <PlaceEditor profile={profile} onClose={onClose} />}
      {edit === "likes" && <LikesEditor profile={profile} onClose={onClose} />}
      {edit === "barriers" && <BarriersEditor profile={profile} onClose={onClose} />}
      {edit === "cautions" && <CautionEditor profile={profile} onClose={onClose} />}
      {edit === "details" && <DetailsEditor profile={profile} onClose={onClose} />}
      {edit === "readiness" && <ReadinessEditor profile={profile} onClose={onClose} />}
    </>
  );
}

function EditSheet({ title, description, onClose, onSave, children }: { title: string; description?: string; onClose: () => void; onSave: () => Promise<void> | void; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  const close = () => {
    setOpen(false);
    setTimeout(onClose, 250);
  };
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && close()}
      title={title}
      description={description}
      footer={
        <Button
          className="h-12 w-full rounded-2xl text-base"
          onClick={async () => {
            await onSave();
            toast("Saved — plan updated");
            close();
          }}
        >
          Save
        </Button>
      }
    >
      <div className="space-y-6 pb-2">{children}</div>
    </Sheet>
  );
}

function GoalsEditor({ profile, onClose }: { profile: Profile; onClose: () => void }) {
  const [goals, setGoals] = useState<Goal[]>(profile.goals);
  const [days, setDays] = useState(profile.daysPerWeek);
  const [minutes, setMinutes] = useState(profile.sessionMinutes);
  const [time, setTime] = useState<TimeOfDay | "varies">(profile.preferredTime ?? "varies");
  const [weekStart, setWeekStart] = useState(profile.weekStartsOn);
  return (
    <EditSheet title="Goals & schedule" onClose={onClose} onSave={() => updateProfile({ goals: goals.length ? goals : profile.goals, daysPerWeek: days, sessionMinutes: minutes, preferredTime: time, weekStartsOn: weekStart })}>
      <ChoiceGroup ariaLabel="Goals" options={GOALS} value={goals} onChange={setGoals} multiple max={2} layout="list" />
      <div>
        <p className="mb-2 text-sm font-semibold">Days per week</p>
        <Segmented ariaLabel="Days" options={[1, 2, 3, 4, 5, 6].map((n) => ({ value: n, label: String(n) }))} value={days} onChange={setDays} />
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold">Typical session</p>
        <Segmented
          ariaLabel="Minutes"
          options={[
            { value: 5 as const, label: "5 min" },
            { value: 15 as const, label: "15 min" },
            { value: 30 as const, label: "30 min" },
          ]}
          value={minutes}
          onChange={setMinutes}
        />
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold">Best time of day</p>
        <ChoiceGroup ariaLabel="Time" options={TIMES} value={[time]} onChange={(v) => setTime(v[0] ?? "varies")} />
      </div>
      <label className="block">
        <span className="mb-2 block text-sm font-semibold">Week starts on</span>
        <select className="h-11 w-full rounded-xl border bg-background px-3" value={weekStart} onChange={(e) => setWeekStart(Number(e.target.value))}>
          {WEEKDAY_LONG.map((d, i) => (
            <option key={d} value={i}>
              {d}
            </option>
          ))}
        </select>
      </label>
    </EditSheet>
  );
}

function LevelEditor({ profile, onClose }: { profile: Profile; onClose: () => void }) {
  const [a, setA] = useState<ActivityLevel>(profile.activityLevel);
  const [e, setE] = useState<Experience>(profile.experience);
  return (
    <EditSheet title="Starting level" description="Used for exercises you haven't done yet. Logged progress always wins." onClose={onClose} onSave={() => updateProfile({ activityLevel: a, experience: e })}>
      <ChoiceGroup ariaLabel="Activity" options={ACTIVITY_LEVELS} value={[a]} onChange={(v) => v[0] && setA(v[0])} layout="list" />
      <ChoiceGroup ariaLabel="Experience" options={EXPERIENCE} value={[e]} onChange={(v) => v[0] && setE(v[0])} layout="list" />
    </EditSheet>
  );
}

function PlaceEditor({ profile, onClose }: { profile: Profile; onClose: () => void }) {
  const [l, setL] = useState<Location[]>(profile.locations);
  const [eq, setEq] = useState<Equipment[]>(profile.equipment);
  return (
    <EditSheet title="Places & equipment" onClose={onClose} onSave={() => updateProfile({ locations: l.length ? l : ["home"], equipment: eq })}>
      <ChoiceGroup ariaLabel="Locations" options={LOCATIONS} value={l} onChange={setL} multiple />
      <ChoiceGroup ariaLabel="Equipment" options={EQUIPMENT} value={eq} onChange={setEq} multiple />
    </EditSheet>
  );
}

function LikesEditor({ profile, onClose }: { profile: Profile; onClose: () => void }) {
  const [likes, setLikes] = useState<ActivityPreference[]>(profile.likes);
  const [dislikes, setDislikes] = useState<ActivityPreference[]>(profile.dislikes);
  return (
    <EditSheet title="Likes & dislikes" onClose={onClose} onSave={() => updateProfile({ likes, dislikes })}>
      <div>
        <p className="mb-2 text-sm font-semibold">I enjoy</p>
        <ChoiceGroup ariaLabel="Likes" options={LIKES} value={likes} onChange={setLikes} multiple />
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold">I'd rather avoid</p>
        <ChoiceGroup ariaLabel="Dislikes" options={DISLIKES} value={dislikes} onChange={setDislikes} multiple />
      </div>
    </EditSheet>
  );
}

function BarriersEditor({ profile, onClose }: { profile: Profile; onClose: () => void }) {
  const [b, setB] = useState<Barrier[]>(profile.barriers);
  return (
    <EditSheet title="What gets in the way" onClose={onClose} onSave={() => updateProfile({ barriers: b }, new Date(), { replan: false })}>
      <ChoiceGroup ariaLabel="Barriers" options={BARRIERS} value={b} onChange={setB} multiple layout="grid" />
    </EditSheet>
  );
}

function CautionEditor({ profile, onClose }: { profile: Profile; onClose: () => void }) {
  const [c, setC] = useState<BodyArea[]>(profile.cautionAreas);
  return (
    <EditSheet title="Areas to be careful with" description="Past injuries that aren't painful now. High-stress exercises for these areas are left out." onClose={onClose} onSave={() => updateProfile({ cautionAreas: c })}>
      <ChoiceGroup ariaLabel="Areas" options={BODY_AREAS} value={c} onChange={setC} multiple />
    </EditSheet>
  );
}

function DetailsEditor({ profile, onClose }: { profile: Profile; onClose: () => void }) {
  const [units, setUnits] = useState(profile.units);
  const [age, setAge] = useState(profile.ageYears ? String(profile.ageYears) : "");
  const [height, setHeight] = useState(profile.heightCm ? String(units === "imperial" ? Math.round(profile.heightCm / 2.54) : profile.heightCm) : "");
  const [weight, setWeight] = useState(profile.weightKg ? String(units === "imperial" ? Math.round(profile.weightKg * 2.20462) : profile.weightKg) : "");
  const num = (v: string) => (v && Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : undefined);
  return (
    <EditSheet
      title="Body details"
      description="All optional. Clear a field to remove it."
      onClose={onClose}
      onSave={() =>
        updateProfile(
          {
            units,
            ageYears: num(age) ? Math.round(num(age)!) : undefined,
            heightCm: num(height) ? (units === "imperial" ? Math.round(num(height)! * 2.54) : num(height)) : undefined,
            weightKg: num(weight) ? (units === "imperial" ? Math.round(num(weight)! * 0.453592 * 10) / 10 : num(weight)) : undefined,
          },
          new Date(),
          { replan: false },
        )
      }
    >
      <Segmented
        ariaLabel="Units"
        options={[
          { value: "metric" as const, label: "kg · cm" },
          { value: "imperial" as const, label: "lb · in" },
        ]}
        value={units}
        onChange={setUnits}
      />
      <div className="grid grid-cols-3 gap-3 text-sm">
        {(
          [
            ["Age", age, setAge],
            ["Height", height, setHeight],
            ["Weight", weight, setWeight],
          ] as const
        ).map(([l, v, s]) => (
          <label key={l} className="space-y-1.5">
            <span className="font-medium">{l}</span>
            <Input inputMode="decimal" className="h-11 rounded-xl" value={v} onChange={(e) => s(e.target.value.replace(/[^0-9.]/g, ""))} />
          </label>
        ))}
      </div>
    </EditSheet>
  );
}

function ReadinessEditor({ profile, onClose }: { profile: Profile; onClose: () => void }) {
  const [answers, setAnswers] = useState<Record<ReadinessAnswerKey, boolean>>(profile.readiness.answers);
  return (
    <EditSheet title="Health check" description="Answer for how things are now. If anything needs a professional's okay, we'll say so." onClose={onClose} onSave={() => updateReadiness(answers)}>
      <ul className="space-y-3">
        {READINESS_QUESTIONS.map((q) => (
          <li key={q.key} className="rounded-2xl border p-4">
            <p className="text-[15px]">{q.text}</p>
            <div className="mt-3">
              <Segmented
                ariaLabel={q.text}
                options={[
                  { value: "no", label: "No" },
                  { value: "yes", label: "Yes" },
                ]}
                value={answers[q.key] ? "yes" : "no"}
                onChange={(v) => setAnswers((a) => ({ ...a, [q.key]: v === "yes" }))}
              />
            </div>
          </li>
        ))}
      </ul>
    </EditSheet>
  );
}
