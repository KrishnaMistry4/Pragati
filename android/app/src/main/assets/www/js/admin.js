// Pragati — admin RPC wrapper. Every call requires the admin's session token (from Auth.login
// with the admin account) and is re-checked server-side by _require_admin() in each function.
const Admin = (() => {
  let token = null;

  function setToken(t) { token = t; }
  function currentToken() { return token; }

  async function listStudents() {
    return await SB.rpc("fn_admin_list_students", { p_token: token });
  }

  async function getStudent(studentId) {
    const raw = await SB.rpc("fn_admin_get_student", { p_token: token, p_student_id: studentId });
    return Store.normalize(raw);
  }

  async function setExamDates(studentId, pre, main) {
    await SB.rpc("fn_admin_set_exam_dates", { p_token: token, p_student_id: studentId, p_pre: pre, p_main: main });
  }

  async function updateUsageRules(rules) {
    await SB.rpc("fn_admin_update_usage_rules", { p_token: token, p_wa: rules.whatsappCapMin, p_ig: rules.instagramCapMin, p_total: rules.totalSocialCapMin, p_pts: rules.pointsPerExtraMin });
  }

  async function logUsage(studentId, date, appName, minutes) {
    await SB.rpc("fn_admin_log_usage", { p_token: token, p_student_id: studentId, p_date: date, p_app: appName, p_minutes: minutes });
  }

  async function addTopic(subjectId, name) {
    return await SB.rpc("fn_admin_add_topic", { p_token: token, p_subject_id: subjectId, p_name: name });
  }

  async function renameTopic(topicId, name) {
    await SB.rpc("fn_admin_rename_topic", { p_token: token, p_topic_id: topicId, p_name: name });
  }

  async function removeTopic(topicId) {
    await SB.rpc("fn_admin_remove_topic", { p_token: token, p_topic_id: topicId });
  }

  async function addQuestion(q) {
    return await SB.rpc("fn_admin_add_question", {
      p_token: token, p_subject_id: q.subj, p_book_id: q.bookId || null, p_style: q.style,
      p_question: q.q, p_options: q.opts, p_answer_index: q.ans, p_explanation: q.exp
    });
  }

  async function addBook(title, storagePath, notes) {
    return await SB.rpc("fn_admin_add_book", { p_token: token, p_title: title, p_storage_path: storagePath, p_notes: notes });
  }

  async function addReward(title, cost) {
    return await SB.rpc("fn_admin_add_reward", { p_token: token, p_title: title, p_cost: cost });
  }

  async function fulfillRedemption(redemptionId) {
    await SB.rpc("fn_admin_fulfill_redemption", { p_token: token, p_redemption_id: redemptionId });
  }

  async function addCalendarItem(studentId, date, type, subjectId, label) {
    return await SB.rpc("fn_admin_add_calendar_item", { p_token: token, p_student_id: studentId, p_date: date, p_type: type, p_subject_id: subjectId, p_label: label });
  }

  async function toggleCalendarItem(itemId) {
    await SB.rpc("fn_admin_toggle_calendar_item", { p_token: token, p_item_id: itemId });
  }

  async function removeCalendarItem(itemId) {
    await SB.rpc("fn_admin_remove_calendar_item", { p_token: token, p_item_id: itemId });
  }

  async function usageReport(studentId) {
    return await SB.rpc("fn_admin_usage_report", { p_token: token, p_student_id: studentId });
  }

  async function listBooks() {
    return await SB.select("books", "select=*&order=uploaded_at.desc");
  }

  async function setSecret(keyName, value) {
    await SB.rpc("fn_admin_set_secret", { p_token: token, p_key_name: keyName, p_value: value });
  }

  async function secretStatus() {
    return await SB.rpc("fn_admin_secret_status", { p_token: token });
  }

  async function listMockExams() {
    return await SB.select("mock_exams", "select=*&order=created_at.desc");
  }

  async function createMockExam(title, examType, questions) {
    return await SB.rpc("fn_admin_create_mock_exam", { p_token: token, p_title: title, p_exam_type: examType, p_book_id: null, p_questions: questions });
  }

  async function deleteMockExam(examId) {
    await SB.rpc("fn_admin_delete_mock_exam", { p_token: token, p_exam_id: examId });
  }

  return {
    setToken, currentToken, listStudents, getStudent, setExamDates, updateUsageRules, logUsage,
    addTopic, renameTopic, removeTopic, addQuestion, addBook, addReward, fulfillRedemption,
    addCalendarItem, toggleCalendarItem, removeCalendarItem, usageReport, listBooks,
    setSecret, secretStatus, listMockExams, createMockExam, deleteMockExam
  };
})();
