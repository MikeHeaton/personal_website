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
import { hourSlot, nextHour, nextRefresh } from "../lib/display-data.mjs";
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
  art: {
    id: 436535,
    title: "<Painting>",
    artist_title: "Artist & Co",
    date_display: "1889",
    source: "https://www.metmuseum.org/art/collection/search/436535",
  },
  weather: {
    temperature: 67,
    code: 0,
    label: "Clear skies",
    days: [{ date: "2026-09-15", code: 0, high: 70, low: 54, rain: 2 }],
  },
};
test("initial HTML contains artwork and forecast without executing JavaScript", () => {
  const html = displayPage(true, false, true, "test", initial);
  assert.match(html, /xlink:href="\/api\/display\/art\?id=436535"/);
  assert.match(html, />67°<\/text>/);
  assert.match(html, /70°/);
  assert.match(html, /content="30;url=\/display"/);
  assert.match(html, /&lt;Painting&gt;/);
  assert.match(html, /Artist &amp; Co/);
  assert.match(html, /viewBox="0 0 1080 1920"/);
  assert.doesNotMatch(html, /<script/);
  assert.doesNotMatch(html, /<script nonce=/);
});
test("logged-out HTML contains no private content or automatic refresh", () => {
  const html = displayPage(false, false, true, "test", initial);
  assert.doesNotMatch(html, /436535|temperature|http-equiv="refresh"/);
  assert.match(html, /Welcome home/);
});
test("weather failure still renders art and retries promptly without JS", () => {
  const html = displayPage(true, false, true, "test", {
    ...initial,
    weather: null,
  });
  assert.match(html, /xlink:href="\/api\/display\/art\?id=436535"/);
  assert.match(html, /Weather unavailable/);
  assert.equal(refreshSeconds(Date.parse("2026-09-15T21:20:00Z"), false), 60);
  assert.equal(refreshSeconds(Date.parse("2026-09-15T21:59:59.900Z"), true), 1);
});

test("forced HTML refresh remains active without JavaScript", () => {
  assert.match(
    displayPage(true, false, true, "test", initial),
    /http-equiv="refresh" content="30;url=\/display"/,
  );
  assert.doesNotMatch(
    displayPage(true, false, true, "test", initial),
    /<script/,
  );
});

test("refresh is aligned to sixty seconds while artwork remains hourly", () => {
  const now = Date.parse("2026-09-15T21:23:00Z");
  assert.equal(nextRefresh(now), Date.parse("2026-09-15T21:24:00Z"));
  assert.equal(refreshSeconds(now, true), 60);
  assert.equal(refreshSeconds(Date.parse("2026-09-15T21:30:00Z"), true), 60);
  assert.equal(hourSlot(now), hourSlot(nextRefresh(now)));
});

import { columns, wrapLines } from "../lib/display/drawing.mjs";
import { layout } from "../lib/display/scene.mjs";
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
test("long artwork titles stay within the reserved caption lines", () => {
  const lines = wrapLines("A long artwork title ".repeat(20), 48, 2);
  assert.equal(lines.length, 2);
  assert.ok(lines[1].endsWith("…"));
});
