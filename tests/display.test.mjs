import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  passwordHash,
  verifyPassword,
  createSession,
  validSession,
  cookie,
  MAX_AGE,
  validBearer,
} from "../lib/display-auth.mjs";
import {
  createHabitStore,
  emptyHabitSnapshot,
  habitDateWindow,
  loadHabitSnapshot,
  validateHabitRecord,
} from "../lib/display-habits.mjs";
import { createHandler as createHabitsHandler } from "../pages/api/display/habits.js";
import {
  REFRESH_INTERVAL,
  hourSlot,
  nextHour,
  nextRefresh,
  parseSunTimes,
  weather,
} from "../lib/display-data.mjs";
process.env.DISPLAY_PASSWORD_HASH = passwordHash("test-password");
process.env.DISPLAY_SESSION_SECRET = "a".repeat(48);
test("password verification rejects incorrect and malformed input", () => {
  assert.equal(verifyPassword("test-password"), true);
  for (const value of ["incorrect", "", null, {}, "a".repeat(257)])
    assert.equal(verifyPassword(value), false);
});
test("sessions expire, reject tampering, and are revoked by password rotation", () => {
  const now = Date.now(),
    token = createSession(now);
  assert.equal(validSession(token, now), true);
  assert.equal(validSession(token + "x", now), false);
  assert.equal(validSession(token, now + MAX_AGE * 1000 + 1), false);
  const original = process.env.DISPLAY_PASSWORD_HASH;
  process.env.DISPLAY_PASSWORD_HASH = passwordHash("new-password");
  assert.equal(validSession(token, now), false);
  process.env.DISPLAY_PASSWORD_HASH = original;
  assert.match(
    cookie(token),
    /HttpOnly; SameSite=Lax; Max-Age=15552000; Secure/,
  );
});
test("record API bearer authentication reuses the server-only display session secret", () => {
  assert.equal(validBearer(`Bearer ${process.env.DISPLAY_SESSION_SECRET}`), true);
  assert.equal(validBearer("Bearer incorrect"), false);
  assert.equal(validBearer(undefined), false);
});
function apiResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
}

test("habit record validation requires a real local date and all four boolean results", () => {
  const valid = {
    date: "2026-09-15",
    habits: { dogTeeth: true, bed: false, strengthProtein: true, strengthRun: false },
  };
  assert.deepEqual(validateHabitRecord(valid), valid);
  assert.equal(validateHabitRecord({ ...valid, date: "2026-02-30" }), null);
  assert.equal(validateHabitRecord({ ...valid, habits: { ...valid.habits, bed: "yes" } }), null);
  assert.equal(validateHabitRecord({ ...valid, habits: { dogTeeth: true } }), null);
  assert.equal(validateHabitRecord({ ...valid, habits: { ...valid.habits, surprise: true } }), null);
});

test("habit record API enforces auth, validation, and durable-store availability", async () => {
  const writes = [];
  const handler = createHabitsHandler(() => ({ write: async (record) => writes.push(record) }));
  const base = { method: "POST", headers: { host: "example.test" }, cookies: {}, body: { date: "2026-09-15", habits: { dogTeeth: true, bed: false, strengthProtein: true, strengthRun: false } } };
  let res = apiResponse();
  await handler(base, res);
  assert.equal(res.statusCode, 401);
  assert.equal(writes.length, 0);

  res = apiResponse();
  await handler({ ...base, headers: { ...base.headers, authorization: `Bearer ${process.env.DISPLAY_SESSION_SECRET}` }, body: { ...base.body, date: "not-a-date" } }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(writes.length, 0);

  res = apiResponse();
  await createHabitsHandler(() => null)({ ...base, headers: { ...base.headers, authorization: `Bearer ${process.env.DISPLAY_SESSION_SECRET}` } }, res);
  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.body, { error: "habit_storage_unconfigured" });

  const session = createSession();
  res = apiResponse();
  await handler({ ...base, headers: { ...base.headers, origin: "https://evil.example", "sec-fetch-site": "cross-site" }, cookies: { display_session: session } }, res);
  assert.equal(res.statusCode, 403);
  assert.equal(writes.length, 0);

  res = apiResponse();
  await handler({ ...base, headers: { ...base.headers, origin: "https://example.test" }, cookies: { display_session: session } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(writes.length, 1);

  res = apiResponse();
  await handler({ ...base, headers: { ...base.headers, authorization: `Bearer ${process.env.DISPLAY_SESSION_SECRET}` } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(writes.length, 2);
  assert.equal(writes[1].date, "2026-09-15");
});

test("Upstash provider persists and reloads per-date records without exposing its token in the URL", async () => {
  const values = new Map();
  const calls = [];
  const token = "private-storage-token";
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    const [operation, ...args] = JSON.parse(options.body);
    if (operation === "SET") {
      values.set(args[0], args[1]);
      return new Response(JSON.stringify({ result: "OK" }), { status: 200 });
    }
    if (operation === "MGET") {
      return new Response(JSON.stringify({ result: args.map((key) => values.get(key) ?? null) }), { status: 200 });
    }
    return new Response(JSON.stringify({ error: "unsupported" }), { status: 400 });
  };
  const store = createHabitStore({ KV_REST_API_URL: "https://example.upstash.io", KV_REST_API_TOKEN: token }, fetchImpl);
  const record = { date: "2026-09-14", habits: { dogTeeth: true, bed: false, strengthProtein: true, strengthRun: false } };
  await store.write(record);
  const snapshot = await loadHabitSnapshot(store, Date.parse("2026-09-15T20:00:00Z"));
  assert.equal(snapshot.records["2026-09-14"].dogTeeth, true);
  assert.equal(snapshot.records["2026-09-14"].bed, false);
  assert.equal(snapshot.records["2026-09-13"], null);
  assert.ok(calls.every(({ url, options }) => !url.includes(token) && options.headers.Authorization === `Bearer ${token}` && options.cache === "no-store"));
});

test("rotation occurs at the hour and scheduling always targets the next boundary", () => {
  const boundary = Date.parse("2026-09-15T22:00:00Z");
  assert.equal(hourSlot(boundary) - hourSlot(boundary - 1), 1);
  assert.equal(nextHour(boundary - 1), boundary);
  assert.equal(nextHour(boundary), boundary + 3600000);
});

import { displayPage, refreshSeconds } from "../lib/display-page.mjs";
const initial = {
  serverTime: Date.parse("2026-09-15T21:59:30Z"),
  habits: {
    dates: ["2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11", "2026-09-12", "2026-09-13", "2026-09-14"],
    records: {
      "2026-09-13": null,
      "2026-09-14": { dogTeeth: true, bed: false, strengthProtein: true, strengthRun: false },
    },
  },
  calendar: {
    days: [
      {
        key: "2026-09-15",
        label: "TODAY",
        events: [{ id: "one", title: "Dentist <check>", location: "", allDay: false, start: Date.parse("2026-09-15T22:00:00Z"), end: Date.parse("2026-09-15T23:00:00Z") }],
      },
      { key: "2026-09-16", label: "TOMORROW", events: [] },
    ],
  },
  weather: {
    temperature: 67,
    code: 0,
    label: "Clear skies",
    updatedAt: Date.parse("2026-09-15T21:58:00Z"),
    twoDayHours: Array.from({ length: 48 }, (_, i) => ({
      time: `2026-09-${i < 24 ? "15" : "16"}T${String(i % 24).padStart(2, "0")}:00`,
      temperature: 58 + (i % 11),
      rain: i % 7 === 0 ? 0.03 : 0,
    })),
    sunTimes: [
      { date: "2026-09-15", sunrise: "2026-09-15T06:52", sunset: "2026-09-15T19:15" },
      { date: "2026-09-16", sunrise: "2026-09-16T06:53", sunset: "2026-09-16T19:13" },
    ],
    days: [{ date: "2026-09-15", code: 0, high: 70, low: 54, rain: 2 }],
  },
};
test("initial HTML contains calendar, forecast, and inline habit artwork without JavaScript", () => {
  const html = displayPage(true, false, true, "test", initial);
  assert.match(html, /id="calendar"/);
  assert.match(html, /Dentist &lt;check&gt;/);
  assert.match(html, /Nothing scheduled/);
  assert.doesNotMatch(html, /id="artwork"|\/api\/display\/art/);
  assert.match(html, />67°<\/text>/);
  assert.match(html, /70°/);
  assert.match(html, /content="30;url=\/display"/);
  assert.match(html, /viewBox="0 0 1080 1920"/);
  assert.match(html, /id="hourly-chart"/);
  assert.match(html, /id="habits"/);
  for (const label of ["Keke teeth brushing", "In bed early", "Took creatine", "Did exercise"])
    assert.match(html, new RegExp(`aria-label="${label}"`));
  assert.equal((html.match(/class="habit-label-art"/g) || []).length, 4);
  assert.equal((html.match(/class="twemoji /g) || []).length, 7);
  for (const color of ["#D99E82", "#3DB8C1", "#55ACEE", "#FFDC5D", "#DD2E44"])
    assert.match(html, new RegExp(`fill="${color}"`));
  assert.doesNotMatch(html, /🐕|🪥|🛏|💪|🥤|🏃/u);
  assert.doesNotMatch(html, /<image\b|\b(?:href|xlink:href)=|data:image|@font-face/i);
  assert.match(html, />✓<\/text>/);
  assert.match(html, /fill="#16833f"/);
  assert.match(html, />X<\/text>/);
  assert.match(html, /fill="#000000"/);
  assert.equal((html.match(/>X<\/text>/g) || []).length, 2);
  assert.equal((html.match(/>✓<\/text>/g) || []).length, 2);
  assert.match(html, />TU 9\/8<\/text>/);
  assert.match(html, />MO 9\/14<\/text>/);
  assert.doesNotMatch(html, />TU 9\/15<\/text>/);
  assert.doesNotMatch(html, /id="hourly-quote"|The best way out|Robert Frost/);
  assert.doesNotMatch(html, /id="next-24-hours-chart"|NEXT 24 HOURS/);
  assert.match(html, /TODAY \+ TOMORROW/);
  assert.match(html, /id="elapsed-mask"/);
  assert.match(html, /WED 9\/16/);
  assert.match(html, /id="day-divider"/);
  assert.equal((html.match(/class="solar-marker"/g) || []).length, 4);
  assert.match(html, /aria-label="Sunrise 6:52"/);
  assert.match(html, /aria-label="Sunset 7:13"/);
  assert.match(html, /class="solar-symbol solar-symbol-sun"/);
  assert.match(html, /class="solar-symbol solar-symbol-moon"/);
  assert.doesNotMatch(html, /☀|☾/);
  assert.doesNotMatch(html, /attributeName="visibility"|dur="60s"/);
  assert.match(html, /TEMPERATURE \(°F\)/);
  assert.match(html, /RAINFALL \(IN\)/);
  assert.match(html, /Last changed 2:58 PM/);
  assert.doesNotMatch(html, /<script/);
  assert.doesNotMatch(html, /<script nonce=/);
});
test("logged-out HTML contains no private content or automatic refresh", () => {
  const html = displayPage(false, false, true, "test", initial);
  assert.doesNotMatch(html, /Dentist|temperature|http-equiv="refresh"|A little art/);
  assert.match(html, /Welcome home/);
  assert.match(html, /Your day at a glance/);
});
test("weather failure still renders calendar and retries promptly without JS", () => {
  const html = displayPage(true, false, true, "test", {
    ...initial,
    weather: null,
  });
  assert.match(html, /Dentist &lt;check&gt;/);
  assert.match(html, /Weather unavailable/);
  assert.doesNotMatch(html, /Last changed/);
  assert.equal(refreshSeconds(Date.parse("2026-09-15T21:20:00Z"), false), 60);
  assert.equal(refreshSeconds(Date.parse("2026-09-15T21:59:59.900Z"), true), 1);
});

test("authenticated HTML refreshes every ten minutes without JavaScript", () => {
  const html = displayPage(true, false, true, "test", {
    ...initial,
    serverTime: Date.parse("2026-09-15T21:30:00Z"),
  });
  assert.match(html, /http-equiv="refresh" content="600;url=\/display"/);
  assert.doesNotMatch(html, /<script/);
});

test("page refresh is aligned to ten-minute boundaries while hourly content stays stable", () => {
  const now = Date.parse("2026-09-15T21:23:00Z");
  assert.equal(REFRESH_INTERVAL, 10 * 60 * 1000);
  assert.equal(nextRefresh(now), Date.parse("2026-09-15T21:30:00Z"));
  assert.equal(refreshSeconds(now, true), 7 * 60);
  assert.equal(refreshSeconds(Date.parse("2026-09-15T21:30:00Z"), true), 10 * 60);
  assert.equal(hourSlot(now), hourSlot(nextRefresh(now)));
});

test("weather ingestion returns the local-midnight 48-hour window without rolling data", async () => {
  const hourlyTime = Array.from({ length: 120 }, (_, index) => {
    const day = 15 + Math.floor(index / 24);
    const hour = index % 24;
    return `2026-09-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:00`;
  });
  const payload = {
    current: { time: "2026-09-15T14:00", temperature_2m: 67, weather_code: 1 },
    hourly: {
      time: hourlyTime,
      temperature_2m: hourlyTime.map((_, index) => 55 + index / 10),
      precipitation: hourlyTime.map((_, index) => index % 9 ? 0 : 0.02),
    },
    daily: {
      time: ["2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19"],
      sunrise: ["2026-09-15T06:52", "2026-09-16T06:53", "2026-09-17T06:54", "2026-09-18T06:55", "2026-09-19T06:56"],
      sunset: ["2026-09-15T19:15", "2026-09-16T19:13", "2026-09-17T19:12", "2026-09-18T19:10", "2026-09-19T19:09"],
      weather_code: [0, 1, 2, 3, 45],
      temperature_2m_max: [70, 71, 72, 73, 74],
      temperature_2m_min: [50, 51, 52, 53, 54],
      precipitation_probability_max: [0, 10, 20, 30, 40],
    },
  };
  const result = await weather(Date.parse("2026-09-15T21:05:00Z"), async (url) => {
    assert.match(String(url), /latitude=37\.7565942&longitude=-122\.4111482/);
    assert.match(String(url), /daily=[^&]*sunrise,sunset/);
    assert.match(String(url), /timezone=America%2FLos_Angeles/);
    return new Response(JSON.stringify(payload), { status: 200 });
  });
  assert.equal("hours" in result, false);
  assert.equal(result.twoDayHours.length, 48);
  assert.equal(result.twoDayHours[0].time, "2026-09-15T00:00");
  assert.equal(result.twoDayHours[47].time, "2026-09-16T23:00");
  assert.deepEqual(result.sunTimes, [
    { date: "2026-09-15", sunrise: "2026-09-15T06:52", sunset: "2026-09-15T19:15" },
    { date: "2026-09-16", sunrise: "2026-09-16T06:53", sunset: "2026-09-16T19:13" },
  ]);
  const oversized = structuredClone(payload);
  oversized.hourly.time = Array.from({ length: 169 }, (_, index) => `hour-${index}`);
  oversized.hourly.temperature_2m = Array(169).fill(60);
  oversized.hourly.precipitation = Array(169).fill(0);
  await assert.rejects(
    weather(Date.parse("2026-09-15T21:15:00Z"), async () =>
      new Response(JSON.stringify(oversized), { status: 200 })),
    /Incomplete forecast/,
  );
  const withoutSolarData = structuredClone(payload);
  delete withoutSolarData.daily.sunrise;
  delete withoutSolarData.daily.sunset;
  const fallback = await weather(Date.parse("2026-09-15T21:25:00Z"), async () =>
    new Response(JSON.stringify(withoutSolarData), { status: 200 }));
  assert.deepEqual(fallback.sunTimes, [
    { date: "2026-09-15", sunrise: null, sunset: null },
    { date: "2026-09-16", sunrise: null, sunset: null },
  ]);
});

test("solar data parsing accepts only the displayed local dates and valid local times", () => {
  const parsed = parseSunTimes({
    time: ["2026-09-14", "2026-09-15", "2026-09-16"],
    sunrise: ["2026-09-14T06:51", "2026-09-15T06:52", "wrong-dateT06:53"],
    sunset: ["2026-09-14T19:16", "2026-09-15T19:15", "2026-09-16T25:00"],
  }, "2026-09-15");
  assert.deepEqual(parsed, [
    { date: "2026-09-15", sunrise: "2026-09-15T06:52", sunset: "2026-09-15T19:15" },
    { date: "2026-09-16", sunrise: null, sunset: null },
  ]);
});

import { columns, wrapLines } from "../lib/display/drawing.mjs";
import {
  calendarDayPanel,
  hourlyChart,
  habitsPanel,
  HABIT_ICON_WIDTH,
  HABIT_LABEL_WIDTH,
  layout,
  interpolateTemperatureAtHour,
  solarEventOffsetHours,
  temperatureAxisBounds,
} from "../lib/display/scene.mjs";
import { calendar, parseCalendar } from "../lib/display-calendar.mjs";
test("forecast columns fill their frame evenly and every panel stays on the canvas", () => {
  const cells = columns(layout.forecast, 5);
  assert.equal(cells.length, 5);
  assert.equal(cells[0].x, layout.forecast.x);
  assert.equal(
    cells[4].x + cells[4].width,
    layout.forecast.x + layout.forecast.width,
  );
  for (const [name, frame] of Object.entries(layout)) {
    if (name === "canvas") continue;
    assert.ok(frame.x >= 0 && frame.y >= 0);
    assert.ok(frame.x + frame.width <= layout.canvas.width);
    assert.ok(frame.y + frame.height <= layout.canvas.height);
  }
});
test("wrapped labels stay within their reserved lines", () => {
  const lines = wrapLines("A long calendar title ".repeat(20), 48, 2);
  assert.equal(lines.length, 2);
  assert.ok(lines[1].endsWith("…"));
});

const calendarFixture = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Tests//Display//EN\r\nBEGIN:VEVENT\r\nUID:all-day\r\nDTSTART;VALUE=DATE:20260915\r\nDTEND;VALUE=DATE:20260917\r\nSUMMARY:Trip\\, family\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:recurring\r\nDTSTART:20260914T160000\r\nDTEND:20260914T170000\r\nRRULE:FREQ=DAILY;COUNT=4\r\nEXDATE:20260916T160000\r\nSUMMARY:Daily stand-up\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:recurring\r\nRECURRENCE-ID:20260915T160000\r\nDTSTART:20260915T180000\r\nDTEND:20260915T190000\r\nSUMMARY:Moved stand-up\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:overnight\r\nDTSTART:20260916T063000Z\r\nDTEND:20260916T083000Z\r\nSUMMARY:Late shift\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`;

test("calendar parsing expands recurrence and includes all-day and multiday overlaps", () => {
  const parsed = parseCalendar(calendarFixture, Date.parse("2026-09-15T19:00:00Z"));
  assert.deepEqual(parsed.days.map(({ key }) => key), ["2026-09-15", "2026-09-16"]);
  assert.deepEqual(
    parsed.days[0].events.map(({ title }) => title),
    ["Trip, family", "Moved stand-up", "Late shift"],
  );
  assert.deepEqual(parsed.days[1].events.map(({ title }) => title), ["Trip, family", "Late shift"]);
  assert.equal(parsed.days[0].events[0].allDay, true);
  assert.equal(
    parsed.days[0].events.find(({ title }) => title === "Moved stand-up").start,
    Date.parse("2026-09-16T01:00:00Z"),
  );
});

test("calendar ingestion is server-configured, bounded, and fails without leaking its URL", async () => {
  const previous = process.env.GOOGLE_CALENDAR_ICAL_URL;
  process.env.GOOGLE_CALENDAR_ICAL_URL = ["https:", "", "calendar.invalid", "redacted", "basic.ics"].join("/");
  const value = await calendar(Date.parse("2026-09-15T19:01:00Z"), async (url, options) => {
    assert.equal(url, process.env.GOOGLE_CALENDAR_ICAL_URL);
    assert.equal(options.cache, "no-store");
    return new Response(calendarFixture, { status: 200 });
  });
  assert.equal(value.days.length, 2);
  await assert.rejects(
    calendar(Date.parse("2026-09-15T19:11:00Z"), async () => new Response("no", { status: 503 })),
    (error) => !String(error).includes("calendar.invalid"),
  );
  if (previous === undefined) delete process.env.GOOGLE_CALENDAR_ICAL_URL;
  else process.env.GOOGLE_CALENDAR_ICAL_URL = previous;
  assert.throws(() => parseCalendar("x".repeat(1024 * 1024 + 1)), /too large/);
});

test("only overflowing calendar lists receive native SVG scrolling with dwell points", () => {
  const frame = { x: 0, y: 0, width: 480, height: 466 };
  const staticPanel = calendarDayPanel({ key: "2026-09-15", label: "TODAY", events: [] }, frame, 0);
  assert.doesNotMatch(staticPanel, /animateTransform|SCROLLING/);
  const events = Array.from({ length: 8 }, (_, index) => ({
    id: String(index), title: `Event ${index}`, allDay: true, start: 0, end: 1,
  }));
  const scrollingPanel = calendarDayPanel({ key: "2026-09-15", label: "TODAY", events }, frame, 0);
  assert.match(scrollingPanel, /<animateTransform/);
  assert.match(scrollingPanel, /keyTimes="0;0\.18;0\.48;0\.78;1"/);
  assert.match(scrollingPanel, /SCROLLING/);
});

test("habit grid uses seven completed local dates ending yesterday and the dry chart draws a visible blue zero line", () => {
  const now = Date.parse("2026-09-15T07:00:00Z");
  assert.deepEqual(habitDateWindow(now), ["2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11", "2026-09-12", "2026-09-13", "2026-09-14"]);
  assert.deepEqual(habitDateWindow(Date.parse("2026-09-15T06:59:59Z")), ["2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11", "2026-09-12", "2026-09-13"]);
  const grid = habitsPanel(emptyHabitSnapshot(now), layout.habits, now);
  assert.equal((grid.match(/class="habit-row"/g) || []).length, 4);
  assert.equal((grid.match(/>X<\/text>|>✓<\/text>/g) || []).length, 0);
  const dry = {
    ...initial.weather,
    twoDayHours: initial.weather.twoDayHours.map((hour) => ({ ...hour, rain: 0 })),
  };
  assert.equal(hourlyChart(dry, layout.chart, initial.serverTime).match(/stroke="#175a78" stroke-width="5"/g)?.length, 1);
});

test("habit grid distinguishes missing records from stored false values", () => {
  const now = Date.parse("2026-09-15T20:00:00Z");
  const snapshot = emptyHabitSnapshot(now);
  snapshot.records["2026-09-14"] = {
    dogTeeth: true,
    bed: false,
    strengthProtein: true,
    strengthRun: false,
  };
  const grid = habitsPanel(snapshot, layout.habits, now);
  assert.equal((grid.match(/>✓<\/text>/g) || []).length, 2);
  assert.equal((grid.match(/>X<\/text>/g) || []).length, 2);
  assert.equal((grid.match(/>✓<\/text>|>X<\/text>/g) || []).length, 4);
});

test("habit labels use centered accessible full-color inline emoji artwork inside a narrow label column", () => {
  const grid = habitsPanel(emptyHabitSnapshot(Date.parse("2026-09-15T20:00:00Z")), layout.habits);
  assert.equal(HABIT_LABEL_WIDTH, 112);
  assert.ok(HABIT_LABEL_WIDTH < 142);
  assert.ok(HABIT_ICON_WIDTH < HABIT_LABEL_WIDTH);
  assert.equal((grid.match(/class="habit-label-art"/g) || []).length, 4);
  assert.equal((grid.match(/class="twemoji /g) || []).length, 7);
  for (const [name, count] of [["dog", 1], ["toothbrush", 1], ["bed", 1], ["biceps", 2], ["cup", 1], ["runner", 1]])
    assert.equal((grid.match(new RegExp(`twemoji-${name}\\b`, "g")) || []).length, count);
  for (const color of ["#D99E82", "#3DB8C1", "#55ACEE", "#FFDC5D", "#DD2E44"])
    assert.match(grid, new RegExp(`fill="${color}"`));
  assert.doesNotMatch(grid, /<image\b|\b(?:href|xlink:href)=|data:image|@font-face|https?:\/\/|url\(|<script\b|<filter\b|<mask\b|🐕|🪥|🛏|💪|🥤|🏃/iu);
  for (const label of ["Keke teeth brushing", "In bed early", "Took creatine", "Did exercise"])
    assert.match(grid, new RegExp(`role="img" aria-label="${label}"><title>${label}<\\/title>`));
  const centers = [...grid.matchAll(/class="habit-label-art"[^>]*data-icon-left="([\d.]+)" data-icon-right="([\d.]+)" data-icon-top="([\d.]+)" data-icon-bottom="([\d.]+)" transform="translate\(([\d.]+) ([\d.]+)\)"/g)]
    .map((match) => match.slice(1).map(Number));
  assert.equal(centers.length, 4);
  const expectedX = layout.habits.x + HABIT_LABEL_WIDTH / 2;
  const rowHeight = (layout.habits.height - 38) / 4;
  centers.forEach(([left, right, top, bottom, x, y], index) => {
    const rowTop = layout.habits.y + 38 + index * rowHeight;
    const rowBottom = rowTop + rowHeight;
    assert.equal(x, expectedX);
    assert.equal((left + right) / 2, expectedX);
    assert.ok(left >= layout.habits.x);
    assert.ok(right <= layout.habits.x + HABIT_LABEL_WIDTH);
    assert.equal(y, rowTop + rowHeight / 2);
    assert.equal((top + bottom) / 2, y);
    assert.ok(top >= rowTop);
    assert.ok(bottom <= rowBottom);
  });
  assert.match(grid, new RegExp(`x1="${layout.habits.x + HABIT_LABEL_WIDTH}"`));
});

test("Twemoji artwork attribution pins the six bundled assets and graphics license", () => {
  const notice = readFileSync(new URL("../THIRD_PARTY_NOTICES.md", import.meta.url), "utf8");
  assert.match(notice, /jdecked\/twemoji/);
  assert.match(notice, /v17\.0\.3/);
  assert.match(notice, /b6b55fef1e8636b540a6d016a4729ca8cdf2e60b/);
  for (const codepoint of ["1f415", "1faa5", "1f6cf", "1f4aa", "1f964", "1f3c3"])
    assert.match(notice, new RegExp(`${codepoint}\\.svg`));
  assert.match(notice, /Creative Commons Attribution 4\.0 International license \(CC BY 4\.0\)/);
});

test("rainfall axis uses a 0.05-inch baseline and expands with rounded headroom", () => {
  const normal = hourlyChart(initial.weather, layout.chart, initial.serverTime);
  assert.match(normal, />0\.05<\/text>/);

  const wet = {
    ...initial.weather,
    twoDayHours: initial.weather.twoDayHours.map((hour, index) => ({
      ...hour,
      rain: index === 12 ? 0.31 : hour.rain,
    })),
  };
  const expanded = hourlyChart(wet, layout.chart, initial.serverTime);
  assert.match(expanded, />0\.35<\/text>/);
  assert.doesNotMatch(expanded, />0\.05<\/text>/);
});

test("temperature axis bounds retain padding and always use multiples of 10°F", () => {
  const cases = [
    { values: [58, 68], expected: { min: 50, max: 70 } },
    { values: [60, 60], expected: { min: 50, max: 70 } },
    { values: [69, 69], expected: { min: 60, max: 70 } },
    { values: [70, 70], expected: { min: 60, max: 80 } },
    { values: [-1, -1], expected: { min: -10, max: 0 } },
  ];

  for (const { values, expected } of cases) {
    const bounds = temperatureAxisBounds(values);
    assert.deepEqual(bounds, expected);
    assert.ok(Number.isInteger(bounds.min / 10));
    assert.ok(Number.isInteger(bounds.max / 10));
    assert.ok(values.every((value) => value >= bounds.min && value <= bounds.max));
    assert.ok(bounds.min < bounds.max);
  }

  const chart = hourlyChart(initial.weather, layout.chart, initial.serverTime);
  assert.match(chart, />50°<\/text>/);
  assert.match(chart, />70°<\/text>/);
});

test("solar marker offsets and temperature interpolation preserve fractional local times", () => {
  assert.equal(solarEventOffsetHours("2026-09-15", "2026-09-15T06:30"), 6.5);
  assert.equal(solarEventOffsetHours("2026-09-15", "2026-09-16T18:15"), 42.25);
  assert.equal(solarEventOffsetHours("2026-09-15", "2026-09-17T06:30"), null);
  assert.equal(interpolateTemperatureAtHour([{ temperature: 50 }, { temperature: 58 }], 0.25), 52);
  assert.equal(interpolateTemperatureAtHour([{ temperature: 50 }, { temperature: null }], 0.25), null);
});

test("two-day weather chart positions and labels all four solar markers with a graceful fallback", () => {
  const weather = {
    ...initial.weather,
    twoDayHours: initial.weather.twoDayHours.map((hour, index) => ({ ...hour, temperature: 50 + index })),
    sunTimes: [
      { date: "2026-09-15", sunrise: "2026-09-15T06:30", sunset: "2026-09-15T18:45" },
      { date: "2026-09-16", sunrise: "2026-09-16T06:45", sunset: "2026-09-16T18:15" },
    ],
  };
  const chart = hourlyChart(weather, layout.chart, initial.serverTime);
  assert.equal((chart.match(/class="solar-marker"/g) || []).length, 4);
  assert.equal((chart.match(/data-kind="sunrise"/g) || []).length, 2);
  assert.equal((chart.match(/data-kind="sunset"/g) || []).length, 2);
  assert.match(chart, /data-hour="6\.500"[^>]*aria-label="Sunrise 6:30"/);
  assert.match(chart, /data-hour="42\.250"[^>]*aria-label="Sunset 6:15"/);
  assert.match(chart, /<line x1="245\.4"[^>]*x2="245\.4"[^>]*stroke="#16251c" stroke-width="2"/);
  assert.equal((chart.match(/class="solar-symbol solar-symbol-sun"/g) || []).length, 4);
  assert.equal((chart.match(/class="solar-symbol solar-symbol-moon"/g) || []).length, 2);
  assert.equal((chart.match(/class="solar-time"/g) || []).length, 8);
  assert.match(chart, /class="solar-symbol solar-symbol-sun"[^>]*transform="translate\(245\.4 [\d.]+\)"/);
  assert.match(chart, /class="solar-time" x="245\.4" y="[\d.]+"[^>]*font-size="16"[^>]*>6:30<\/text>/);
  assert.doesNotMatch(chart, /AM|PM|☀|☾/);
  assert.doesNotMatch(hourlyChart({ ...weather, sunTimes: undefined }, layout.chart, initial.serverTime), /class="solar-marker"/);
  assert.doesNotMatch(hourlyChart({ ...weather, sunTimes: [{ date: "2026-09-15", sunrise: null, sunset: "bad" }] }, layout.chart, initial.serverTime), /class="solar-marker"/);
});

test("two-day weather chart contains 48 points, six-hour ticks, and a neutral elapsed mask without a visible legend", () => {
  const chart = hourlyChart(initial.weather, layout.chart, initial.serverTime);
  assert.match(chart, /Today and tomorrow: 48 hourly temperature and rainfall forecasts/);
  assert.match(chart, /TEMPERATURE \(°F\)/);
  assert.match(chart, /RAINFALL \(IN\)/);
  assert.doesNotMatch(chart, />TEMPERATURE<\/text>|>RAINFALL<\/text>|>ELAPSED<\/text>/);
  assert.doesNotMatch(chart, /x1="418" y1="1359"|x="694" y="1348"|x="906" y="1348"/);
  assert.match(chart, /fill="#6d716d" opacity="\.24"/);
  assert.match(chart, /stroke="#555b57" stroke-width="3" stroke-dasharray="9 7"/);
  for (const label of ["TUE 9/15", "WED 9/16", "THU 9/17"])
    assert.match(chart, new RegExp(label));
  assert.equal((chart.match(/>6a<\/text>/g) || []).length, 2);
  assert.equal((chart.match(/>12p<\/text>/g) || []).length, 2);
  assert.equal((chart.match(/>6p<\/text>/g) || []).length, 2);
  assert.match(chart, /id="day-divider"[^>]*aria-label="Tomorrow starts"[^>]*x1="540\.0"[^>]*x2="540\.0"[^>]*stroke="#000" stroke-width="8"/);
  assert.doesNotMatch(chart, /NEXT 24 HOURS|calcMode="discrete"|attributeName="visibility"|dur="60s"/);
  assert.doesNotMatch(chart, /<script/);
});
