// Pragati — main UI controller (Supabase-backed)
let activeTab = "home";
let adminTapCount = 0;
let calYear, calMonth;
let busy = false;

function $(sel, root) { return (root || document).querySelector(sel); }
function el(html) { const d = document.createElement("div"); d.innerHTML = html.trim(); return d.firstChild; }

function toast(msg) {
  const t = el(`<div class="toast">${msg}</div>`);
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add("show"));
  setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 250); }, 2200);
}

// wraps an async UI action with a tiny busy-state so double-taps don't fire twice, and
// surfaces network/RPC errors as a toast instead of silently failing.
async function withBusy(fn) {
  if (busy) return;
  busy = true;
  try { await fn(); }
  catch (e) { toast(e.message || "Something went wrong — check your connection."); }
  finally { busy = false; }
}

// ---------------- BOOT / LOGIN ----------------
function boot() {
  const session = Auth.getSession();
  if (session && session.token) {
    document.body.classList.remove("login-mode");
    initShell();
    withBusy(() => runApp(session));
  } else {
    renderLogin();
  }
}

function renderLogin(errorMsg) {
  document.body.classList.add("login-mode");
  const app = $("#app");
  app.innerHTML = "";
  const wrap = el(`
    <div class="login-screen">
      <div class="login-logo">🌱</div>
      <h1>Pragati</h1>
      <p class="muted">NORCET 2026 prep companion</p>
      <div class="card" style="text-align:left; margin-top:20px;">
        <label class="muted">Username</label>
        <input type="text" id="loginUser" placeholder="e.g. laado"/>
        <label class="muted">PIN</label>
        <input type="password" inputmode="numeric" id="loginPin" placeholder="6-digit PIN"/>
        ${errorMsg ? `<div class="weak" style="margin-bottom:8px;">${errorMsg}</div>` : ""}
        <button class="btn block" id="loginGo">Log in</button>
      </div>
      <p class="muted" style="margin-top:16px;">Accounts are set up by your admin — ask them if you don't have your username/PIN.</p>
    </div>
  `);
  app.appendChild(wrap);
  $("#loginGo").addEventListener("click", () => withBusy(doLogin));
  $("#loginPin").addEventListener("keydown", (e) => { if (e.key === "Enter") withBusy(doLogin); });
}

async function doLogin() {
  const u = $("#loginUser").value.trim();
  const p = $("#loginPin").value.trim();
  if (!u || !p) return toast("Enter username and PIN");
  const res = await Auth.login(u, p);
  if (!res.ok) return renderLogin(res.msg);
  document.body.classList.remove("login-mode");
  initShell();
  await runApp(res.session);
}

function initShell() {
  const app = $("#app");
  app.innerHTML = `
    <header class="topbar">
      <div class="brand" id="brandLogo">🌱 Pragati</div>
      <div class="hud">
        <span id="hudLevel" class="pill">Lv 1</span>
        <span id="hudXP" class="pill">0 XP</span>
        <span id="hudPoints" class="pill pts">0 pts</span>
        <button id="accountBtn" class="avatar-btn" title="Account">👤</button>
      </div>
    </header>
    <main id="screen"></main>
    <nav class="tabbar">
      <button data-tab="home">🏠<span>Home</span></button>
      <button data-tab="checklist">✅<span>Syllabus</span></button>
      <button data-tab="calendar">📅<span>Plan</span></button>
      <button data-tab="quiz">📝<span>Quiz</span></button>
      <button data-tab="stats">📊<span>Stats</span></button>
      <button data-tab="rewards">🎁<span>Rewards</span></button>
      <button data-tab="chat">💬<span>Ask AI</span></button>
    </nav>
  `;
}

async function runApp(session) {
  await Store.init(session.token);
  const state = Store.get();

  if (!state.profile.onboarded) {
    showOnboarding();
  } else if (Object.keys(state.calendar).length === 0) {
    await Planner.generatePlan(45);
  }

  await UsageBridge.syncFromNative();
  await UsageBridge.syncStepsFromNative();

  document.querySelectorAll(".tabbar button").forEach(btn => {
    btn.addEventListener("click", () => {
      activeTab = btn.dataset.tab;
      render(); // instant switch using cached data
      backgroundRefresh(); // then quietly pull anything the admin changed and re-render
    });
  });
  $("#brandLogo").addEventListener("click", () => {
    adminTapCount++;
    if (adminTapCount >= 5) { adminTapCount = 0; openAdminGate(); }
    setTimeout(() => adminTapCount = 0, 2000);
  });
  $("#accountBtn").addEventListener("click", showAccountMenu);

  const now = new Date();
  calYear = now.getFullYear(); calMonth = now.getMonth();

  render();
  startSyncWatchers();
}

// ---------------- KEEPING IN SYNC WITH ADMIN CHANGES ----------------
// The app caches state in memory for instant rendering, but that means anything the admin edits
// (exam dates, new questions/topics/rewards, calendar edits) wouldn't show up on her phone until
// she happened to do something that triggers a refresh. These watchers close that gap:
// re-check the server periodically, whenever she switches tabs, and whenever the app/tab
// regains focus (phone unlock, switching back from another app).
let syncInterval = null;

async function backgroundRefresh() {
  try {
    await Store.refresh();
    render();
  } catch (e) { /* stay on cached data if the network hiccups; don't interrupt her with an error */ }
}

function startSyncWatchers() {
  if (syncInterval) clearInterval(syncInterval);
  syncInterval = setInterval(backgroundRefresh, 45000); // every 45s while the app is open

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") backgroundRefresh();
  });
  window.addEventListener("focus", backgroundRefresh);
}

function showAccountMenu() {
  const session = Auth.getSession();
  const modal = el(`
    <div class="modal-backdrop"><div class="modal">
      <button class="close-x" id="closeAcc">✕</button>
      <h2>${session ? session.displayName : "Account"}</h2>
      <button class="btn secondary block" id="switchAcc">Log out</button>
    </div></div>
  `);
  document.body.appendChild(modal);
  $("#closeAcc", modal).addEventListener("click", () => modal.remove());
  $("#switchAcc", modal).addEventListener("click", () => {
    Auth.logout();
    Chat.reset();
    chatHistoryLoaded = false;
    if (syncInterval) { clearInterval(syncInterval); syncInterval = null; }
    modal.remove();
    renderLogin();
  });
}

// ---------------- RENDER ROOT ----------------
function render() {
  const state = Store.get();
  $("#hudLevel").textContent = "Lv " + state.level;
  $("#hudXP").textContent = state.xp + " XP";
  $("#hudPoints").textContent = state.points + " pts";
  document.querySelectorAll(".tabbar button").forEach(b => b.classList.toggle("active", b.dataset.tab === activeTab));

  const screen = $("#screen");
  screen.innerHTML = "";
  if (activeTab === "home") screen.appendChild(renderHome());
  if (activeTab === "checklist") screen.appendChild(renderChecklist());
  if (activeTab === "calendar") screen.appendChild(renderCalendarTab());
  if (activeTab === "quiz") screen.appendChild(renderQuizHome());
  if (activeTab === "stats") screen.appendChild(renderStats());
  if (activeTab === "rewards") screen.appendChild(renderRewards());
  if (activeTab === "chat") screen.appendChild(renderChat());
}

// ---------------- HOME ----------------
function renderHome() {
  const state = Store.get();
  const pct = Store.syllabusPercent();
  const phase = Store.examPhase();
  const phaseLabel = { prelims: "Prelims prep", gap: "Post-Prelims → Mains prep", mains: "Mains prep", done: "Exams complete" }[phase];
  const nextExamDate = phase === "prelims" ? state.profile.examDatePrelims : state.profile.examDateMains;
  const days = Planner.daysUntil(nextExamDate);
  const todayKey = Store.todayKey();
  const todayItems = Planner.getDay(todayKey);

  const wrap = el(`<div></div>`);
  wrap.appendChild(el(`
    <div class="card">
      <div class="row"><h2>Overall syllabus</h2><span>${pct}%</span></div>
      <div class="progressbar"><div style="width:${pct}%"></div></div>
      <div class="muted">${phaseLabel} · ${days} days to ${phase === "prelims" ? "Prelims" : "Mains"} (${nextExamDate || "not set"})</div>
    </div>
  `));

  wrap.appendChild(el(`
    <div class="card">
      <div class="row"><h2>Today's plan</h2><span class="streak-flame">🔥 ${state.streak}</span></div>
      <div id="todayItemsHost"></div>
    </div>
  `));
  const host = wrap.querySelector("#todayItemsHost");
  if (todayItems.length === 0) host.appendChild(el(`<div class="muted">No plan yet — open the Plan tab.</div>`));
  todayItems.forEach(item => host.appendChild(renderDayItemRow(item)));

  wrap.appendChild(el(`
    <div class="card">
      <h2>Quick actions</h2>
      <button class="btn block" id="btnEditToday">Edit today's plan</button>
      <button class="btn secondary block" id="btnQuickQuiz">Take a quick quiz</button>
    </div>
  `));

  setTimeout(() => {
    $("#btnEditToday")?.addEventListener("click", () => openDayEditor(todayKey));
    $("#btnQuickQuiz")?.addEventListener("click", () => { activeTab = "quiz"; render(); });
  });
  return wrap;
}

function renderDayItemRow(item) {
  const icon = item.type === "quiz" ? "📝" : item.type === "revise" ? "🔁" : item.type === "study" ? "📖" : "✨";
  const row = el(`
    <label class="day-item ${item.done ? 'done' : ''}">
      <input type="checkbox" ${item.done ? "checked" : ""}/>
      <span>${icon} ${item.label}</span>
    </label>
  `);
  row.querySelector("input").addEventListener("change", () => withBusy(async () => {
    await Store.toggleCalendarItem(item.id);
    render();
  }));
  return row;
}

// ---------------- CHECKLIST ----------------
const CHECK_DEFS = [
  { key: "learned", label: "Learn", icon: "\ud83d\udcd8" },
  { key: "revise1", label: "Revise 1", icon: "\ud83d\udd01" },
  { key: "revise2", label: "Revise 2", icon: "\ud83d\udd01" },
  { key: "revise3", label: "Revise 3", icon: "\ud83d\udd01" }
];

function renderChecklist() {
  const state = Store.get();
  const wrap = el(`<div><div class="card"><h2>Syllabus checklist</h2><div class="muted">Each topic has 4 checks: Learn, then 3 revision passes. A topic only counts as mastered once all 4 are ticked. The \u2605 quiz badge lights up once you score 80%+ on that subject's quiz.</div></div></div>`);
  state.syllabus.forEach(s => {
    const pct = Store.subjectPercent(s.id);
    const passed = !!state.quizPassed[s.id];
    const box = el(`
      <div class="subject-item">
        <div class="row">
          <b>${s.name}</b>
          <span>${"\u2605".repeat(s.priority)}<span class="tag">${s.stage}</span><span class="quiz-badge ${passed ? 'passed' : ''}" title="Quiz passed (80%+)">\ud83c\udfaf</span></span>
        </div>
        <div class="progressbar"><div style="width:${pct}%"></div></div>
        <div class="muted">${pct}% fully mastered${passed ? ' \u00b7 quiz passed' : ''}</div>
      </div>
    `);
    const list = el(`<div style="margin:6px 0 4px 4px;"></div>`);
    s.topics.forEach(t => {
      const p = state.progress[t.id] || { learned: false, revise1: false, revise2: false, revise3: false };
      const mastered = p.learned && p.revise1 && p.revise2 && p.revise3;
      const row = el(`
        <div class="topic-row-multi ${mastered ? 'mastered' : ''}">
          <div class="topic-name">${t.name}</div>
          <div class="topic-checks"></div>
        </div>
      `);
      const checksHost = row.querySelector(".topic-checks");
      CHECK_DEFS.forEach(def => {
        const btn = el(`<button class="check-pill ${p[def.key] ? 'on' : ''}" title="${def.label}">${def.icon}</button>`);
        btn.addEventListener("click", () => withBusy(async () => {
          await Store.toggleTopicCheck(t.id, def.key);
          render();
        }));
        checksHost.appendChild(btn);
      });
      list.appendChild(row);
    });
    box.appendChild(list);
    wrap.appendChild(box);
  });
  return wrap;
}

// ---------------- CALENDAR (monthly grid + edit) ----------------
function renderCalendarTab() {
  const state = Store.get();
  const wrap = el(`
    <div>
      <div class="card cal-card">
        <div class="cal-header">
          <button class="icon-btn" id="calPrev">‹</button>
          <h2 id="calLabel"></h2>
          <button class="icon-btn" id="calNext">›</button>
        </div>
        <div class="cal-weekdays"></div>
        <div class="cal-grid" id="calGrid"></div>
        <div class="cal-legend">
          <span><i class="dot study"></i> Study</span>
          <span><i class="dot revise"></i> Revise</span>
          <span><i class="dot quiz"></i> Quiz</span>
          <span><i class="dot exam"></i> Exam day</span>
        </div>
      </div>
      <button class="btn block" id="btnRegen">Fill in missing days</button>
    </div>
  `);

  const weekdaysHost = wrap.querySelector(".cal-weekdays");
  CalendarGrid.WEEKDAYS.forEach(w => weekdaysHost.appendChild(el(`<div>${w}</div>`)));

  function draw() {
    $("#calLabel", wrap).textContent = CalendarGrid.monthLabel(calYear, calMonth);
    const grid = $("#calGrid", wrap);
    grid.innerHTML = "";
    const cells = CalendarGrid.monthCells(calYear, calMonth);
    const today = CalendarGrid.fmt(new Date());
    cells.forEach(c => {
      const items = Store.getDay(c.dateKey);
      const isExamDay = c.dateKey === state.profile.examDatePrelims || c.dateKey === state.profile.examDateMains;
      const cell = el(`
        <button class="cal-cell ${c.inMonth ? '' : 'out'} ${c.dateKey === today ? 'today' : ''} ${isExamDay ? 'exam-day' : ''}">
          <span class="cal-daynum">${c.dayNum}</span>
          <span class="cal-dots"></span>
        </button>
      `);
      const dots = cell.querySelector(".cal-dots");
      const types = new Set(items.map(i => i.type));
      if (isExamDay) dots.appendChild(el(`<i class="dot exam"></i>`));
      else {
        if (types.has("study")) dots.appendChild(el(`<i class="dot study"></i>`));
        if (types.has("revise")) dots.appendChild(el(`<i class="dot revise"></i>`));
        if (types.has("quiz")) dots.appendChild(el(`<i class="dot quiz"></i>`));
      }
      cell.addEventListener("click", () => openDayEditor(c.dateKey));
      grid.appendChild(cell);
    });
  }
  draw();

  $("#calPrev", wrap).addEventListener("click", () => { calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; } draw(); });
  $("#calNext", wrap).addEventListener("click", () => { calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; } draw(); });
  $("#btnRegen", wrap).addEventListener("click", () => withBusy(async () => {
    await Planner.generatePlan(45);
    draw();
    toast("Plan filled in");
  }));

  return wrap;
}

function openDayEditor(dateKey) {
  const state = Store.get();
  const modal = el(`
    <div class="modal-backdrop"><div class="modal">
      <button class="close-x" id="closeDay">✕</button>
      <h2>${dateKey}</h2>
      <div id="dayItemsHost"></div>
      <h3 style="margin-top:14px;">Add a task</h3>
      <select id="newItemType">
        <option value="study">Study</option>
        <option value="revise">Revise</option>
        <option value="quiz">Quiz</option>
        <option value="custom">Custom / note</option>
      </select>
      <select id="newItemSubj">
        ${state.syllabus.map(s => `<option value="${s.id}">${s.name}</option>`).join("")}
      </select>
      <input type="text" id="newItemLabel" placeholder="Task label (optional, auto-filled from subject)"/>
      <button class="btn block" id="addDayItem">Add task</button>
    </div></div>
  `);
  document.body.appendChild(modal);

  function refresh() {
    const host = $("#dayItemsHost", modal);
    host.innerHTML = "";
    const items = Store.getDay(dateKey);
    if (items.length === 0) host.appendChild(el(`<div class="muted">Nothing planned yet.</div>`));
    items.forEach(item => {
      const row = el(`
        <div class="edit-item-row">
          <label class="day-item ${item.done ? 'done' : ''}">
            <input type="checkbox" ${item.done ? "checked" : ""}/>
            <span>${item.type === "quiz" ? "📝" : item.type === "revise" ? "🔁" : item.type === "study" ? "📖" : "✨"} ${item.label}</span>
          </label>
          <div class="edit-item-actions">
            ${item.type === "quiz" && item.subj ? `<button class="btn small" data-act="startquiz">Start</button>` : ""}
            <button class="btn small secondary" data-act="del">Delete</button>
          </div>
        </div>
      `);
      row.querySelector("input").addEventListener("change", () => withBusy(async () => { await Store.toggleCalendarItem(item.id); refresh(); render(); }));
      row.querySelectorAll("button[data-act]").forEach(b => {
        b.addEventListener("click", () => {
          if (b.dataset.act === "del") withBusy(async () => { await Store.removeCalendarItem(item.id); refresh(); render(); });
          if (b.dataset.act === "startquiz") { modal.remove(); startQuiz(item.subj, "prelims"); }
        });
      });
      host.appendChild(row);
    });
  }
  refresh();

  $("#closeDay", modal).addEventListener("click", () => { modal.remove(); render(); });
  $("#addDayItem", modal).addEventListener("click", () => withBusy(async () => {
    const type = $("#newItemType", modal).value;
    const subjId = $("#newItemSubj", modal).value;
    const subj = state.syllabus.find(s => s.id === subjId);
    let label = $("#newItemLabel", modal).value.trim();
    if (!label) label = type === "custom" ? "Custom task" : (type[0].toUpperCase() + type.slice(1)) + ": " + (subj ? subj.name : "");
    await Store.addCalendarItem(dateKey, { type, subj: type === "custom" ? undefined : subjId, label });
    $("#newItemLabel", modal).value = "";
    refresh();
  }));
}

// ---------------- QUIZ ----------------
function renderQuizHome() {
  const state = Store.get();
  const wrap = el(`<div></div>`);

  const mockCard = el(`<div class="card"><h2>Full mock exams</h2><div id="mockExamListHost" class="muted">Loading...</div></div>`);
  wrap.appendChild(mockCard);
  loadMockExamList(mockCard.querySelector("#mockExamListHost"));

  wrap.appendChild(el(`<div class="card"><h2>Choose a subject (quick 5-question quiz)</h2></div>`));
  state.syllabus.forEach(s => {
    const score = Store.masteryScore(s.id);
    const item = el(`
      <div class="subject-item">
        <div class="row"><b>${s.name}</b><span>${score === null ? '<span class="muted">not attempted</span>' : score + '%'}</span></div>
        <div class="grid2">
          <button class="btn small" data-mode="prelims">Prelims style</button>
          <button class="btn small secondary" data-mode="mains">Mains (case)</button>
        </div>
      </div>
    `);
    item.querySelectorAll("button").forEach(b => b.addEventListener("click", () => startQuiz(s.id, b.dataset.mode)));
    wrap.appendChild(item);
  });
  return wrap;
}

async function loadMockExamList(host) {
  let exams;
  try { exams = await MockExam.listExams(); }
  catch (e) { host.innerHTML = `<div class="weak">Couldn't load mock exams.</div>`; return; }
  if (!exams || exams.length === 0) { host.innerHTML = `Your admin hasn't added a full mock exam yet.`; return; }
  host.innerHTML = "";
  exams.forEach(e => {
    const row = el(`
      <div class="subject-item">
        <div class="row"><b>${e.title}</b><span class="tag">${e.examType}</span></div>
        <div class="muted">${e.questionCount} questions \u00b7 ${e.durationMin} min \u00b7 -1/3 negative marking</div>
        <div class="muted">${e.bestScore !== null ? "Best score: " + Number(e.bestScore).toFixed(2) + " (" + e.attempts + " attempt" + (e.attempts===1?"":"s") + ")" : "Not attempted yet"}</div>
        <button class="btn small block" data-id="${e.id}">Start exam</button>
      </div>
    `);
    row.querySelector("button").addEventListener("click", () => confirmStartMockExam(e));
    host.appendChild(row);
  });
}

function confirmStartMockExam(exam) {
  const modal = el(`
    <div class="modal-backdrop"><div class="modal">
      <h2>${exam.title}</h2>
      <p class="muted">${exam.questionCount} questions, ${exam.durationMin} minutes, -1/3 mark per wrong answer \u2014 just like the real exam. Once you start, the timer won't stop. Ready?</p>
      <button class="btn block" id="mockGo">Start exam</button>
      <button class="btn secondary block" id="mockCancel">Not yet</button>
    </div></div>
  `);
  document.body.appendChild(modal);
  $("#mockCancel", modal).addEventListener("click", () => modal.remove());
  $("#mockGo", modal).addEventListener("click", () => withBusy(async () => {
    await MockExam.start(exam.id);
    modal.remove();
    if (syncInterval) { clearInterval(syncInterval); syncInterval = null; } // don't let background refresh interrupt an active exam
    renderMockExamPlay(0);
  }));
}

function startQuiz(subjId, mode) {
  const q = Quiz.buildQuiz(subjId, 5, mode);
  if (!q.questions.length) { toast("No questions for this subject yet — ask your admin to add some."); return; }
  renderQuizPlay(0);
}

function renderQuizPlay(idx) {
  const q = Quiz.getCurrent();
  if (!q) { activeTab = "quiz"; render(); return; }
  const screen = $("#screen");
  screen.innerHTML = "";
  const question = q.questions[idx];
  const wrap = el(`
    <div class="card">
      <div class="muted">Question ${idx+1} / ${q.questions.length}</div>
      <h2>${question.q}</h2>
      <div id="opts"></div>
    </div>
  `);
  const opts = wrap.querySelector("#opts");
  question.opts.forEach((o, oi) => {
    const b = el(`<button class="quiz-opt">${o}</button>`);
    b.addEventListener("click", () => {
      Quiz.answer(idx, oi);
      opts.querySelectorAll(".quiz-opt").forEach(x => x.classList.remove("selected"));
      b.classList.add("selected");
      setTimeout(() => {
        if (idx + 1 < q.questions.length) renderQuizPlay(idx + 1);
        else withBusy(finishQuiz);
      }, 250);
    });
    opts.appendChild(b);
  });
  screen.appendChild(wrap);
}

async function finishQuiz() {
  const result = await Quiz.submit();
  const screen = $("#screen");
  screen.innerHTML = "";
  const pct = result.total ? Math.round((result.correct/result.total)*100) : 0;
  const wrap = el(`
    <div class="card">
      <h2>Quiz complete 🎉</h2>
      <div class="row"><span>Score</span><span>${result.correct}/${result.total} (${pct}%)</span></div>
      <div class="row"><span>Net score (with negative marking)</span><span>${result.score.toFixed(2)}</span></div>
      <button class="btn block" id="btnBack">Back to quizzes</button>
    </div>
  `);
  const reviewCard = el(`<div class="card"><h3>Review</h3></div>`);
  result.questions.forEach((q, i) => {
    const yourAns = result.answers[i];
    const correct = yourAns === q.ans;
    reviewCard.appendChild(el(`
      <div style="margin-bottom:10px;">
        <div style="font-weight:600;">${i+1}. ${q.q}</div>
        <div class="${correct ? 'strong' : 'weak'}">Your answer: ${yourAns === null ? '—' : q.opts[yourAns]} ${correct ? '✓' : '✗'}</div>
        ${!correct ? `<div class="strong">Correct: ${q.opts[q.ans]}</div>` : ""}
        <div class="muted">${q.exp || ""}</div>
      </div>
    `));
  });
  screen.appendChild(wrap);
  screen.appendChild(reviewCard);
  $("#btnBack").addEventListener("click", () => { activeTab = "quiz"; render(); });
}

// ---------------- MOCK EXAM: timed full exam with question palette ----------------
let mockExamTimerId = null;

function stopMockExamTimer() {
  if (mockExamTimerId) { clearInterval(mockExamTimerId); mockExamTimerId = null; }
}

function fmtClock(sec) {
  const m = Math.floor(sec / 60), s2 = sec % 60;
  return String(m).padStart(2, "0") + ":" + String(s2).padStart(2, "0");
}

function renderMockExamPlay(idx) {
  const session = MockExam.getSession();
  if (!session) { activeTab = "quiz"; render(); return; }
  session.current = idx;

  const screen = $("#screen");
  screen.innerHTML = "";
  const q = session.questions[idx];

  const wrap = el(`
    <div>
      <div class="card mockexam-header">
        <div class="row"><b>${session.title}</b><span id="mockTimer" class="pill pts"></span></div>
        <div class="muted">Question ${idx + 1} / ${session.questions.length}</div>
      </div>
      <div class="card">
        <h2>${q.q}</h2>
        <div id="mockOpts"></div>
        <div class="grid2" style="margin-top:10px;">
          <button class="btn secondary" id="mockPrev" ${idx === 0 ? "disabled style='opacity:.4'" : ""}>\u2039 Prev</button>
          <button class="btn secondary" id="mockNext" ${idx === session.questions.length - 1 ? "disabled style='opacity:.4'" : ""}>Next \u203a</button>
        </div>
      </div>
      <div class="card">
        <h3>Jump to question</h3>
        <div class="mock-palette" id="mockPalette"></div>
      </div>
      <button class="btn block" id="mockSubmit" style="background:var(--bad);">Submit exam</button>
    </div>
  `);

  const optsHost = wrap.querySelector("#mockOpts");
  q.opts.forEach((o, oi) => {
    const b = el(`<button class="quiz-opt ${session.answers[idx] === oi ? "selected" : ""}">${o}</button>`);
    b.addEventListener("click", () => {
      MockExam.answer(idx, oi);
      optsHost.querySelectorAll(".quiz-opt").forEach(x => x.classList.remove("selected"));
      b.classList.add("selected");
      drawPalette(wrap, idx);
    });
    optsHost.appendChild(b);
  });

  wrap.querySelector("#mockPrev")?.addEventListener("click", () => { stopMockExamTimer(); renderMockExamPlay(idx - 1); });
  wrap.querySelector("#mockNext")?.addEventListener("click", () => { stopMockExamTimer(); renderMockExamPlay(idx + 1); });
  wrap.querySelector("#mockSubmit").addEventListener("click", () => confirmSubmitMockExam());

  drawPalette(wrap, idx);
  screen.appendChild(wrap);

  stopMockExamTimer();
  updateMockTimerDisplay();
  mockExamTimerId = setInterval(() => {
    const left = MockExam.timeLeftSec();
    updateMockTimerDisplay();
    if (left <= 0) { stopMockExamTimer(); toast("Time's up — submitting automatically."); withBusy(submitMockExam); }
  }, 1000);
}

function updateMockTimerDisplay() {
  const el2 = $("#mockTimer");
  if (el2) el2.textContent = "\u23f1 " + fmtClock(MockExam.timeLeftSec());
}

function drawPalette(wrap, currentIdx) {
  const session = MockExam.getSession();
  const host = wrap.querySelector("#mockPalette");
  host.innerHTML = "";
  session.questions.forEach((q, i) => {
    const answered = session.answers[i] !== null;
    const btn = el(`<button class="palette-btn ${answered ? "answered" : ""} ${i === currentIdx ? "current" : ""}">${i + 1}</button>`);
    btn.addEventListener("click", () => { stopMockExamTimer(); renderMockExamPlay(i); });
    host.appendChild(btn);
  });
}

function confirmSubmitMockExam() {
  const session = MockExam.getSession();
  const unanswered = session.answers.filter(a => a === null).length;
  const modal = el(`
    <div class="modal-backdrop"><div class="modal">
      <h2>Submit exam?</h2>
      <p class="muted">${unanswered > 0 ? unanswered + " question(s) still unanswered. " : ""}This locks in your answers and can't be undone.</p>
      <button class="btn block" id="subYes" style="background:var(--bad);">Yes, submit</button>
      <button class="btn secondary block" id="subNo">Keep going</button>
    </div></div>
  `);
  document.body.appendChild(modal);
  $("#subNo", modal).addEventListener("click", () => modal.remove());
  $("#subYes", modal).addEventListener("click", () => { modal.remove(); withBusy(submitMockExam); });
}

async function submitMockExam() {
  stopMockExamTimer();
  const result = await MockExam.submit();
  await Store.refresh();
  startSyncWatchers(); // resume background sync now that the exam is over
  renderMockExamResult(result);
}

function renderMockExamResult(result) {
  const screen = $("#screen");
  screen.innerHTML = "";
  const pct = result.total ? Math.round((result.correct / result.total) * 100) : 0;
  const wrap = el(`
    <div class="card">
      <h2>${result.title} \u2014 complete \ud83c\udf89</h2>
      <div class="row"><span>Correct</span><span>${result.correct} / ${result.total} (${pct}%)</span></div>
      <div class="row"><span>Wrong</span><span>${result.wrong}</span></div>
      <div class="row"><span>Net score (with negative marking)</span><span>${Number(result.score).toFixed(2)}</span></div>
      <button class="btn block" id="mockBack">Back to Quiz tab</button>
    </div>
  `);
  const reviewCard = el(`<div class="card"><h3>Review</h3></div>`);
  result.questions.forEach((q, i) => {
    const yourAns = result.answers[i];
    const correct = yourAns === q.ans;
    reviewCard.appendChild(el(`
      <div style="margin-bottom:10px;">
        <div style="font-weight:600;">${i + 1}. ${q.q}</div>
        <div class="${correct ? "strong" : "weak"}">Your answer: ${yourAns === null || yourAns === undefined ? "\u2014 (skipped)" : q.opts[yourAns]} ${yourAns === null || yourAns === undefined ? "" : (correct ? "\u2713" : "\u2717")}</div>
        ${!correct ? `<div class="strong">Correct: ${q.opts[q.ans]}</div>` : ""}
        <div class="muted">${q.exp || ""}</div>
      </div>
    `));
  });
  screen.appendChild(wrap);
  screen.appendChild(reviewCard);
  $("#mockBack").addEventListener("click", () => { activeTab = "quiz"; render(); });
}

// ---------------- STATS ----------------
function renderStats() {
  const state = Store.get();
  const ws = Store.weakStrongList();
  const wrap = el(`
    <div>
      <div class="card">
        <h2>Weak / strong topics</h2>
        ${ws.map(s => `<div class="row"><span>${s.name}</span><span class="${s.score===null?'muted':s.score<50?'weak':s.score<75?'mid':'strong'}">${s.score===null?'—':s.score+'%'}</span></div>`).join("")}
      </div>
      <div class="card">
        <h2>Activity</h2>
        <div class="row"><span>Level</span><span>${state.level}</span></div>
        <div class="row"><span>XP</span><span>${state.xp}</span></div>
        <div class="row"><span>Points</span><span>${state.points}</span></div>
        <div class="row"><span>Streak</span><span>🔥 ${state.streak} days</span></div>
        <div class="row"><span>Steps today</span><span>${state.stepsLog[Store.todayKey()] || 0}</span></div>
      </div>
      <div class="card">
        <h2>Log today's steps</h2>
        <input type="number" id="stepsInput" placeholder="e.g. 4200" value="${state.stepsLog[Store.todayKey()]||''}"/>
        <button class="btn block" id="btnSteps">Save steps</button>
      </div>
    </div>
  `);
  setTimeout(() => {
    $("#btnSteps").addEventListener("click", () => withBusy(async () => {
      const v = parseInt($("#stepsInput").value || "0", 10);
      await Store.logSteps(v, Store.todayKey());
      render();
    }));
  });
  return wrap;
}

// ---------------- REWARDS ----------------
function renderRewards() {
  const state = Store.get();
  const wrap = el(`<div><div class="card"><h2>Your points: ${state.points}</h2></div></div>`);
  state.rewards.forEach(r => {
    const card = el(`
      <div class="reward-card">
        <div><b>${r.name}</b><div class="muted">${r.cost} pts</div></div>
        <button class="btn small" ${state.points < r.cost ? 'disabled style="opacity:.4"' : ''}>Redeem</button>
      </div>
    `);
    card.querySelector("button").addEventListener("click", () => withBusy(async () => {
      const res = await Store.redeemReward(r.id);
      toast(res.ok ? "Redeemed! Ask your admin to fulfill it." : res.msg);
      render();
    }));
    wrap.appendChild(card);
  });
  return wrap;
}

// ---------------- CHAT (AI nursing tutor) ----------------
let chatHistoryLoaded = false;

function renderChat() {
  const wrap = el(`
    <div class="chat-wrap">
      <div class="card" style="margin-bottom:10px;">
        <h2>Ask your AI nursing tutor</h2>
        <div class="muted">Explains any topic, works through examples, and answers exam questions. Not a substitute for real clinical guidance.</div>
      </div>
      <div id="chatLog" class="chat-log"></div>
      <div class="chat-input-row">
        <input type="text" id="chatInput" placeholder="Ask about any topic..." />
        <button class="btn" id="chatSend">Send</button>
      </div>
    </div>
  `);

  const log = wrap.querySelector("#chatLog");

  function drawMessages() {
    log.innerHTML = "";
    const msgs = Chat.getMessages();
    if (msgs.length === 0) log.appendChild(el(`<div class="muted" style="text-align:center; margin-top:20px;">Ask me to explain any nursing topic, walk through a calculation, or quiz you verbally.</div>`));
    msgs.forEach(m => log.appendChild(el(`<div class="chat-bubble ${m.role}">${escapeHtml(m.content).replace(/\n/g, "<br>")}</div>`)));
    log.scrollTop = log.scrollHeight;
  }

  async function ensureHistory() {
    if (chatHistoryLoaded) { drawMessages(); return; }
    await Chat.loadHistory(Store.currentToken());
    chatHistoryLoaded = true;
    drawMessages();
  }
  ensureHistory();

  async function doSend() {
    const input = $("#chatInput", wrap);
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    drawMessages();
    log.appendChild(el(`<div class="chat-bubble user">${escapeHtml(text)}</div>`));
    log.appendChild(el(`<div class="chat-bubble assistant typing" id="typingBubble">···</div>`));
    log.scrollTop = log.scrollHeight;
    await withBusy(async () => {
      await Chat.send(Store.currentToken(), text);
      drawMessages();
    });
  }

  $("#chatSend", wrap).addEventListener("click", doSend);
  $("#chatInput", wrap).addEventListener("keydown", (e) => { if (e.key === "Enter") doSend(); });

  return wrap;
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
}

// ---------------- ONBOARDING ----------------
function showOnboarding() {
  const state = Store.get();
  const modal = el(`
    <div class="modal-backdrop"><div class="modal">
      <h2>Welcome to Pragati 🌱</h2>
      <p class="muted">NORCET 2026 dates are pre-filled — adjust if needed.</p>
      <label class="muted">Prelims exam date</label>
      <input type="date" id="obExamPre" value="${state.profile.examDatePrelims||''}"/>
      <label class="muted">Mains exam date</label>
      <input type="date" id="obExamMain" value="${state.profile.examDateMains||''}"/>
      <label class="muted">Hours you can study per day</label>
      <input type="number" id="obHours" value="${state.profile.hoursPerDay||2}"/>
      <button class="btn block" id="obDone">Start</button>
    </div></div>
  `);
  document.body.appendChild(modal);
  $("#obDone", modal).addEventListener("click", () => withBusy(async () => {
    const pre = $("#obExamPre", modal).value || state.profile.examDatePrelims;
    const main = $("#obExamMain", modal).value || state.profile.examDateMains;
    const hours = parseFloat($("#obHours", modal).value) || 2;
    await Store.setProfile(pre, main, hours, true);
    await Planner.generatePlan(45);
    modal.remove();
    render();
  }));
}

// ---------------- ADMIN (quick note — full dashboard is admin.html) ----------------
function openAdminGate() {
  const modal = el(`
    <div class="modal-backdrop"><div class="modal">
      <h2>Admin</h2>
      <p class="muted">Full statistics, content management, and the calendar editor for both students live in <b>admin.html</b> on a computer — log in there with the admin account.</p>
      <button class="btn block" id="closeGate2">Got it</button>
    </div></div>
  `);
  document.body.appendChild(modal);
  $("#closeGate2", modal).addEventListener("click", () => modal.remove());
}

window.addEventListener("DOMContentLoaded", boot);
