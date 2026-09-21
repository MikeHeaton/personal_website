const TIME_ZONE = "America/Los_Angeles";
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const REQUEST_TIMEOUT_MS = 5000;
const MAX_RESPONSE_BYTES = 32 * 1024;

export const HABITS = Object.freeze([
  Object.freeze({ key: "dogTeeth", label: "Brush dog teeth" }),
  Object.freeze({ key: "bed", label: "Make bed" }),
  Object.freeze({ key: "strengthProtein", label: "Strength and protein" }),
  Object.freeze({ key: "strengthRun", label: "Strength and run" }),
]);

function dateParts(value) {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(value).map(({ type, value: part }) => [type, part]),
  );
}

export function localDateKey(now = Date.now()) {
  const parts = dateParts(new Date(now));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function shiftDate(dateKey, days) {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function habitDateWindow(now = Date.now()) {
  const today = localDateKey(now);
  return Array.from({ length: 7 }, (_, index) => shiftDate(today, index - 7));
}

export function validLocalDate(value) {
  if (!DATE_PATTERN.test(value || "")) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

export function validateHabitRecord(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  if (!validLocalDate(input.date) || !input.habits || typeof input.habits !== "object" || Array.isArray(input.habits)) return null;
  const keys = Object.keys(input.habits).sort();
  const expected = HABITS.map(({ key }) => key).sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) return null;
  if (expected.some((key) => typeof input.habits[key] !== "boolean")) return null;
  return {
    date: input.date,
    habits: Object.fromEntries(HABITS.map(({ key }) => [key, input.habits[key]])),
  };
}

function storedRecord(value) {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    if (HABITS.some(({ key }) => typeof parsed[key] !== "boolean")) return null;
    return Object.fromEntries(HABITS.map(({ key }) => [key, parsed[key]]));
  } catch {
    return null;
  }
}

export function emptyHabitSnapshot(now = Date.now()) {
  const dates = habitDateWindow(now);
  return { dates, records: Object.fromEntries(dates.map((date) => [date, null])) };
}

export async function loadHabitSnapshot(store, now = Date.now()) {
  const dates = habitDateWindow(now);
  const values = await store.readDates(dates);
  return {
    dates,
    records: Object.fromEntries(dates.map((date) => [date, storedRecord(values?.[date])])),
  };
}

function storageKey(date) {
  return `display:habits:${date}`;
}

async function command(url, token, fetchImpl, parts) {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(parts),
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const body = await response.text();
  if (body.length > MAX_RESPONSE_BYTES) throw new Error("Habit storage response too large");
  if (!response.ok) throw new Error(`Habit storage request failed (${response.status})`);
  let payload;
  try { payload = JSON.parse(body); } catch { throw new Error("Habit storage returned invalid JSON"); }
  if (payload.error) throw new Error("Habit storage command failed");
  return payload.result;
}

export function createHabitStore(env = process.env, fetchImpl = globalThis.fetch) {
  const rawUrl = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  let url;
  try { url = new URL(rawUrl); } catch { return null; }
  if (url.protocol !== "https:" || !token || typeof fetchImpl !== "function") return null;
  const endpoint = url.toString().replace(/\/$/, "");
  return {
    provider: "upstash-redis-rest",
    async readDates(dates) {
      const result = await command(endpoint, token, fetchImpl, ["MGET", ...dates.map(storageKey)]);
      if (!Array.isArray(result) || result.length !== dates.length) throw new Error("Habit storage returned an invalid result");
      return Object.fromEntries(dates.map((date, index) => [date, result[index]]));
    },
    async write(record) {
      await command(endpoint, token, fetchImpl, ["SET", storageKey(record.date), JSON.stringify(record.habits)]);
      return record;
    },
  };
}
