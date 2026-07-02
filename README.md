# Pragati — v5 (dashboard rebuilt as multiple pages + activity log; A/B bugs fixed)

**Root cause found for both "usage reporting not updating" and "AI key not working":**
admin.html's Save/Log buttons had no error handling at all — if a save failed (e.g. an invalid
Gemini key, which is correctly rejected now), it failed completely silently with zero feedback.
The Gemini key table was confirmed empty in the database — your save attempt genuinely never
went through, and there was no way to know. Every button in the dashboard now shows a clear
success or error message.

**Admin dashboard is now multiple real pages**, not one long scroll: Overview, Calendar,
Syllabus & Questions, Mock Exams, Books, Rewards, Settings, and a new **Activity Log** page that
lists everything you've changed, most recent first, each with an "Edit" button that jumps
straight back to the right page to adjust it.

**Also removed:** the stray "hi" / blank junk topics that had gotten into the syllabus, and
added a 3-character-minimum guard server-side so that can't happen again.

# Pragati — AIIMS NORCET 2026 Study App

Now backed by a real Supabase database — Laado, Meera, and you (admin) each have an exclusive
login, all progress/quizzes/calendar/screen-time syncs live between her phone and your admin
dashboard, and there's a place to upload books and tag quiz questions to them.

## Logins (share only with the right person)

| Who | Username | PIN |
|---|---|---|
| Laado | `laado` | `503369` |
| Meera | `meera` | `552315` |
| Admin (you) | `admin` | `972044` |

Change these PINs whenever you like — ask me, or run an `update` on `app_users.pin_hash` via the
Supabase dashboard using `crypt('newpin', gen_salt('bf'))`.

## 1. `web/index.html` — the student app

Open it (host `web/` for free on GitHub Pages/Netlify/Vercel, or open the file directly) and log
in with a username + PIN above. Everything — checklist, monthly calendar (tap a day to edit),
quizzes, XP/points/streaks, rewards — now reads and writes straight to Supabase, so it's the same
data whether she opens it on her phone or you open it on a laptop.

Exam dates default to **Prelims: 12 Sep 2026**, **Mains: 18 Sep 2026**; the planner shifts from
full-syllabus one-liner prep to nursing-only case-based prep once she crosses the Prelims date.

## 2. `web/admin.html` — your live admin dashboard

Log in with the `admin` account. Pick Laado or Meera from the dropdown at the top to see her
real, live stats: syllabus %, weak/strong topics, XP/points/streak, quiz accuracy, screen-time
usage report, and pending reward redemptions (mark fulfilled once you've delivered the ice
cream). Edit exam dates, screen-time caps, the monthly calendar, syllabus topics, quiz questions,
and rewards — changes show up on her phone the next time the app refreshes (open the app, or
switch tabs and back). No export/import files needed anymore.

### Uploading your book

In admin.html → **Books**: give it a title, choose the file, hit Upload. It lands in a public
Supabase Storage bucket called `books` and gets a `books` table row you can attach questions to.
Then use **Content: add quiz question**, pick the book from the dropdown, and add questions
sourced from it (one at a time for now — tell me if you'd like a bulk-upload flow, e.g. pasting a
block of Q&A text and having it parsed into rows automatically). You can add more books the same
way any time.

## Getting a real, installable APK (for steps + screen-time tracking)

The web app (above) can't read step count or per-app screen time automatically — that needs a
real installed Android app, which is what the `android/` folder is. I can't compile it myself in
this environment (no network access to Android's build servers from here), so here's the free,
no-install-needed way to get an actual `.apk` file you can send to Laado and Meera:

1. Create a free GitHub account/repo if you don't have one, and push this whole `Pragati` folder
   to it (a `.github/workflows/build-apk.yml` file is already included).
2. GitHub's free Actions runner builds the APK automatically on push (takes a few minutes) — or
   trigger it manually from the repo's **Actions** tab → "Build Pragati APK" → **Run workflow**.
3. Once it finishes, open that run and download the **pragati-debug-apk** artifact — unzip it and
   you'll have `app-debug.apk`. **That's the one file to share** — send it to both Laado and
   Meera (WhatsApp, Drive, email, whatever's easiest).
4. On each phone: open the file, allow "install from this source" when Android prompts (one-time
   toggle), install, open the app, and log in with her own username/PIN. Same file works for both
   — the accounts are server-side, not baked into the APK.
5. First launch: grant "Usage Access" when prompted (Settings → Apps → Special access → Usage
   access → Pragati) so screen-time tracking works; step tracking works automatically once the
   sensor permission is granted.

If you'd rather build it yourself instead of using GitHub Actions, opening the `android` folder
in free Android Studio and hitting Run does the same thing.

## 3. `android/` — native wrapper for automatic screen-time + step tracking

Unchanged from before: a native Android Studio project that adds real `UsageStatsManager`
tracking (WhatsApp/Instagram/social minutes) and step-sensor reads on top of the same web app.
Open the `android` folder in free Android Studio, hit Run, grant "Usage Access" on first launch.
I can't compile it from this environment (no Android SDK here), but the code is written and
syntax-checked.

## What changed under the hood

- Postgres tables for users, syllabus, questions/books, progress, mastery, calendar, XP/points
  logs, screen-time logs, steps, rewards, and redemptions — all with Row Level Security **enabled
  and locked down** (no direct table access). Every read/write goes through a small set of
  Postgres functions that check a session token first, so the app only ever holds the public
  anon key, never a master key.
- Login issues a session token (90-day expiry) cached on-device — she won't need to re-enter her
  PIN every time she opens the app.
- Ran Supabase's security advisor after every schema change; no unresolved errors, only expected
  warnings for the RPC functions that are intentionally callable by the app (they each verify the
  token internally before doing anything).
- Book files aren't sensitive study material, so the storage bucket is public-read; who can reach
  the *upload* button is gated by the admin.html password screen rather than a storage-level
  policy, since this app uses its own lightweight PIN system rather than full Supabase Auth. If
  you ever want tighter storage-level enforcement, that's a natural next step (real Supabase Auth
  for the admin account specifically).

## Syllabus checklist — 4-stage revision tracking

Each topic now has 4 taps instead of one: **Learn, Revise 1, Revise 2, Revise 3**. A topic only
counts toward "syllabus % complete" once all 4 are ticked — matches a proper spaced-repetition
study habit rather than a single "read once, done" checkbox. Each tick gives a small XP/points
bump, plus a bonus when a topic hits all 4.

Each subject also shows a 🎯 quiz badge that lights up once she scores 80%+ on that subject's
quiz — a separate signal from the revision checks, so "I've revised this" and "I've proven I know
it" are tracked independently.

In `admin.html`, the topic card now lets you rename or delete any topic per subject (not just add
new ones), so you can keep the syllabus accurate as you add more content from the book.

## AI nursing tutor chatbot

New tab in the student app (💬 Ask AI) — Laado or Meera can ask it to explain any topic, walk
through a calculation, or just talk through something she's stuck on. It knows her name and exam
dates and stays focused on NORCET-relevant nursing content.

**Set it up (one-time, you only):** open `admin.html` → **AI tutor** card → paste a Gemini API
key (free tier, get one at aistudio.google.com/apikey) → Save. That's it — the chatbot goes live
for both accounts immediately.

**Why this is safe:** the key never touches the phone app or the browser. It's stored in the
database behind Row Level Security with zero access policies (not even the app's normal login can
read it), and only a server-side Supabase Edge Function — using a service-role credential that
Supabase manages, never exposed to any client — can read it to call Gemini. The browser only ever
calls that Edge Function with her session token; Gemini's key stays fully server-side.

Conversation history is saved per student (so it persists across devices/sessions) and is private
to each account — the admin dashboard doesn't expose chat transcripts, only that a key is
configured.

