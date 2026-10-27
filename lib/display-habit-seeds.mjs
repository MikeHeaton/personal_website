export const HISTORICAL_HABIT_RECORDS = Object.freeze({
  "2026-10-23": Object.freeze({ status: "sick" }),
  "2026-10-24": Object.freeze({ status: "sick" }),
  "2026-10-25": Object.freeze({ status: "sick" }),
});

export function historicalHabitRecord(date) {
  return HISTORICAL_HABIT_RECORDS[date] || null;
}
