// Pragati Admin Dashboard (admin.html) — live, multi-page, connects directly to Supabase.
let calYear, calMonth, selectedDay = null;
let students = [];
let currentStudentId = null;
let currentState = null;
let currentPage = "overview";

function $(sel, root) { return (root || document).querySelector(sel); }
function el(html) { const d = document.createElement("div"); d.innerHTML = html.trim(); return d.firstChild; }

function toast(msg, isError) {
  const t = el(`<div class="toast" style="${isError ? "background:#5c2b2b;" : ""}">${msg}</div>`);
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add("show"));
  setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 250); }, isError ? 4000 : 2200);
}

// Every button handler goes through this so a failed save (validation error, network hiccup,
// permission issue) always shows something instead of silently doing nothing — this was the
// actual bug behind "saved the AI key / logged usage but nothing happened."
function onClick(id, fn) {
  const node = $("#" + id);
  if (!node) { console.warn("admin-dashboard: missing #" + id); return; }
  node.addEventListener("click", async () => {
    node.disabled = true;
    try { await fn(); }
    catch (e) { toast(e.message || "Something went wrong.", true); }
    finally { node.disabled = false; }
  });
}

function boot() {
  onClick("gateGo", doLogin);
  $("#gatePw").addEventListener("keydown", (e) => { if (e.key === "Enter") doLogin(); });
}

async function doLogin() {
  const u = $("#gateUser").value.trim();
  const p = $("#gatePw").value.trim();
  const res = await Auth.login(u, p);
  if (!res.ok) { $("#gateError").textContent = res.msg; return; }
  if (res.session.role !== "admin") { $("#gateError").textContent = "This account isn't an admin account."; return; }
  Admin.setToken(res.session.token);
  $("#gate").style.display = "none";
  $("#dash").style.display = "block";
  await initDash();
}

// ---------------- PAGE NAVIGATION ----------------
function goToPage(page) {
  currentPage = page;
  document.querySelectorAll(".admin-page").forEach(p => p.classList.toggle("active", p.id === "page-" + page));
  document.querySelectorAll(".admin-nav-btn").forEach(b => b.classList.toggle("active", b.dataset.page === page));
  if (page === "activity") refreshActivityLog();
  if (page === "calendar") drawCalendar();
}

// ---------------- local calcs (operate on the loaded student's state) ----------------
function subjPct(state, subjId) {
  const s = state.syllabus.find(x => x.id === subjId);
  if (!s || s.topics.length === 0) return 0;
  let done = 0; s.topics.forEach(t => { if (state.progress.has(t.id)) done++; });
  return Math.round((done / s.topics.length) * 100);
}
function syllabusPct(state) {
  let total = 0, done = 0;
  state.syllabus.forEach(s => s.topics.forEach(t => { total++; if (state.progress.has(t.id)) done++; }));
  return total ? Math.round((done / total) * 100) : 0;
}
function masteryScoreOf(state, subjId) {
  const m = state.mastery[subjId];
  if (!m || m.total === 0) return null;
  return Math.round((m.correct / m.total) * 100);
}
function weakStrong(state) {
  return state.syllabus.map(s => ({ id: s.id, name: s.name, score: masteryScoreOf(state, s.id) }))
    .sort((a, b) => (a.score === null ? -1 : a.score) - (b.score === null ? -1 : b.score));
}
function examPhaseOf(state) {
  const t = new Date(); t.setHours(0,0,0,0);
  const pre = state.profile.examDatePrelims ? new Date(state.profile.examDatePrelims) : null;
  const main = state.profile.examDateMains ? new Date(state.profile.examDateMains) : null;
  if (pre && t < pre) return "prelims";
  if (pre && main && t >= pre && t < main) return "gap";
  if (main && t < main) return "mains";
  return "done";
}

async function initDash() {
  const now = new Date();
  calYear = now.getFullYear(); calMonth = now.getMonth();

  document.querySelectorAll(".admin-nav-btn").forEach(btn => {
    btn.addEventListener("click", () => goToPage(btn.dataset.page));
  });
  goToPage("overview");

  students = await Admin.listStudents();
  const picker = $("#studentPicker");
  picker.innerHTML = students.map(s => `<option value="${s.id}">${s.displayName}</option>`).join("");
  picker.addEventListener("change", () => { withStudentReload(() => loadStudent(picker.value)); });

  CalendarGrid.WEEKDAYS.forEach(w => $(".cal-weekdays").appendChild(el(`<div>${w}</div>`)));
  $("#calPrev").addEventListener("click", () => { calMonth--; if (calMonth<0){calMonth=11;calYear--;} drawCalendar(); });
  $("#calNext").addEventListener("click", () => { calMonth++; if (calMonth>11){calMonth=0;calYear++;} drawCalendar(); });

  onClick("admSetExam", async () => {
    await Admin.setExamDates(currentStudentId, $("#admExamPre").value, $("#admExamMain").value);
    await loadStudent(currentStudentId, true);
    toast("Exam dates updated.");
  });

  onClick("admSetRules", async () => {
    await Admin.updateUsageRules({
      whatsappCapMin: +$("#ruleWA").value, instagramCapMin: +$("#ruleIG").value,
      totalSocialCapMin: +$("#ruleTotal").value, pointsPerExtraMin: +$("#rulePts").value
    });
    toast("Screen-time rules saved — applies to all students.");
  });

  onClick("admLogUsage", async () => {
    const date = $("#logDate").value || new Date().toISOString().slice(0,10);
    const wa = +$("#logWA").value || 0, ig = +$("#logIG").value || 0;
    if (!wa && !ig) throw new Error("Enter minutes for at least one app.");
    if (wa) await Admin.logUsage(currentStudentId, date, "WhatsApp", wa);
    if (ig) await Admin.logUsage(currentStudentId, date, "Instagram", ig);
    await loadStudent(currentStudentId, true);
    toast("Usage logged.");
  });

  onClick("admAddTopic", async () => {
    const name = $("#addTopicName").value.trim();
    if (name.length < 3) throw new Error("Topic name must be at least 3 characters.");
    await Admin.addTopic($("#addTopicSubj").value, name);
    $("#addTopicName").value = "";
    await loadStudent(currentStudentId, true);
    renderTopicList();
    toast("Topic added.");
  });

  $("#addTopicSubj").addEventListener("change", renderTopicList);

  onClick("admAddQuestion", async () => {
    const opts = [$("#qOpt0").value, $("#qOpt1").value, $("#qOpt2").value, $("#qOpt3").value];
    if (opts.some(o => !o.trim()) || !$("#qText").value.trim()) throw new Error("Fill all 4 options and the question text.");
    await Admin.addQuestion({
      subj: $("#qSubj").value, bookId: $("#qBook").value || null, style: $("#qStyle").value,
      q: $("#qText").value.trim(), opts, ans: +$("#qAns").value || 0, exp: $("#qExp").value.trim()
    });
    ["qText","qOpt0","qOpt1","qOpt2","qOpt3","qAns","qExp"].forEach(id => $("#"+id).value = "");
    toast("Question added.");
  });

  onClick("admAddBook", async () => {
    const title = $("#newBookTitle").value.trim();
    const file = $("#newBookFile").files[0];
    if (!title) throw new Error("Give the book a title.");
    let path = null;
    if (file) path = await SB.uploadFile("books", Date.now() + "-" + file.name, file);
    await Admin.addBook(title, path, null);
    $("#newBookTitle").value = ""; $("#newBookFile").value = "";
    await refreshBooks();
    toast("Book added.");
  });

  onClick("admAddReward", async () => {
    const name = $("#newRewardName").value.trim();
    const cost = +$("#newRewardCost").value || 0;
    if (!name || cost <= 0) throw new Error("Give the reward a name and a positive point cost.");
    await Admin.addReward(name, cost);
    $("#newRewardName").value = ""; $("#newRewardCost").value = "";
    await loadStudent(currentStudentId, true);
    toast("Reward added.");
  });

  onClick("admSaveGeminiKey", async () => {
    const key = $("#geminiKeyInput").value.trim();
    if (!key) throw new Error("Paste a key first.");
    await Admin.setSecret("gemini_api_key", key);
    $("#geminiKeyInput").value = "";
    await refreshAiStatus();
    toast("Gemini key saved — the AI tutor is live.");
  });

  onClick("mockExamParse", handleMockExamParse);

  onClick("addDayItem", async () => {
    if (!selectedDay) return;
    const type = $("#newItemType").value;
    const subjId = $("#newItemSubj").value;
    const subj = currentState.syllabus.find(s => s.id === subjId);
    let label = $("#newItemLabel").value.trim();
    if (!label) label = type === "custom" ? "Custom task" : (type[0].toUpperCase()+type.slice(1)) + ": " + (subj ? subj.name : "");
    await Admin.addCalendarItem(currentStudentId, selectedDay, type, type === "custom" ? null : subjId, label);
    $("#newItemLabel").value = "";
    await loadStudent(currentStudentId, true);
    openDayEditor(selectedDay);
  });

  await refreshAiStatus();
  await refreshBooks();
  await refreshMockExamList();
  if (students.length) { picker.value = students[0].id; await loadStudent(students[0].id); }
  renderTopicList();

  setInterval(async () => {
    if (currentStudentId) { await loadStudent(currentStudentId, true); }
  }, 30000);
}

async function withStudentReload(fn) {
  try { await fn(); } catch (e) { toast(e.message || "Couldn't load that student.", true); }
}

async function refreshMockExamList() {
  try {
    const exams = await Admin.listMockExams();
    $("#mockExamList").innerHTML = exams.map(e => `
      <div class="stat-row">
        <span>${e.title} <span class="tag">${e.exam_type}</span> <span class="muted">${e.question_count}Q / ${e.duration_min}min</span></span>
        <button class="btn small secondary" data-id="${e.id}">Delete</button>
      </div>
    `).join("") || `<div class="muted">No mock exams yet.</div>`;
    $("#mockExamList").querySelectorAll("button[data-id]").forEach(b => {
      b.addEventListener("click", async () => {
        if (!confirm("Delete this mock exam? Any attempts on it will be deleted too.")) return;
        try { await Admin.deleteMockExam(b.dataset.id); await refreshMockExamList(); toast("Deleted."); }
        catch (e) { toast(e.message, true); }
      });
    });
  } catch (e) { toast("Couldn't load mock exams.", true); }
}

// ---------------- MOCK EXAM PARSE ----------------
let parsedMockExam = null;

function parseExamText(text) {
  text = text.replace(/\r\n/g, "\n");
  const blocks = text.split(/\n(?=\s*\d+[.)]\s)/).map(b => b.trim()).filter(Boolean);
  const questions = [];
  for (const block of blocks) {
    const lines = block.split("\n").map(l => l.trim()).filter(Boolean);
    if (lines.length < 5) continue;
    let qText = lines[0].replace(/^\s*\d+[.)]\s*/, "");
    const opts = ["", "", "", ""];
    let ansIdx = null, exp = "";
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const optMatch = line.match(/^([A-Da-d])[.)]\s*(.+)$/);
      const ansMatch = line.match(/^Answer\s*[:\-]?\s*([A-Da-d])/i);
      const expMatch = line.match(/^Explanation\s*[:\-]?\s*(.+)$/i);
      if (optMatch) {
        const idx = optMatch[1].toUpperCase().charCodeAt(0) - 65;
        opts[idx] = optMatch[2].trim();
      } else if (ansMatch) {
        ansIdx = ansMatch[1].toUpperCase().charCodeAt(0) - 65;
      } else if (expMatch) {
        exp = expMatch[1].trim();
      } else if (i === 1) {
        qText += " " + line;
      }
    }
    if (qText && opts.every(o => o) && ansIdx !== null) {
      questions.push({ q: qText, opts, ans: ansIdx, exp });
    }
  }
  const lower = text.toLowerCase();
  let detectedType;
  if (/\bmains?\b/.test(lower) && !/\bprelim/.test(lower)) detectedType = "mains";
  else if (/\bprelim/.test(lower)) detectedType = "prelims";
  else detectedType = questions.length > 100 ? "mains" : "prelims";
  return { questions, detectedType };
}

async function handleMockExamParse() {
  const file = $("#mockExamFile").files[0];
  if (!file) throw new Error("Choose a .docx file first.");
  if (typeof mammoth === "undefined") throw new Error("Doc parser didn't load — check your internet connection and refresh.");
  const buf = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buf });
  parsedMockExam = parseExamText(result.value);
  renderMockExamPreview();
}

function renderMockExamPreview() {
  const host = $("#mockExamPreview");
  if (!parsedMockExam || parsedMockExam.questions.length === 0) {
    host.innerHTML = `<div class="weak">No questions parsed — check the doc matches the format above.</div>`;
    return;
  }
  const { questions, detectedType } = parsedMockExam;
  host.innerHTML = `
    <div class="stat-row"><span>Parsed questions</span><b>${questions.length}</b></div>
    <label class="muted">Exam type (auto-detected, override if wrong)</label>
    <select id="mockExamTypeOverride">
      <option value="prelims" ${detectedType === "prelims" ? "selected" : ""}>Prelims (100Q / 90 min)</option>
      <option value="mains" ${detectedType === "mains" ? "selected" : ""}>Mains (160Q / 180 min)</option>
    </select>
    <div class="muted" style="margin:8px 0;">First question: "${questions[0].q.slice(0, 80)}${questions[0].q.length > 80 ? "…" : ""}"</div>
    <button class="btn small" id="mockExamCreate">Create mock exam from these ${questions.length} questions</button>
  `;
  $("#mockExamCreate").addEventListener("click", async () => {
    try {
      const title = $("#mockExamTitle").value.trim() || "Untitled Mock Exam";
      const type = $("#mockExamTypeOverride").value;
      await Admin.createMockExam(title, type, parsedMockExam.questions);
      parsedMockExam = null;
      $("#mockExamTitle").value = "";
      $("#mockExamFile").value = "";
      host.innerHTML = "";
      await refreshMockExamList();
      toast("Mock exam created — it's now live in her app's Quiz tab.");
    } catch (e) { toast(e.message, true); }
  });
}

async function refreshBooks() {
  try {
    const books = await Admin.listBooks();
    $("#bookList").innerHTML = books.map(b => `<div class="stat-row"><span>${b.title}</span>${b.storage_path ? `<a href="${b.storage_path}" target="_blank" class="muted">file</a>` : '<span class="muted">no file yet</span>'}</div>`).join("") || "No books yet.";
    $("#qBook").innerHTML = `<option value="">(no book)</option>` + books.map(b => `<option value="${b.id}">${b.title}</option>`).join("");
  } catch (e) { toast("Couldn't load books.", true); }
}

async function refreshAiStatus() {
  try {
    const status = await Admin.secretStatus();
    $("#aiKeyStatus").innerHTML = status.geminiKeySet
      ? `<span class="strong">✓ Gemini key is set — the chatbot is live.</span>`
      : `<span class="weak">Not set yet — the chatbot will tell students to ask you until you add a key.</span>`;
  } catch (e) { toast("Couldn't check AI status.", true); }
}

async function refreshActivityLog() {
  const host = $("#activityLogHost");
  host.innerHTML = `<div class="muted">Loading…</div>`;
  try {
    const log = await SB.rpc("fn_admin_recent_activity", { p_token: Admin.currentToken(), p_limit: 40 });
    if (!log || log.length === 0) { host.innerHTML = `<div class="muted">No changes yet.</div>`; return; }
    host.innerHTML = log.map(item => `
      <div class="activity-row">
        <div>
          <div class="activity-text">${item.summary}${item.studentName ? ` <span class="tag">${item.studentName}</span>` : ""}</div>
          <div class="activity-time">${new Date(item.createdAt).toLocaleString()}</div>
        </div>
        ${item.targetPage ? `<button class="btn small secondary" data-page="${item.targetPage}">Edit</button>` : ""}
      </div>
    `).join("");
    host.querySelectorAll("button[data-page]").forEach(b => b.addEventListener("click", () => goToPage(b.dataset.page)));
  } catch (e) { host.innerHTML = `<div class="weak">Couldn't load activity log.</div>`; }
}

async function loadStudent(id, keepCalendarView) {
  currentStudentId = id;
  currentState = await Admin.getStudent(id);
  render();
  if (!keepCalendarView) drawCalendar();
}

function render() {
  const state = currentState;
  const s = students.find(x => x.id === currentStudentId);

  $("#profileCard").innerHTML = `<h2>${state.profile.name || (s ? s.displayName : "Student")}</h2><div class="muted">Live data from Supabase.</div>`;
  $("#admExamPre").value = state.profile.examDatePrelims || "";
  $("#admExamMain").value = state.profile.examDateMains || "";
  $("#ruleWA").value = state.usageRules.whatsappCapMin;
  $("#ruleIG").value = state.usageRules.instagramCapMin;
  $("#ruleTotal").value = state.usageRules.totalSocialCapMin;
  $("#rulePts").value = state.usageRules.pointsPerExtraMin;
  $("#logDate").value = new Date().toISOString().slice(0,10);

  const subjOptions = state.syllabus.map(sub => `<option value="${sub.id}">${sub.name}</option>`).join("");
  $("#addTopicSubj").innerHTML = subjOptions;
  $("#qSubj").innerHTML = subjOptions;
  $("#newItemSubj").innerHTML = subjOptions;

  const quizAttempts = state.quizAttempts.length;
  const avgScore = quizAttempts ? Math.round(state.quizAttempts.reduce((a,q)=>a+(q.correct/q.total),0)/quizAttempts*100) : 0;
  $("#overview").innerHTML = `
    <div class="stat-row"><span>Syllabus complete</span><b>${syllabusPct(state)}%</b></div>
    <div class="stat-row"><span>Level / XP</span><b>${state.level} / ${state.xp}</b></div>
    <div class="stat-row"><span>Points balance</span><b>${state.points}</b></div>
    <div class="stat-row"><span>Streak</span><b>🔥 ${state.streak} days</b></div>
    <div class="stat-row"><span>Quiz attempts</span><b>${quizAttempts}</b></div>
    <div class="stat-row"><span>Avg quiz accuracy</span><b>${avgScore}%</b></div>
    <div class="stat-row"><span>Steps today</span><b>${state.stepsLog[new Date().toISOString().slice(0,10)] || 0}</b></div>
    <div class="stat-row"><span>Exam phase</span><b>${examPhaseOf(state)}</b></div>
  `;

  $("#weakStrong").innerHTML = weakStrong(state).map(x =>
    `<div class="stat-row"><span>${x.name}</span><b class="${x.score===null?'muted':x.score<50?'weak':x.score<75?'mid':'strong'}">${x.score===null?'—':x.score+'%'}</b></div>`
  ).join("");

  const usageDays = {};
  Object.entries(state.usageLog).forEach(([date, apps]) => { usageDays[date] = apps; });
  $("#usageReport").innerHTML = Object.keys(usageDays).sort().reverse().slice(0,14).map(date => {
    const apps = usageDays[date];
    const total = Object.values(apps).reduce((a,b)=>Number(a)+Number(b),0);
    return `<div class="usage-day"><b>${date}</b> — ${Object.entries(apps).map(([a,m])=>a+" "+m+"m").join(", ")} <span class="muted">(total ${total}m)</span></div>`;
  }).join("") || "No usage logged yet.";

  $("#redemptionList").innerHTML = state.redemptions.map(r => {
    const reward = state.rewards.find(x=>x.id===r.rewardId);
    return `<div class="stat-row"><span>${reward?reward.name:'?'} (${r.status})</span>${r.status==='pending'?`<button class="btn small" data-id="${r.id}">Mark fulfilled</button>`:''}</div>`;
  }).join("") || "None yet.";
  $("#redemptionList").querySelectorAll("button").forEach(b => b.addEventListener("click", async () => {
    try { await Admin.fulfillRedemption(b.dataset.id); await loadStudent(currentStudentId, true); toast("Marked fulfilled."); }
    catch (e) { toast(e.message, true); }
  }));

  $("#rewardListAdmin").innerHTML = state.rewards.map(r => `<div class="stat-row"><span>${r.name}</span><b>${r.cost} pts</b></div>`).join("");

  renderTopicList();
}

function drawCalendar() {
  if (!currentState) return;
  const state = currentState;
  $("#calLabel").textContent = CalendarGrid.monthLabel(calYear, calMonth);
  const grid = $("#calGrid");
  grid.innerHTML = "";
  const cells = CalendarGrid.monthCells(calYear, calMonth);
  const today = CalendarGrid.fmt(new Date());
  cells.forEach(c => {
    const items = state.calendar[c.dateKey] || [];
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

function openDayEditor(dateKey) {
  selectedDay = dateKey;
  $("#dayEditorCard").style.display = "block";
  $("#dayEditorTitle").textContent = dateKey;
  const host = $("#dayItemsHost");
  host.innerHTML = "";
  const items = currentState.calendar[dateKey] || [];
  if (items.length === 0) host.appendChild(el(`<div class="muted">Nothing planned yet.</div>`));
  items.forEach(item => {
    const row = el(`
      <div class="edit-item-row">
        <label class="day-item ${item.done ? 'done' : ''}">
          <input type="checkbox" ${item.done ? "checked" : ""}/>
          <span>${item.label}</span>
        </label>
        <div class="edit-item-actions"><button class="btn small secondary" data-act="del">Delete</button></div>
      </div>
    `);
    row.querySelector("input").addEventListener("change", async () => { try { await Admin.toggleCalendarItem(item.id); await loadStudent(currentStudentId, true); openDayEditor(dateKey); } catch(e){ toast(e.message,true); } });
    row.querySelector("[data-act=del]").addEventListener("click", async () => { try { await Admin.removeCalendarItem(item.id); await loadStudent(currentStudentId, true); openDayEditor(dateKey); drawCalendar(); } catch(e){ toast(e.message,true); } });
    host.appendChild(row);
  });
}

function renderTopicList() {
  if (!currentState) return;
  const subjId = $("#addTopicSubj").value;
  const subj = currentState.syllabus.find(s => s.id === subjId);
  const host = $("#topicListForSubj");
  host.innerHTML = "";
  if (!subj || subj.topics.length === 0) { host.appendChild(el(`<div class="muted">No topics yet.</div>`)); return; }
  subj.topics.forEach(t => {
    const row = el(`
      <div class="stat-row">
        <input type="text" value="${t.name.replace(/"/g,'&quot;')}" style="margin:0; padding:6px; font-size:13px;"/>
        <div style="display:flex; gap:4px; flex-shrink:0;">
          <button class="btn small secondary" data-act="save">Save</button>
          <button class="btn small secondary" data-act="del">Delete</button>
        </div>
      </div>
    `);
    row.querySelector('[data-act=save]').addEventListener("click", async () => {
      try {
        const newName = row.querySelector("input").value.trim();
        if (newName.length < 3) throw new Error("Topic name must be at least 3 characters.");
        await Admin.renameTopic(t.id, newName);
        await loadStudent(currentStudentId, true);
        renderTopicList();
        toast("Topic renamed.");
      } catch (e) { toast(e.message, true); }
    });
    row.querySelector('[data-act=del]').addEventListener("click", async () => {
      if (!confirm(`Delete topic "${t.name}"? This also removes any checklist progress on it.`)) return;
      try { await Admin.removeTopic(t.id); await loadStudent(currentStudentId, true); renderTopicList(); toast("Topic deleted."); }
      catch (e) { toast(e.message, true); }
    });
    host.appendChild(row);
  });
}

window.addEventListener("DOMContentLoaded", boot);
