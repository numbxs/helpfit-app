/**
 * Service worker, served from /sw.js with the build version baked in so each
 * deploy installs a fresh app-shell cache.
 *
 * Strategy:
 * - App shell pages are precached on install (HTML + the hashed JS/CSS they reference).
 * - Navigations: network first, falling back to the cached shell (works offline).
 * - Hashed static assets: cache first. Other same-origin GETs: stale-while-revalidate.
 * - RSC payloads and /api: network only (a failed RSC fetch makes Next fall back to a
 *   full navigation, which the cached shell then serves).
 * - Reminders: shows notifications queued by the app in IndexedDB (periodic sync where supported).
 */

export const dynamic = "force-static";

const SHELL_ROUTES = ["/", "/plan", "/mind", "/progress", "/coach", "/profile", "/onboarding", "/workout", "/practice"];

function script(version: string): string {
  return `
const VERSION = ${JSON.stringify(version)};
const SHELL_CACHE = "helpfit-shell-" + VERSION;
const ASSET_CACHE = "helpfit-assets-v1";
const SHELL_ROUTES = ${JSON.stringify(SHELL_ROUTES)};
const EXTRA = ["/manifest.webmanifest", "/icons/icon.svg", "/icons/icon-192.png", "/icons/icon-512.png"];

async function precache() {
  const shell = await caches.open(SHELL_CACHE);
  const assets = await caches.open(ASSET_CACHE);
  const assetUrls = new Set();
  for (const route of SHELL_ROUTES) {
    try {
      const res = await fetch(route, { cache: "no-store", credentials: "same-origin" });
      if (!res.ok) continue;
      const html = await res.clone().text();
      await shell.put(route, res);
      for (const m of html.matchAll(/["'(](\\/_next\\/static\\/[^"')\\s]+)/g)) assetUrls.add(m[1].replace(/\\\\u0026/g, "&"));
    } catch (e) {}
  }
  await Promise.all(EXTRA.map((u) => shell.add(u).catch(() => undefined)));
  await Promise.all([...assetUrls].map(async (u) => {
    if (await assets.match(u)) return;
    try { const r = await fetch(u); if (r.ok) await assets.put(u, r); } catch (e) {}
  }));
}

self.addEventListener("install", (event) => {
  event.waitUntil(precache());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith("helpfit-shell-") && k !== SHELL_CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

function shellKey(url) {
  const p = url.pathname.replace(/\\/$/, "") || "/";
  return SHELL_ROUTES.includes(p) ? p : "/";
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  if (req.headers.get("RSC") === "1" || url.searchParams.has("_rsc")) return;

  if (req.mode === "navigate") {
    event.respondWith((async () => {
      const shell = await caches.open(SHELL_CACHE);
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(req, { signal: controller.signal });
        clearTimeout(timer);
        if (res.ok && SHELL_ROUTES.includes(url.pathname.replace(/\\/$/, "") || "/")) shell.put(shellKey(url), res.clone());
        return res;
      } catch (e) {
        return (await shell.match(shellKey(url))) || (await shell.match("/")) || new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
      }
    })());
    return;
  }

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith((async () => {
      const cache = await caches.open(ASSET_CACHE);
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(SHELL_CACHE);
    const hit = await cache.match(req);
    const network = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => hit);
    return hit || network;
  })());
});

// ---- Reminders queued by the app (IndexedDB "helpfit", store "reminderQueue") ----
function openDb() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open("helpfit");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function showDueReminders() {
  let db;
  try { db = await openDb(); } catch (e) { return; }
  if (!db.objectStoreNames.contains("reminderQueue")) return;
  const items = await new Promise((resolve) => {
    const tx = db.transaction("reminderQueue", "readonly");
    const req = tx.objectStore("reminderQueue").getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => resolve([]);
  });
  const now = Date.now();
  const due = items.filter((r) => !r.shownAt && new Date(r.fireAt).getTime() <= now && now - new Date(r.fireAt).getTime() < 6 * 3600 * 1000);
  for (const r of due) {
    await self.registration.showNotification(r.title, { body: r.body, tag: r.tag, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", data: { url: "/" } });
    await new Promise((resolve) => {
      const tx = db.transaction("reminderQueue", "readwrite");
      tx.objectStore("reminderQueue").put({ ...r, shownAt: new Date().toISOString() });
      tx.oncomplete = resolve;
      tx.onerror = resolve;
    });
  }
}

self.addEventListener("periodicsync", (event) => {
  if (event.tag === "helpfit-reminders") event.waitUntil(showDueReminders());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) { if ("focus" in c) return c.focus(); }
    return self.clients.openWindow("/");
  })());
});
`;
}

export function GET() {
  return new Response(script(process.env.NEXT_PUBLIC_BUILD_VERSION ?? "dev"), {
    headers: { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "no-cache, no-store, must-revalidate" },
  });
}
