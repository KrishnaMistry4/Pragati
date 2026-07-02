// Pragati — full timed mock exam (student side). Separate from the quick 5-question Quiz
// module: this handles up to 160 questions, a countdown timer, a question palette for jumping
// around (like a real CBT interface), and server-side scoring with negative marking.
const MockExam = (() => {
  let session = null; // { id, title, examType, durationMin, negMark, questions, answers, deadline }

  async function listExams() {
    return (await SB.rpc("fn_list_mock_exams", { p_token: Store.currentToken() })) || [];
  }

  async function start(examId) {
    const data = await SB.rpc("fn_get_mock_exam", { p_token: Store.currentToken(), p_exam_id: examId });
    session = {
      id: data.id, title: data.title, examType: data.examType,
      durationMin: data.durationMin, negMark: data.negMark,
      questions: data.questions || [],
      answers: new Array((data.questions || []).length).fill(null),
      deadline: Date.now() + data.durationMin * 60 * 1000,
      current: 0
    };
    return session;
  }

  function getSession() { return session; }

  function answer(idx, optIdx) {
    if (!session) return;
    session.answers[idx] = optIdx;
  }

  function timeLeftSec() {
    if (!session) return 0;
    return Math.max(0, Math.round((session.deadline - Date.now()) / 1000));
  }

  async function submit() {
    if (!session) return null;
    const payload = session.questions.map((q, i) => ({ qid: q.id, selected: session.answers[i] }));
    const timeTakenSec = Math.round(session.durationMin * 60 - timeLeftSec());
    const result = await SB.rpc("fn_submit_mock_exam", {
      p_token: Store.currentToken(), p_exam_id: session.id, p_answers: payload, p_time_taken_sec: timeTakenSec
    });
    const finished = { ...result, questions: session.questions, answers: session.answers, title: session.title };
    session = null;
    return finished;
  }

  function abandon() { session = null; }

  return { listExams, start, getSession, answer, timeLeftSec, submit, abandon };
})();
