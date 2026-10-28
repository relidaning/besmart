// Run with `npm test`, which pins TZ=Asia/Shanghai (the container's) so local times
// and their UTC equivalents below are fixed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeRemindAt, nextSeriesReminder, nthOccurrence, occurrences } from './calendarDates.js';

test('the tests run in the container time zone', () => {
  assert.equal(new Date('2026-10-28T14:00:00').toISOString(), '2026-10-28T06:00:00.000Z');
});

test('computeRemindAt: at the time, minutes before, all day, none', () => {
  assert.equal(computeRemindAt('2026-12-01', '10:00', 0), '2026-12-01T02:00:00.000Z');
  assert.equal(computeRemindAt('2026-12-01', '10:00', 30), '2026-12-01T01:30:00.000Z');
  assert.equal(computeRemindAt('2026-12-01', '00:10', 60), '2026-11-30T15:10:00.000Z');
  // An all-day item reminds at 09:00 on the day, or the day before.
  assert.equal(computeRemindAt('2026-12-01', null, 0), '2026-12-01T01:00:00.000Z');
  assert.equal(computeRemindAt('2026-12-01', null, 1440), '2026-11-30T01:00:00.000Z');
  assert.equal(computeRemindAt('2026-12-01', '10:00', null), null);
});

test('monthly: the 31st falls on the last day of shorter months and comes back', () => {
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((k) => nthOccurrence('2026-01-31', 'monthly', k)),
    ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31'],
  );
  assert.equal(nthOccurrence('2028-01-30', 'monthly', 1), '2028-02-29');
  assert.equal(nthOccurrence('2026-11-15', 'monthly', 2), '2027-01-15');
});

test('yearly: Feb 29 falls on Feb 28 in other years', () => {
  assert.deepEqual(
    [0, 1, 2, 4].map((k) => nthOccurrence('2024-02-29', 'yearly', k)),
    ['2024-02-29', '2025-02-28', '2026-02-28', '2028-02-29'],
  );
});

test('weekly: every 7 days, across a month end', () => {
  assert.deepEqual(
    occurrences('2026-10-28', 'weekly', '2026-11-01', '2026-11-30'),
    ['2026-11-04', '2026-11-11', '2026-11-18', '2026-11-25'],
  );
});

test('occurrences: only within the range, none before the start', () => {
  assert.deepEqual(occurrences('2020-03-05', 'monthly', '2026-10-01', '2026-12-31'), ['2026-10-05', '2026-11-05', '2026-12-05']);
  assert.deepEqual(occurrences('2026-12-10', 'monthly', '2026-10-01', '2026-12-31'), ['2026-12-10']);
  assert.deepEqual(occurrences('2027-01-10', 'monthly', '2026-10-01', '2026-12-31'), []);
});

test('nextSeriesReminder: the first occurrence whose reminder is still ahead', () => {
  const ev = { date: '2026-01-05', time: '10:00', remind_before: 60, repeat: 'monthly' as const };
  // Oct 28: Oct 5 is past, so Nov 5 09:00 local.
  assert.deepEqual(nextSeriesReminder(ev, '2026-10-28T06:00:00.000Z'), { date: '2026-11-05', at: '2026-11-05T01:00:00.000Z' });
  // Right after a reminder fires, the next one is a month on (how the loop advances).
  assert.deepEqual(nextSeriesReminder(ev, '2026-11-05T01:00:00.000Z'), { date: '2026-12-05', at: '2026-12-05T01:00:00.000Z' });
  // Just before it, the current one.
  assert.equal(nextSeriesReminder(ev, '2026-11-05T00:59:59.999Z')?.date, '2026-11-05');
});

test('nextSeriesReminder: a "day before" reminder can belong to tomorrow', () => {
  const ev = { date: '2026-10-01', time: null, remind_before: 1440, repeat: 'weekly' as const };
  // Weekly from Thu Oct 1; Thu Oct 29's reminder is Wed Oct 28 09:00 local.
  assert.deepEqual(nextSeriesReminder(ev, '2026-10-27T12:00:00.000Z'), { date: '2026-10-29', at: '2026-10-28T01:00:00.000Z' });
});

test('nextSeriesReminder: none without a reminder', () => {
  assert.equal(nextSeriesReminder({ date: '2026-01-05', time: null, remind_before: null, repeat: 'monthly' }, '2026-10-28T06:00:00.000Z'), null);
});

test('nextSeriesReminder: a series starting in the future begins at its start', () => {
  const ev = { date: '2027-03-31', time: '08:00', remind_before: 0, repeat: 'monthly' as const };
  assert.deepEqual(nextSeriesReminder(ev, '2026-10-28T06:00:00.000Z'), { date: '2027-03-31', at: '2027-03-31T00:00:00.000Z' });
});
