import ICAL from "ical.js";

export const DISPLAY_TIME_ZONE = "America/Los_Angeles";
const CACHE_INTERVAL = 10 * 60 * 1000;
const MAX_ICS_BYTES = 1024 * 1024;
const MAX_COMPONENTS = 1000;
const MAX_OCCURRENCES = 5000;
let cached;

const dateParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: DISPLAY_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function partsAt(value) {
  return Object.fromEntries(
    dateParts
      .formatToParts(value)
      .filter(({ type }) => type !== "literal")
      .map(({ type, value: part }) => [type, Number(part)]),
  );
}

function dateKey(value) {
  const { year, month, day } = partsAt(value);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function shiftKey(key, days) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function localTimestamp(year, month, day, hour = 0, minute = 0, second = 0) {
  const target = Date.UTC(year, month - 1, day, hour, minute, second);
  let result = target + 8 * 60 * 60 * 1000;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const local = partsAt(result);
    const represented = Date.UTC(
      local.year,
      local.month - 1,
      local.day,
      local.hour,
      local.minute,
      local.second,
    );
    result += target - represented;
  }
  return result;
}

function midnight(key) {
  const [year, month, day] = key.split("-").map(Number);
  return localTimestamp(year, month, day);
}

function instant(time) {
  if (time.zone?.tzid === "floating")
    return localTimestamp(time.year, time.month, time.day, time.hour, time.minute, time.second);
  return time.toJSDate().getTime();
}

function textValue(component, name, fallback = "Untitled") {
  const value = component.getFirstPropertyValue(name);
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function occurrenceRecord(details, uid) {
  const startTime = details.startDate;
  const endTime = details.endDate;
  const allDay = startTime.isDate;
  const startKey = startTime.toString().slice(0, 10);
  const endKey = endTime.toString().slice(0, 10);
  const start = allDay ? midnight(startKey) : instant(startTime);
  const end = allDay ? midnight(endKey) : instant(endTime);
  return {
    id: `${uid}:${startTime.toString()}`,
    title: textValue(details.item.component, "summary"),
    location: textValue(details.item.component, "location", ""),
    allDay,
    start,
    end: Math.max(end, start + (allDay ? 24 * 60 * 60 * 1000 : 1)),
  };
}

function expandEvent(event, rangeStart, rangeEnd, budget) {
  const uid = event.uid || "event";
  if (!event.isRecurring()) {
    return [
      occurrenceRecord(
        { startDate: event.startDate, endDate: event.endDate, item: event },
        uid,
      ),
    ];
  }
  const iterator = event.iterator();
  const result = [];
  for (let occurrence = iterator.next(); occurrence; occurrence = iterator.next()) {
    budget.count += 1;
    if (budget.count > MAX_OCCURRENCES) throw new Error("Calendar recurrence limit exceeded");
    const details = event.getOccurrenceDetails(occurrence);
    const record = occurrenceRecord(details, uid);
    if (record.start >= rangeEnd) break;
    if (record.end > rangeStart) result.push(record);
  }
  return result;
}

export function parseCalendar(ics, now = Date.now()) {
  if (typeof ics !== "string" || Buffer.byteLength(ics) > MAX_ICS_BYTES)
    throw new Error("Calendar response is invalid or too large");
  const root = new ICAL.Component(ICAL.parse(ics));
  const components = root.getAllSubcomponents("vevent");
  if (components.length > MAX_COMPONENTS) throw new Error("Calendar event limit exceeded");
  ICAL.TimezoneService.reset();
  for (const component of root.getAllSubcomponents("vtimezone"))
    ICAL.TimezoneService.register(component);
  const events = components.map((component) => new ICAL.Event(component));
  const masters = new Map(
    events
      .filter((event) => !event.isRecurrenceException())
      .map((event) => [event.uid, event]),
  );
  for (const exception of events.filter((event) => event.isRecurrenceException()))
    masters.get(exception.uid)?.relateException(exception);
  const todayKey = dateKey(now);
  const keys = [todayKey, shiftKey(todayKey, 1)];
  const boundaries = [midnight(keys[0]), midnight(keys[1]), midnight(shiftKey(keys[1], 1))];
  const budget = { count: 0 };
  const occurrences = [...masters.values()]
    .flatMap((event) => expandEvent(event, boundaries[0], boundaries[2], budget))
    .filter(({ start, end }) => start < boundaries[2] && end > boundaries[0]);
  const days = keys.map((key, index) => ({
    key,
    label: index === 0 ? "TODAY" : "TOMORROW",
    events: occurrences
      .filter(({ start, end }) => start < boundaries[index + 1] && end > boundaries[index])
      .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start - b.start || a.title.localeCompare(b.title)),
  }));
  return { days, updatedAt: now };
}

async function responseText(response) {
  if (!response.ok) throw new Error("Calendar service unavailable");
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_ICS_BYTES)
    throw new Error("Calendar response is too large");
  const text = await response.text();
  if (Buffer.byteLength(text) > MAX_ICS_BYTES) throw new Error("Calendar response is too large");
  return text;
}

export async function calendar(now = Date.now(), fetcher = fetch) {
  const url = process.env.GOOGLE_CALENDAR_ICAL_URL;
  if (!url) return null;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Calendar configuration is invalid");
  }
  if (!/^https?:$/.test(parsed.protocol)) throw new Error("Calendar configuration is invalid");
  const slot = Math.floor(now / CACHE_INTERVAL);
  if (cached?.slot === slot) return cached.value;
  const response = await fetcher(url, {
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(6000),
  });
  const value = parseCalendar(await responseText(response), now);
  cached = { slot, value };
  return value;
}
