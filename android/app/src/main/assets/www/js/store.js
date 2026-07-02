// Pragati — Supabase-backed store. Replaces the old localStorage version: every mutation calls
// a server RPC (see supabase-client.js + the project's SQL migrations) and then refreshes the
// local cache so the UI can keep reading Store.get() synchronously.
const Store = (() => {
  let token = null;
  let state = null;

  async function init(sessionToken) {
    token = sessionToken;
    await refresh();
    return state;
  }

  async function refresh() {
    const raw = await SB.rpc("fn_get_state", { p_token: token });
    state = normalize(raw);
    return state;
  }

  function normalize(raw) {
    const topicsBySubj = {};
    (raw.topics || []).forEach(t => {
      (topicsBySubj[t.subjectId] || (topicsBySubj[t.subjectId] = [])).push({ id: t.id, name: t.name });
    });
    const syllabus = (raw.subjects || []).map(s => ({
      id: s.id, name: s.name, priority: s.priority, stage: s.stage,
      topics: topicsBySubj[s.id] || []
    }));
    const progress = {};
    (raw.progress || []).forEach(p => {
      progress[p.topicId] = { learned: !!p.learned, revise1: !!p.revise1, revise2: !!p.revise2, revise3: !!p.revise3 };
    });
    function isMastered(topicId) {
      const p = progress[topicId];
      return !!(p && p.learned && p.revise1 && p.revise2 && p.revise3);
    }
    const mastery = {};
    (raw.mastery || []).forEach(m => { mastery[m.subjectId] = { correct: m.correct, total: m.total, lastReviewed: m.lastReviewed }; });
    const calendar = {};
    (raw.calendar || []).forEach(c => {
      (calendar[c.date] || (calendar[c.date] = [])).push({ id: c.id, type: c.type, subj: c.subjectId, label: c.label, done: c.done, custom: c.custom });
    });
    const usageLog = {};
    (raw.usageLog || []).forEach(u => { (usageLog[u.date] || (usageLog[u.date] = {}))[u.app] = u.minutes; });
    const stepsLog = {};
    (raw.stepsLog || []).forEach(s => { stepsLog[s.date] = s.steps; });

    const quizPassed = {};
    (raw.quizAttempts || []).forEach(q => {
      if (q.total > 0 && q.correct / q.total >= 0.8) quizPassed[q.subjectId] = true;
    });

    return {
      profile: raw.profile, xp: raw.xp, level: raw.level, points: raw.points, streak: raw.streak,
      syllabus, questions: raw.questions || [], rewards: raw.rewards || [], usageRules: raw.usageRules,
      progress, isMastered, quizPassed, mastery, calendar,
      quizAttempts: raw.quizAttempts || [], usageLog, stepsLog, redemptions: raw.redemptions || []
    };
  }

  function get() { return state; }
  function todayKey(d) { const dt = d || new Date(); return dt.toISOString().slice(0, 10); }
  function currentToken() { return token; }

  async function toggleTopicCheck(topicId, checkName) {
    await SB.rpc("fn_toggle_topic_check", { p_token: token, p_topic_id: topicId, p_check: checkName });
    await refresh();
  }

  function syllabusPercent() {
    let total = 0, done = 0;
    state.syllabus.forEach(s => s.topics.forEach(t => { total++; if (state.isMastered(t.id)) done++; }));
    return total ? Math.round((done / total) * 100) : 0;
  }

  function subjectPercent(subjId) {
    const s = state.syllabus.find(x => x.id === subjId);
    if (!s || s.topics.length === 0) return 0;
    let done = 0;
    s.topics.forEach(t => { if (state.isMastered(t.id)) done++; });
    return Math.round((done / s.topics.length) * 100);
  }

  function masteryScore(subjId) {
    const m = state.mastery[subjId];
    if (!m || m.total === 0) return null;
    return Math.round((m.correct / m.total) * 100);
  }

  function weakStrongList() {
    return state.syllabus.map(s => ({
      id: s.id, name: s.name, priority: s.priority, score: masteryScore(s.id), syllabusPct: subjectPercent(s.id)
    })).sort((a, b) => (a.score === null ? -1 : a.score) - (b.score === null ? -1 : b.score));
  }

  async function recordQuiz(subjId, correct, total, score) {
    await SB.rpc("fn_record_quiz", { p_token: token, p_subject_id: subjId, p_correct: correct, p_total: total, p_score: score });
    await refresh();
  }

  function getDay(dateKey) { return state.calendar[dateKey] || []; }

  async function addCalendarItem(dateKey, item) {
    await SB.rpc("fn_add_calendar_item", { p_token: token, p_date: dateKey, p_type: item.type, p_subject_id: item.subj || null, p_label: item.label });
    await refresh();
  }

  async function bulkAddCalendarItems(items) {
    if (items.length === 0) return;
    await SB.rpc("fn_bulk_add_calendar_items", { p_token: token, p_items: items });
    await refresh();
  }

  async function toggleCalendarItem(itemId) {
    await SB.rpc("fn_toggle_calendar_item", { p_token: token, p_item_id: itemId });
    await refresh();
  }

  async function removeCalendarItem(itemId) {
    await SB.rpc("fn_remove_calendar_item", { p_token: token, p_item_id: itemId });
    await refresh();
  }

  async function logUsageMinutes(appName, minutes, dateKey) {
    await SB.rpc("fn_log_usage", { p_token: token, p_date: dateKey || todayKey(), p_app_name: appName, p_minutes: minutes });
    await refresh();
  }

  async function logSteps(count, dateKey) {
    await SB.rpc("fn_log_steps", { p_token: token, p_date: dateKey || todayKey(), p_steps: count });
    await refresh();
  }

  async function redeemReward(rewardId) {
    const res = await SB.rpc("fn_redeem_reward", { p_token: token, p_reward_id: rewardId });
    await refresh();
    return res;
  }

  async function setProfile(examPre, examMain, hours, onboarded) {
    await SB.rpc("fn_set_profile", { p_token: token, p_exam_pre: examPre, p_exam_main: examMain, p_hours: hours, p_onboarded: onboarded });
    await refresh();
  }

  function examPhase() {
    const t = new Date(); t.setHours(0, 0, 0, 0);
    const pre = state.profile.examDatePrelims ? new Date(state.profile.examDatePrelims) : null;
    const main = state.profile.examDateMains ? new Date(state.profile.examDateMains) : null;
    if (pre && t < pre) return "prelims";
    if (pre && main && t >= pre && t < main) return "gap";
    if (main && t < main) return "mains";
    return "done";
  }

  return {
    init, refresh, get, todayKey, currentToken, normalize,
    toggleTopicCheck, syllabusPercent, subjectPercent, masteryScore, weakStrongList,
    recordQuiz, getDay, addCalendarItem, bulkAddCalendarItems, toggleCalendarItem, removeCalendarItem,
    logUsageMinutes, logSteps, redeemReward, setProfile, examPhase
  };
})();
