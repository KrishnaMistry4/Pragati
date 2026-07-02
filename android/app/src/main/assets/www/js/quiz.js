// Pragati — quiz engine. Submission is recorded server-side (Store.recordQuiz), which updates
// mastery/XP/points. A subject counts as "quiz passed" in the checklist once any attempt on it
// scores >=80% (computed client-side from quizAttempts — see Store.normalize's quizPassed map).
const Quiz = (() => {
  let current = null;

  function buildQuiz(subjId, count, style) {
    const state = Store.get();
    let pool = state.questions.filter(q => q.subj === subjId);
    if (style) pool = pool.filter(q => q.style === style);
    if (pool.length === 0) pool = state.questions.filter(q => q.subj === subjId);
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    const set = shuffled.slice(0, Math.min(count || 5, shuffled.length));
    current = { subjId, questions: set, answers: new Array(set.length).fill(null), startedAt: Date.now() };
    return current;
  }

  function answer(idx, optIdx) {
    if (!current) return;
    current.answers[idx] = optIdx;
  }

  async function submit() {
    if (!current) return null;
    let correct = 0;
    current.questions.forEach((q, i) => { if (current.answers[i] === q.ans) correct++; });
    const total = current.questions.length;
    const negMark = EXAM_PATTERN.prelims.negMark;
    const wrong = current.answers.filter((a, i) => a !== null && a !== current.questions[i].ans).length;
    const score = correct - wrong * negMark;

    await Store.recordQuiz(current.subjId, correct, total, score);

    const result = { subjId: current.subjId, correct, total, score, questions: current.questions, answers: current.answers };
    current = null;
    return result;
  }

  function getCurrent() { return current; }

  return { buildQuiz, answer, submit, getCurrent };
})();
