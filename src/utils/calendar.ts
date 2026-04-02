import type { Game, Team, OpenPlaySession } from '../types';

const LOCATION = 'KEVA Sports Center, 8312 Forsythia St, Middleton, WI 53562';
const PRODID = '-//KEVA Volleyball//EN';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Convert "2026-04-02" + "18:00" to "20260402T180000" */
function toIcsDateTime(date: string, time: string): string {
  return date.replace(/-/g, '') + 'T' + time.replace(/:/g, '') + '00';
}

/** Add 50 minutes to a time string "18:00" -> "18:50" */
function addSlotDuration(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + 50;
  return pad(Math.floor(total / 60)) + ':' + pad(total % 60);
}

function escapeIcs(text: string): string {
  return text.replace(/[\\;,]/g, (c) => '\\' + c).replace(/\n/g, '\\n');
}

function buildIcs(events: string[]): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-TIMEZONE:America/Chicago',
    ...events,
    'END:VCALENDAR',
  ].join('\r\n');
}

function buildEvent(uid: string, dtStart: string, dtEnd: string, summary: string, description: string): string {
  return [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTART;TZID=America/Chicago:${dtStart}`,
    `DTEND;TZID=America/Chicago:${dtEnd}`,
    `SUMMARY:${escapeIcs(summary)}`,
    `LOCATION:${escapeIcs(LOCATION)}`,
    `DESCRIPTION:${escapeIcs(description)}`,
    'END:VEVENT',
  ].join('\r\n');
}

/** Generate .ics for team games */
export function generateTeamCalendar(
  games: Game[],
  myTeamIds: Set<number>,
  teamMap: Record<number, Team>,
): string {
  const events: string[] = [];

  for (const g of games) {
    const isHome = myTeamIds.has(g.ht);
    const isAway = myTeamIds.has(g.vt);
    if (!isHome && !isAway) continue;

    const myTid = isHome ? g.ht : g.vt;
    const oppTid = isHome ? g.vt : g.ht;
    const myName = teamMap[myTid]?.name || 'My Team';
    const oppName = teamMap[oppTid]?.name || 'TBD';
    const league = teamMap[myTid]?.leagueName || '';

    const endTime = addSlotDuration(g.start);
    const uid = `keva-game-${g.date}-${g.start}-${myTid}@kevavb`;

    events.push(
      buildEvent(
        uid,
        toIcsDateTime(g.date, g.start),
        toIcsDateTime(g.date, endTime),
        `${myName} vs ${oppName}`,
        `${league}\\nKEVA Volleyball League`,
      ),
    );
  }

  return buildIcs(events);
}

/** Generate .ics for open play sessions */
export function generateOpenPlayCalendar(sessions: OpenPlaySession[]): string {
  const events: string[] = [];

  for (const s of sessions) {
    const uid = `keva-openplay-${s.date}-${s.start}@kevavb`;
    events.push(
      buildEvent(
        uid,
        toIcsDateTime(s.date, s.start),
        toIcsDateTime(s.date, s.end),
        s.desc,
        'KEVA Open Play Volleyball',
      ),
    );
  }

  return buildIcs(events);
}

/** Trigger .ics file download */
export function downloadIcs(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
