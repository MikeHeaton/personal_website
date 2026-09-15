import test from 'node:test';
import assert from 'node:assert/strict';
import { passwordHash, verifyPassword, createSession, validSession, cookie, MAX_AGE } from '../lib/display-auth.mjs';
import { hourSlot, nextHour } from '../lib/display-data.mjs';
process.env.DISPLAY_PASSWORD_HASH = passwordHash('test-password');
process.env.DISPLAY_SESSION_SECRET = 'a'.repeat(48);
test('password verification rejects incorrect and malformed input', () => {
  assert.equal(verifyPassword('test-password'), true);
  for (const value of ['incorrect', '', null, {}, 'a'.repeat(257)]) assert.equal(verifyPassword(value), false);
});
test('sessions expire, reject tampering, and are revoked by password rotation', () => {
  const now=Date.now(), token=createSession(now);
  assert.equal(validSession(token, now), true);
  assert.equal(validSession(token+'x', now), false);
  assert.equal(validSession(token, now+MAX_AGE*1000+1), false);
  const original=process.env.DISPLAY_PASSWORD_HASH;
  process.env.DISPLAY_PASSWORD_HASH=passwordHash('new-password');
  assert.equal(validSession(token, now), false);
  process.env.DISPLAY_PASSWORD_HASH=original;
  assert.match(cookie(token), /HttpOnly; SameSite=Lax; Max-Age=15552000; Secure/);
});
test('rotation occurs at the hour and scheduling always targets the next boundary', () => {
  const boundary=Date.parse('2026-09-15T22:00:00Z');
  assert.equal(hourSlot(boundary)-hourSlot(boundary-1),1);
  assert.equal(nextHour(boundary-1),boundary);
  assert.equal(nextHour(boundary),boundary+3600000);
});
