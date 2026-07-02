// Pragati — month-grid helper (pure logic, no DOM). app.js renders using this.
const CalendarGrid = (() => {
  const WEEKDAYS = ["S","M","T","W","T","F","S"];

  // Returns a 6x7 array of {dateKey, dayNum, inMonth} cells for the given year/month (0-indexed month).
  function monthCells(year, month) {
    const first = new Date(year, month, 1);
    const startOffset = first.getDay(); // 0=Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const cells = [];
    // leading days from previous month
    for (let i = startOffset - 1; i >= 0; i--) {
      const dayNum = daysInPrevMonth - i;
      const d = new Date(year, month - 1, dayNum);
      cells.push({ dateKey: fmt(d), dayNum, inMonth: false });
    }
    // this month
    for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
      const d = new Date(year, month, dayNum);
      cells.push({ dateKey: fmt(d), dayNum, inMonth: true });
    }
    // trailing days to fill 6 rows (42 cells)
    while (cells.length < 42) {
      const nextIdx = cells.length - (startOffset + daysInMonth) + 1;
      const d = new Date(year, month + 1, nextIdx);
      cells.push({ dateKey: fmt(d), dayNum: d.getDate(), inMonth: false });
    }
    return cells;
  }

  function fmt(d) { return d.toISOString().slice(0, 10); }

  function monthLabel(year, month) {
    return new Date(year, month, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }

  return { monthCells, monthLabel, WEEKDAYS, fmt };
})();
