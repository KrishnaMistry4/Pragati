// Pragati — rule-based planner (no external API). Phase-aware: Prelims prep -> gap -> Mains prep.
// Writes new days to Supabase via Store.bulkAddCalendarItems; never touches days that already
// have items (those may be edited/completed) so "Edit Plan" changes are never clobbered.
const Planner = (() => {

  function parseDate(s) { return s ? new Date(s + "T00:00:00") : null; }

  function daysUntil(dateStr) {
    if (!dateStr) return 30;
    const now = new Date(); now.setHours(0, 0, 0, 0);
    return Math.max(1, Math.round((parseDate(dateStr) - now) / 86400000));
  }

  function subjectWeights(phase) {
    const list = Store.weakStrongList();
    return list.map(s => {
      const weakness = s.score === null ? 70 : (100 - s.score);
      const remaining = 100 - s.syllabusPct;
      let weight = s.priority * (0.6 * weakness / 100 + 0.4 * remaining / 100) + 0.1;
      if ((phase === "gap" || phase === "mains") && (s.id === "gk" || s.id === "apt")) weight *= 0.05;
      return { ...s, weight };
    }).sort((a, b) => b.weight - a.weight);
  }

  // Generates/refreshes a plan for the next `days` days starting today, respecting exam phase.
  // Only writes to dates that have NO existing items yet (so edits/completions are preserved).
  async function generatePlan(days) {
    const state = Store.get();
    const n = days || 30;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const preDate = parseDate(state.profile.examDatePrelims);
    const mainDate = parseDate(state.profile.examDateMains);
    let cursor = 0;
    const toInsert = [];

    for (let d = 0; d < n; d++) {
      const date = new Date(today.getTime() + d * 86400000);
      const key = date.toISOString().slice(0, 10);
      if (state.calendar[key] && state.calendar[key].length > 0) continue; // don't clobber

      let phase = "prelims";
      if (preDate && date >= preDate && (!mainDate || date < mainDate)) phase = "gap";
      if (mainDate && date >= mainDate) phase = "done";
      if (!preDate) phase = "mains";

      const weights = subjectWeights(phase);
      if (weights.length === 0) continue;

      if (phase === "done") {
        toInsert.push({ date: key, type: "custom", label: "Exam day / light revision only" });
      } else if (preDate && key === state.profile.examDatePrelims) {
        toInsert.push({ date: key, type: "custom", label: "🎯 PRELIMS EXAM DAY — stay calm, you've got this" });
      } else if (mainDate && key === state.profile.examDateMains) {
        toInsert.push({ date: key, type: "custom", label: "🎯 MAINS EXAM DAY — stay calm, you've got this" });
      } else {
        const focus = weights[cursor % weights.length];
        const focus2 = weights[(cursor + 1) % weights.length];
        cursor++;
        const style = (phase === "gap" || phase === "mains") ? "case-based (Mains)" : "one-liner (Prelims)";
        toInsert.push({ date: key, type: "study", subj: focus.id, label: "Study: " + focus.name + " — " + style });
        if (focus2 && focus2.id !== focus.id) {
          toInsert.push({ date: key, type: "revise", subj: focus2.id, label: "Revise: " + focus2.name });
        }
        if (d % 3 === 2) {
          toInsert.push({ date: key, type: "quiz", subj: focus.id, label: "Quiz: " + focus.name });
        }
      }
    }
    await Store.bulkAddCalendarItems(toInsert);
  }

  function getDay(dateKey) { return Store.getDay(dateKey); }

  async function regenerateIfStale() { await generatePlan(45); }

  return { generatePlan, getDay, daysUntil, subjectWeights, regenerateIfStale, parseDate };
})();
