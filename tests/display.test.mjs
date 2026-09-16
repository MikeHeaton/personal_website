import test from "node:test";
import assert from "node:assert/strict";
import {
  passwordHash,
  verifyPassword,
  createSession,
  validSession,
  cookie,
  MAX_AGE,
} from "../lib/display-auth.mjs";
import {
  REFRESH_INTERVAL,
  hourSlot,
  nextHour,
  nextRefresh,
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
test("rotation occurs at the hour and scheduling always targets the next boundary", () => {
  const boundary = Date.parse("2026-09-15T22:00:00Z");
  assert.equal(hourSlot(boundary) - hourSlot(boundary - 1), 1);
  assert.equal(nextHour(boundary - 1), boundary);
  assert.equal(nextHour(boundary), boundary + 3600000);
});

import { displayPage, refreshSeconds } from "../lib/display-page.mjs";
const initial = {
  serverTime: Date.parse("2026-09-15T21:59:30Z"),
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
    days: [{ date: "2026-09-15", code: 0, high: 70, low: 54, rain: 2 }],
  },
};
test("initial HTML contains calendar and forecast without artwork or JavaScript", () => {
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
  assert.doesNotMatch(html, /id="next-24-hours-chart"|NEXT 24 HOURS/);
  assert.match(html, /TODAY \+ TOMORROW/);
  assert.match(html, /id="elapsed-mask"/);
  assert.match(html, /WED 9\/16/);
  assert.match(html, /id="day-divider"/);
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
      weather_code: [0, 1, 2, 3, 45],
      temperature_2m_max: [70, 71, 72, 73, 74],
      temperature_2m_min: [50, 51, 52, 53, 54],
      precipitation_probability_max: [0, 10, 20, 30, 40],
    },
  };
  const result = await weather(Date.parse("2026-09-15T21:05:00Z"), async (url) => {
    assert.match(String(url), /timezone=America%2FLos_Angeles/);
    return new Response(JSON.stringify(payload), { status: 200 });
  });
  assert.equal("hours" in result, false);
  assert.equal(result.twoDayHours.length, 48);
  assert.equal(result.twoDayHours[0].time, "2026-09-15T00:00");
  assert.equal(result.twoDayHours[47].time, "2026-09-16T23:00");
  const oversized = structuredClone(payload);
  oversized.hourly.time = Array.from({ length: 169 }, (_, index) => `hour-${index}`);
  oversized.hourly.temperature_2m = Array(169).fill(60);
  oversized.hourly.precipitation = Array(169).fill(0);
  await assert.rejects(
    weather(Date.parse("2026-09-15T21:15:00Z"), async () =>
      new Response(JSON.stringify(oversized), { status: 200 })),
    /Incomplete forecast/,
  );
});

import { columns, wrapLines } from "../lib/display/drawing.mjs";
import {
  calendarDayPanel,
  hourlyChart,
  layout,
  quoteForHour,
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

test("hourly quote is deterministic and the dry chart draws a visible blue zero line", () => {
  const now = Date.parse("2026-09-15T19:00:00Z");
  assert.deepEqual(quoteForHour(now), quoteForHour(now + 59 * 60 * 1000));
  assert.notDeepEqual(quoteForHour(now), quoteForHour(now + 60 * 60 * 1000));
  const dry = {
    ...initial.weather,
    twoDayHours: initial.weather.twoDayHours.map((hour) => ({ ...hour, rain: 0 })),
  };
  assert.equal(hourlyChart(dry, layout.chart, initial.serverTime).match(/stroke="#175a78" stroke-width="5"/g)?.length, 1);
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

test("two-day weather chart contains 48 points, six-hour ticks, and a neutral elapsed mask", () => {
  const chart = hourlyChart(initial.weather, layout.chart, initial.serverTime);
  assert.match(chart, /Today and tomorrow: 48 hourly/);
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
