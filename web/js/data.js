// Pragati — static exam-pattern constants only. Syllabus, questions, rewards, and usage rules
// now live in Supabase (seeded via migrations) and are fetched through Store/SB at runtime.
const EXAM_PATTERN = {
  prelims: { questions: 100, marks: 100, duration: 90, sections: 5, negMark: 1/3 },
  mains: { questions: 160, marks: 160, duration: 180, sections: 4, negMark: 1/3 }
};
