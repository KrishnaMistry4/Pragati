const CACHE = "pragati-v4";
const FILES = ["./","./index.html","./css/style.css","./js/data.js","./js/supabase-client.js","./js/auth.js","./js/store.js","./js/planner.js","./js/calendar.js","./js/quiz.js","./js/usage.js","./js/chat.js","./js/app.js","./manifest.json"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))); });
self.addEventListener("fetch", e => {
  // Never cache Supabase API/Edge Function calls — always hit the network so data stays live.
  if (e.request.url.includes("supabase.co")) { e.respondWith(fetch(e.request)); return; }
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
