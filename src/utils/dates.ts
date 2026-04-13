import { VB_DAYS, DAY_NAMES, MONTH_ABBREVS, DOW_LETTERS, WEEKDAY_SLOTS, SUNDAY_SLOTS } from './constants';
import type { CalendarDay } from '../types';

/** Format Date as YYYY-MM-DD */
export function toDateStr(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** "18:00" -> minutes since midnight */
export function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/** "18:00" -> "6:00p" */
export function formatTime12(time: string): string {
  const [h, m] = time.split(':').map(Number);
  return (h > 12 ? h - 12 : h) + ':' + String(m).padStart(2, '0') + (h >= 12 ? 'p' : 'a');
}

/** "2026-04-02" -> "Apr 2" */
export function formatShort(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return MONTH_ABBREVS[d.getMonth()] + ' ' + d.getDate();
}

/** "2026-04-02" -> "Thursday, Apr 2" */
export function formatDateLong(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return DAY_NAMES[d.getDay()] + ', ' + MONTH_ABBREVS[d.getMonth()] + ' ' + d.getDate();
}

/** Get the nearest VB day (today if it is one, otherwise next) */
export function getDefaultDate(): string {
  const t = new Date();
  if (VB_DAYS.has(t.getDay())) return toDateStr(t);
  for (let i = 1; i <= 7; i++) {
    const n = new Date(t);
    n.setDate(t.getDate() + i);
    if (VB_DAYS.has(n.getDay())) return toDateStr(n);
  }
  return toDateStr(t);
}

/** Navigate to the next/previous VB day */
export function nextVbDay(dateStr: string, dir: 1 | -1): string {
  const d = new Date(dateStr + 'T12:00:00');
  for (let i = 0; i < 60; i++) {
    d.setDate(d.getDate() + dir);
    if (VB_DAYS.has(d.getDay())) return toDateStr(d);
  }
  return dateStr;
}

/** Is this dateStr today? */
export function isToday(dateStr: string): boolean {
  return dateStr === toDateStr(new Date());
}

/** Current time in minutes since midnight */
export function nowMinutes(): number {
  const n = new Date();
  return n.getHours() * 60 + n.getMinutes();
}

/** Compare YYYY-MM-DD strings */
export function compareDateStr(a: string, b: string): number {
  return a.localeCompare(b);
}

/** Compare HH:MM time strings */
export function compareTimeStr(a: string, b: string): number {
  return a.localeCompare(b);
}

/** Compare date/time string pairs */
export function compareDateTime(dateA: string, timeA: string, dateB: string, timeB: string): number {
  return compareDateStr(dateA, dateB) || compareTimeStr(timeA, timeB);
}

/** Is a game still upcoming relative to the local clock? */
export function isUpcomingGame(dateStr: string, time: string, now = new Date()): boolean {
  const today = toDateStr(now);
  if (dateStr > today) return true;
  if (dateStr < today) return false;
  return toMinutes(time) >= (now.getHours() * 60 + now.getMinutes());
}

/** Has a game already started relative to the local clock? */
export function isPastGame(dateStr: string, time: string, now = new Date()): boolean {
  return !isUpcomingGame(dateStr, time, now);
}

/** Is a time range still active or upcoming relative to the local clock? */
export function isUpcomingTimeRange(dateStr: string, endTime: string, now = new Date()): boolean {
  const today = toDateStr(now);
  if (dateStr > today) return true;
  if (dateStr < today) return false;
  return toMinutes(endTime) >= (now.getHours() * 60 + now.getMinutes());
}

/** Get the right slot list for a day of week */
export function getSlotsForDay(dateStr: string): string[] {
  const dow = new Date(dateStr + 'T12:00:00').getDay();
  return dow === 0 ? SUNDAY_SLOTS : WEEKDAY_SLOTS;
}

/** Is this dateStr a VB day? */
export function isVbDay(dateStr: string): boolean {
  const dow = new Date(dateStr + 'T12:00:00').getDay();
  return VB_DAYS.has(dow);
}

/** Build calendar day cells for a month view */
export function calendarDays(year: number, month: number, weekStart: number): CalendarDay[] {
  const today = toDateStr(new Date());

  function makeCell(dt: Date, overflow: boolean): CalendarDay {
    const str = toDateStr(dt);
    return {
      day: dt.getDate(),
      str,
      overflow,
      isVb: VB_DAYS.has(dt.getDay()),
      isToday: str === today,
      isPast: str < today,
    };
  }

  const firstOfMonth = new Date(year, month, 1);
  const startOffset = (firstOfMonth.getDay() - weekStart + 7) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: CalendarDay[] = [];

  // Previous month overflow
  for (let i = startOffset - 1; i >= 0; i--) {
    cells.push(makeCell(new Date(year, month, -i), true));
  }

  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(makeCell(new Date(year, month, d), false));
  }

  // Next month overflow
  const remainder = cells.length % 7;
  if (remainder > 0) {
    for (let d = 1; d <= 7 - remainder; d++) {
      cells.push(makeCell(new Date(year, month + 1, d), true));
    }
  }

  return cells;
}

/** Day-of-week headers for a given week start */
export function dowHeaders(weekStart: number): string[] {
  const headers: string[] = [];
  for (let i = 0; i < 7; i++) {
    headers.push(DOW_LETTERS[(weekStart + i) % 7]);
  }
  return headers;
}

/** Parse day-of-week from a league name like "Tuesday Upper VB" */
export function parseDayFromLeague(name: string): number {
  const n = name.toLowerCase();
  const fullDays: [string, number][] = [
    ['sunday', 0], ['monday', 1], ['tuesday', 2], ['wednesday', 3],
    ['thursday', 4], ['friday', 5], ['saturday', 6],
  ];
  for (const [d, i] of fullDays) {
    if (n.includes(d)) return i;
  }
  const shortDays: [string, number][] = [
    ['sun', 0], ['mon', 1], ['tues', 2], ['tue', 2], ['wed', 3],
    ['thurs', 4], ['thu', 4], ['fri', 5], ['sat', 6],
  ];
  for (const [d, i] of shortDays) {
    if (n.includes(d)) return i;
  }
  return -1;
}
