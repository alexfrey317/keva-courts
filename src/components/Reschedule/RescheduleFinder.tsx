import { useMemo, useRef, useState } from 'react';
import type { Court, Game, Grid, League, Team, TeamRosterMap } from '../../types';
import type { TeamRosterStatus } from '../../hooks/useTeamRosters';
import { buildGrid, discoverCourts, isOpenSlotLikely } from '../../utils/courts';
import { SAND_VB_RESOURCES } from '../../utils/constants';
import { compareDateTime, formatDateLong, formatTime12, getSlotsForDay, isStandardVbDay, mergeSlotsWithGameStarts, toDateStr, toMinutes } from '../../utils/dates';
import { collectPlayerTeams } from '../Common/PlayerTeamsModal';
import { Loading } from '../Common/Loading';
import { ReschedTeamModal } from './ReschedTeamModal';

type Surface = 'sand' | 'indoor' | 'unknown';

function teamSurface(team: Team | undefined): Surface {
  if (!team) return 'unknown';
  const name = team.leagueName.toLowerCase();
  if (/\bsand\b/.test(name) || name.includes('beach')) return 'sand';
  return 'indoor';
}

function courtSurface(court: Court): 'sand' | 'indoor' {
  return SAND_VB_RESOURCES.includes(court.res) ? 'sand' : 'indoor';
}

function targetSurface(a: Team | undefined, b: Team | undefined): Surface {
  const surfaceA = teamSurface(a);
  const surfaceB = teamSurface(b);
  if (surfaceA === surfaceB) return surfaceA;
  // Mixed pairing — fall back to no filtering.
  return 'unknown';
}

const OUTAGE_KEY = 'keva-reschedule-outages:v1';
const SCAN_DAYS = 45;
const MIN_PLAYERS = 4;

interface RescheduleFinderProps {
  leagues: League[];
  teams: Team[];
  teamMap: Record<number, Team>;
  allGames: Game[] | null;
  rosters: TeamRosterMap;
  rosterStatus: TeamRosterStatus;
}

interface PlayerOutage {
  id: string;
  player: string;
  date: string;
  note: string;
}

interface Candidate {
  id: string;
  date: string;
  start: string;
  end: string;
  court: Court;
  grid: Grid;
  teamA: TeamAvailability;
  teamB: TeamAvailability;
  score: number;
  quality: 'great' | 'maybe' | 'thin';
}

interface TeamAvailability {
  rosterSize: number;
  available: string[];
  conflicts: PlayerConflict[];
  outages: PlayerOutage[];
  unknown: boolean;
}

interface PlayerConflict {
  player: string;
  teamName: string;
  time: string;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

const MONTH_TITLE = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

function readOutages(): PlayerOutage[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(OUTAGE_KEY) || '[]') as unknown[];
    if (!Array.isArray(parsed)) return [];
    // Tolerate older shape that had start/end/note
    return parsed
      .map((entry) => entry as PlayerOutage & { start?: string; end?: string })
      .filter((entry) => entry && entry.player && entry.date)
      .map((entry) => ({ id: entry.id, player: entry.player, date: entry.date, note: entry.note || '' }));
  } catch {
    return [];
  }
}

function writeOutages(outages: PlayerOutage[]): void {
  try {
    localStorage.setItem(OUTAGE_KEY, JSON.stringify(outages));
  } catch {
    // Keep the in-memory editor usable if storage is unavailable.
  }
}

function addDays(date: Date, days: number): string {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return toDateStr(next);
}

function overlaps(startA: string, endA: string, startB: string, endB: string): boolean {
  return toMinutes(startA) < toMinutes(endB) && toMinutes(startB) < toMinutes(endA);
}

function gameForCourtAt(games: Game[], court: Court, start: string): Game | null {
  const slotMin = toMinutes(start);
  return games.find((game) =>
    game.res === court.res &&
    game.area === court.area &&
    toMinutes(game.start) <= slotMin &&
    slotMin < toMinutes(game.end),
  ) || null;
}

function getCandidateEnd(start: string, grid: Grid): string {
  const rowIndex = grid.rows.findIndex((row) => row.time === start);
  const next = grid.rows[rowIndex + 1]?.time;
  if (next) return next;
  const end = toMinutes(start) + 50;
  return `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`;
}

function getTeamPlayers(teamId: number, rosters: TeamRosterMap): string[] {
  return [...new Set((rosters[teamId]?.players || []).map((player) => player.trim().replace(/\s+/g, ' ')).filter(Boolean))]
    .sort((a, b) => collator.compare(a, b));
}

function conflictsForPlayer(
  player: string,
  date: string,
  start: string,
  end: string,
  primaryTeamIds: Set<number>,
  rosters: TeamRosterMap,
  teamMap: Record<number, Team>,
  allGames: Game[],
): PlayerConflict[] {
  const matches = collectPlayerTeams(player, rosters, teamMap)
    .filter((match) => !primaryTeamIds.has(match.teamId));
  if (!matches.length) return [];

  const teamIds = new Set(matches.map((match) => match.teamId));
  return allGames
    .filter((game) =>
      game.date === date &&
      (teamIds.has(game.ht) || teamIds.has(game.vt)) &&
      overlaps(start, end, game.start, game.end),
    )
    .map((game) => {
      const conflictTeamId = teamIds.has(game.ht) ? game.ht : game.vt;
      return {
        player,
        teamName: teamMap[conflictTeamId]?.name || 'Other team',
        time: game.start,
      };
    });
}

function evaluateTeam(
  teamId: number,
  date: string,
  start: string,
  end: string,
  primaryTeamIds: Set<number>,
  rosters: TeamRosterMap,
  teamMap: Record<number, Team>,
  allGames: Game[],
  outages: PlayerOutage[],
): TeamAvailability {
  const players = getTeamPlayers(teamId, rosters);
  const outageMatches = outages.filter((outage) =>
    outage.date === date &&
    players.some((player) => normalizeName(player) === normalizeName(outage.player)),
  );
  const outageNames = new Set(outageMatches.map((outage) => normalizeName(outage.player)));
  const conflicts = players.flatMap((player) =>
    outageNames.has(normalizeName(player))
      ? []
      : conflictsForPlayer(player, date, start, end, primaryTeamIds, rosters, teamMap, allGames),
  );
  const conflictNames = new Set(conflicts.map((conflict) => normalizeName(conflict.player)));
  const available = players.filter((player) => !outageNames.has(normalizeName(player)) && !conflictNames.has(normalizeName(player)));

  return {
    rosterSize: players.length,
    available,
    conflicts,
    outages: outageMatches,
    unknown: players.length === 0,
  };
}

function qualityFor(a: TeamAvailability, b: TeamAvailability): Candidate['quality'] {
  if (a.available.length >= 6 && b.available.length >= 6 && a.conflicts.length + b.conflicts.length + a.outages.length + b.outages.length <= 2) return 'great';
  if (a.available.length >= MIN_PLAYERS && b.available.length >= MIN_PLAYERS) return 'maybe';
  return 'thin';
}

function scoreCandidate(a: TeamAvailability, b: TeamAvailability): number {
  return (
    Math.min(a.available.length, b.available.length) * 10 +
    Math.max(0, a.available.length + b.available.length) -
    (a.conflicts.length + b.conflicts.length) * 3 -
    (a.outages.length + b.outages.length) * 4
  );
}

function buildCandidates(
  teamAId: number,
  teamBId: number,
  allGames: Game[],
  rosters: TeamRosterMap,
  teamMap: Record<number, Team>,
  outages: PlayerOutage[],
  surface: Surface,
): Candidate[] {
  const today = new Date();
  const dates = new Set<string>();
  for (let i = 0; i <= SCAN_DAYS; i++) dates.add(addDays(today, i));
  for (const game of allGames) if (game.date >= toDateStr(today)) dates.add(game.date);

  const primaryTeamIds = new Set([teamAId, teamBId]);
  const candidates: Candidate[] = [];

  for (const date of [...dates].sort()) {
    const games = allGames.filter((game) => game.date === date);
    if (!games.length) continue;

    const courts = discoverCourts(games);
    if (!courts.length) continue;

    const baseSlots = isStandardVbDay(date) ? getSlotsForDay(date) : [];
    const slots = mergeSlotsWithGameStarts(baseSlots, games);
    const grid = buildGrid(games, courts, slots, null);
    const vbStart = Object.fromEntries(courts.map((court) => {
      const earliest = games
        .filter((game) => game.res === court.res && game.area === court.area)
        .map((game) => toMinutes(game.start))
        .sort((a, b) => a - b)[0];
      return [court.key, earliest === undefined ? -1 : earliest];
    }));

    for (const row of grid.rows) {
      const end = getCandidateEnd(row.time, grid);
      for (let i = 0; i < row.cells.length; i++) {
        const court = courts[i];
        const cell = row.cells[i];
        if (cell.booked || gameForCourtAt(games, court, row.time)) continue;
        if (!isOpenSlotLikely(court, toMinutes(row.time), vbStart)) continue;
        if (surface !== 'unknown' && courtSurface(court) !== surface) continue;

        const teamA = evaluateTeam(teamAId, date, row.time, end, primaryTeamIds, rosters, teamMap, allGames, outages);
        const teamB = evaluateTeam(teamBId, date, row.time, end, primaryTeamIds, rosters, teamMap, allGames, outages);
        const quality = qualityFor(teamA, teamB);
        const score = scoreCandidate(teamA, teamB);
        candidates.push({
          id: `${date}:${row.time}:${court.key}`,
          date,
          start: row.time,
          end,
          court,
          grid,
          teamA,
          teamB,
          quality,
          score,
        });
      }
    }
  }

  return candidates
    .sort((a, b) =>
      b.score - a.score ||
      compareDateTime(a.date, a.start, b.date, b.start) ||
      a.court.name.localeCompare(b.court.name),
    )
    .slice(0, 30);
}

function AvailabilityBlock({ title, team }: { title: string; team: TeamAvailability }) {
  return (
    <div className="reschedule-availability">
      <h4>{title}</h4>
      {team.unknown ? (
        <p className="reschedule-muted">Roster unavailable, so availability is unknown.</p>
      ) : (
        <>
          <div className="reschedule-availability-count">
            {team.available.length}/{team.rosterSize} available
          </div>
          <p><strong>Available:</strong> {team.available.length ? team.available.join(', ') : 'None detected'}</p>
          {team.conflicts.length > 0 && (
            <p><strong>Conflicts:</strong> {team.conflicts.map((conflict) => `${conflict.player} (${conflict.teamName} ${formatTime12(conflict.time)})`).join(', ')}</p>
          )}
          {team.outages.length > 0 && (
            <p><strong>Outages:</strong> {team.outages.map((outage) => `${outage.player}${outage.note ? ` (${outage.note})` : ''}`).join(', ')}</p>
          )}
        </>
      )}
    </div>
  );
}

interface TeamChipProps {
  team: Team | undefined;
  slotLabel: string;
  onPick: () => void;
  onClear: () => void;
}

function TeamChip({ team, slotLabel, onPick, onClear }: TeamChipProps) {
  if (!team) {
    return (
      <button type="button" className="rf-chip rf-chip-empty" onClick={onPick}>
        <span className="rf-chip-plus" aria-hidden>+</span>
        <span className="rf-chip-prompt">{slotLabel}</span>
      </button>
    );
  }
  return (
    <div className="rf-chip rf-chip-filled">
      <button type="button" className="rf-chip-body" onClick={onPick} aria-label={`Change ${team.name}`}>
        <span className="rf-chip-name">{team.name}</span>
        <span className="rf-chip-league">{team.leagueName}</span>
      </button>
      <button type="button" className="rf-chip-clear" onClick={onClear} aria-label={`Remove ${team.name}`}>
        &times;
      </button>
    </div>
  );
}

interface OutageEditorProps {
  rosterByTeam: { team: Team; players: string[] }[];
  outages: PlayerOutage[];
  onAdd: (entries: PlayerOutage[]) => void;
  onClose: () => void;
}

interface DayCell {
  iso: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
  isPast: boolean;
}

function isoFromParts(year: number, month: number, day: number): string {
  return toDateStr(new Date(year, month, day));
}

function parseIso(iso: string): { year: number; month: number; day: number } {
  const [year, month, day] = iso.split('-').map(Number);
  return { year, month: month - 1, day };
}

function buildMonthCells(year: number, month: number): DayCell[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIso = toDateStr(today);
  const firstOfMonth = new Date(year, month, 1);
  const startDow = firstOfMonth.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: DayCell[] = [];

  for (let i = startDow; i > 0; i--) {
    const d = new Date(year, month, 1 - i);
    const iso = toDateStr(d);
    cells.push({ iso, day: d.getDate(), inMonth: false, isToday: false, isPast: iso < todayIso });
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const iso = isoFromParts(year, month, day);
    cells.push({ iso, day, inMonth: true, isToday: iso === todayIso, isPast: iso < todayIso });
  }
  let overflow = 1;
  while (cells.length % 7 !== 0) {
    const d = new Date(year, month + 1, overflow);
    cells.push({ iso: toDateStr(d), day: d.getDate(), inMonth: false, isToday: false, isPast: false });
    overflow++;
  }
  return cells;
}

function expandRange(startIso: string, endIso: string): string[] {
  const lo = startIso <= endIso ? startIso : endIso;
  const hi = startIso >= endIso ? startIso : endIso;
  const start = parseIso(lo);
  const out: string[] = [];
  const cursor = new Date(start.year, start.month, start.day);
  for (let guard = 0; guard < 366; guard++) {
    const iso = toDateStr(cursor);
    out.push(iso);
    if (iso === hi) break;
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

function OutageEditor({ rosterByTeam, outages, onAdd, onClose }: OutageEditorProps) {
  const [players, setPlayers] = useState<Set<string>>(() => new Set());
  const [dates, setDates] = useState<Set<string>>(() => new Set([toDateStr(new Date())]));
  const today = useMemo(() => new Date(), []);
  const [monthOffset, setMonthOffset] = useState(0);
  const [dragAnchor, setDragAnchor] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const dragMovedRef = useRef(false);
  const gridRef = useRef<HTMLDivElement | null>(null);

  const monthDate = useMemo(
    () => new Date(today.getFullYear(), today.getMonth() + monthOffset, 1),
    [today, monthOffset],
  );
  const cells = useMemo(
    () => buildMonthCells(monthDate.getFullYear(), monthDate.getMonth()),
    [monthDate],
  );
  const monthTitle = useMemo(() => MONTH_TITLE.format(monthDate), [monthDate]);

  const existingKey = (p: string, d: string) => `${normalizeName(p)}|${d}`;
  const existing = useMemo(() => new Set(outages.map((entry) => existingKey(entry.player, entry.date))), [outages]);

  const previewSet = useMemo(() => {
    if (!dragAnchor || !dragOver || dragAnchor === dragOver) return new Set<string>();
    return new Set(expandRange(dragAnchor, dragOver));
  }, [dragAnchor, dragOver]);

  const cellIsoFromPoint = (x: number, y: number): string | null => {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    const cellEl = (el as HTMLElement).closest<HTMLElement>('.rf-cal-day');
    if (!cellEl || cellEl.dataset.past === 'true' || !cellEl.dataset.iso) return null;
    return cellEl.dataset.iso;
  };

  const onCellPointerDown = (e: React.PointerEvent<HTMLButtonElement>, cell: DayCell) => {
    if (cell.isPast) return;
    setDragAnchor(cell.iso);
    setDragOver(cell.iso);
    dragMovedRef.current = false;
    gridRef.current?.setPointerCapture?.(e.pointerId);
  };

  const onGridPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragAnchor) return;
    const iso = cellIsoFromPoint(e.clientX, e.clientY);
    if (iso && iso !== dragOver) {
      setDragOver(iso);
      if (iso !== dragAnchor) dragMovedRef.current = true;
    }
  };

  const onGridPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragAnchor) return;
    const finalIso = cellIsoFromPoint(e.clientX, e.clientY) || dragOver || dragAnchor;
    if (!dragMovedRef.current || finalIso === dragAnchor) {
      // Treat as a single tap → toggle
      setDates((prev) => {
        const next = new Set(prev);
        if (next.has(dragAnchor)) next.delete(dragAnchor);
        else next.add(dragAnchor);
        return next;
      });
    } else {
      // Drag → add range
      const range = expandRange(dragAnchor, finalIso);
      setDates((prev) => {
        const next = new Set(prev);
        for (const iso of range) next.add(iso);
        return next;
      });
    }
    setDragAnchor(null);
    setDragOver(null);
    dragMovedRef.current = false;
    try {
      gridRef.current?.releasePointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const onGridPointerCancel = () => {
    setDragAnchor(null);
    setDragOver(null);
    dragMovedRef.current = false;
  };

  const clearDates = () => {
    setDates(new Set());
  };

  const togglePlayer = (name: string) => {
    setPlayers((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const newEntries = useMemo(() => {
    const out: PlayerOutage[] = [];
    for (const player of players) {
      for (const date of dates) {
        if (existing.has(existingKey(player, date))) continue;
        out.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}-${player}-${date}`,
          player,
          date,
          note: '',
        });
      }
    }
    return out;
  }, [players, dates, existing]);

  const submit = () => {
    if (!newEntries.length) return;
    onAdd(newEntries);
    setPlayers(new Set());
    setDates(new Set());
  };

  const dateCount = dates.size;
  const playerCount = players.size;
  const addLabel = !playerCount
    ? 'Mark out'
    : `Mark out (${newEntries.length || 'all set'})`;

  return (
    <div className="rf-outage-editor">
      <div className="rf-outage-step">
        <div className="rf-outage-step-head">
          <span className="rf-outage-step-label">When?</span>
          <span className="rf-outage-step-meta">{dateCount} day{dateCount === 1 ? '' : 's'} selected</span>
        </div>

        <div className="rf-cal">
          <div className="rf-cal-nav">
            <button
              type="button"
              className="rf-cal-arrow"
              onClick={() => setMonthOffset((o) => Math.max(0, o - 1))}
              disabled={monthOffset === 0}
              aria-label="Previous month"
            >
              ‹
            </button>
            <span className="rf-cal-title">{monthTitle}</span>
            <button
              type="button"
              className="rf-cal-arrow"
              onClick={() => setMonthOffset((o) => o + 1)}
              aria-label="Next month"
            >
              ›
            </button>
          </div>

          <div
            ref={gridRef}
            className={'rf-cal-grid' + (dragAnchor ? ' dragging' : '')}
            role="grid"
            onPointerMove={onGridPointerMove}
            onPointerUp={onGridPointerUp}
            onPointerCancel={onGridPointerCancel}
          >
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, idx) => (
              <div key={idx} className="rf-cal-dow" role="columnheader">{d}</div>
            ))}
            {cells.map((cell) => {
              const selected = dates.has(cell.iso);
              const inPreview = previewSet.has(cell.iso);
              const anchor = dragAnchor === cell.iso;
              const cls = [
                'rf-cal-day',
                cell.inMonth ? '' : 'overflow',
                cell.isToday ? 'today' : '',
                selected ? 'selected' : '',
                cell.isPast ? 'past' : '',
                inPreview ? 'previewing' : '',
                anchor ? 'anchor' : '',
              ].filter(Boolean).join(' ');
              return (
                <button
                  key={cell.iso}
                  type="button"
                  role="gridcell"
                  aria-selected={selected}
                  aria-disabled={cell.isPast}
                  disabled={cell.isPast}
                  data-iso={cell.iso}
                  data-past={cell.isPast ? 'true' : 'false'}
                  className={cls}
                  onPointerDown={(e) => onCellPointerDown(e, cell)}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>

          <div className="rf-cal-actions">
            <span className="rf-cal-tip">Tap a day, or drag across days to pick a range.</span>
            {dateCount > 0 && (
              <button type="button" className="rf-btn-ghost" onClick={clearDates}>
                Clear days
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="rf-outage-step">
        <div className="rf-outage-step-head">
          <span className="rf-outage-step-label">Who's out?</span>
          <span className="rf-outage-step-meta">{playerCount} selected</span>
        </div>
        {rosterByTeam.every((entry) => entry.players.length === 0) ? (
          <div className="rf-empty-note">Rosters aren't loaded yet. Try again in a moment.</div>
        ) : (
          rosterByTeam.map(({ team, players: roster }) => (
            <div key={team.id} className="rf-roster-group">
              <div className="rf-roster-group-title">{team.name}</div>
              <div className="rf-player-grid">
                {roster.length === 0 ? (
                  <div className="rf-empty-note">No roster on file.</div>
                ) : (
                  roster.map((name) => {
                    const selected = players.has(name);
                    return (
                      <button
                        key={name}
                        type="button"
                        role="checkbox"
                        aria-checked={selected}
                        className={'rf-player-chip' + (selected ? ' active' : '')}
                        onClick={() => togglePlayer(name)}
                      >
                        {name}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="rf-outage-editor-actions">
        <button type="button" className="rf-btn-ghost" onClick={onClose}>Done</button>
        <button type="button" className="rf-btn-primary" onClick={submit} disabled={!newEntries.length}>
          {addLabel}
        </button>
      </div>
    </div>
  );
}

export function RescheduleFinder({ leagues, teams, teamMap, allGames, rosters, rosterStatus }: RescheduleFinderProps) {
  const sortedTeams = useMemo(
    () => teams.slice().sort((a, b) => a.leagueName.localeCompare(b.leagueName) || collator.compare(a.name, b.name)),
    [teams],
  );
  const [teamAId, setTeamAId] = useState(0);
  const [teamBId, setTeamBId] = useState(0);
  const [pickingSlot, setPickingSlot] = useState<'A' | 'B' | null>(null);
  const [outages, setOutages] = useState<PlayerOutage[]>(readOutages);
  const [outageEditorOpen, setOutageEditorOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const candidates = useMemo(() => {
    if (!teamAId || !teamBId || !allGames) return [];
    const surface = targetSurface(teamMap[teamAId], teamMap[teamBId]);
    return buildCandidates(teamAId, teamBId, allGames, rosters, teamMap, outages, surface);
  }, [allGames, outages, rosters, teamAId, teamBId, teamMap]);

  const saveOutages = (next: PlayerOutage[]) => {
    setOutages(next);
    writeOutages(next);
  };

  const loading = !allGames || rosterStatus === 'loading' || rosterStatus === 'idle';
  const teamA = teamMap[teamAId];
  const teamB = teamMap[teamBId];

  const rosterByTeam = useMemo(() => {
    const out: { team: Team; players: string[] }[] = [];
    if (teamA) out.push({ team: teamA, players: getTeamPlayers(teamA.id, rosters) });
    if (teamB) out.push({ team: teamB, players: getTeamPlayers(teamB.id, rosters) });
    return out;
  }, [teamA, teamB, rosters]);

  return (
    <section className="reschedule">
      <div className="reschedule-hero">
        <p className="reschedule-kicker">Schedule helper</p>
        <h2>Reschedule Finder</h2>
        <p>Pick two teams to find open court slots that work for both rosters.</p>
      </div>

      <div className="rf-pairing" role="group" aria-label="Teams to compare">
        <TeamChip
          team={teamA}
          slotLabel={teamA ? 'Change team A' : 'Add Team A'}
          onPick={() => setPickingSlot('A')}
          onClear={() => setTeamAId(0)}
        />
        <span className="rf-pairing-sep" aria-hidden>vs</span>
        <TeamChip
          team={teamB}
          slotLabel={teamB ? 'Change team B' : 'Add Team B'}
          onPick={() => setPickingSlot('B')}
          onClear={() => setTeamBId(0)}
        />
      </div>

      {(teamA || teamB) && (
        <div className="rf-outages">
          <div className="rf-section-row">
            <div className="rf-section-title">Player outages</div>
            <button
              type="button"
              className={'rf-btn-secondary' + (outageEditorOpen ? ' active' : '')}
              onClick={() => setOutageEditorOpen((open) => !open)}
              aria-expanded={outageEditorOpen}
            >
              {outageEditorOpen ? 'Hide' : outages.length ? 'Add another' : 'Add outage'}
            </button>
          </div>

          {outages.length > 0 && (
            <div className="rf-outage-list">
              {outages
                .slice()
                .sort((a, b) => a.date.localeCompare(b.date) || a.player.localeCompare(b.player))
                .map((outage) => (
                  <div key={outage.id} className="rf-outage-chip">
                    <span className="rf-outage-chip-player">{outage.player}</span>
                    <span className="rf-outage-chip-date">{formatDateLong(outage.date)}</span>
                    <button
                      type="button"
                      className="rf-outage-chip-remove"
                      onClick={() => saveOutages(outages.filter((entry) => entry.id !== outage.id))}
                      aria-label={`Remove outage for ${outage.player}`}
                    >
                      &times;
                    </button>
                  </div>
                ))}
            </div>
          )}

          {outageEditorOpen && (
            <OutageEditor
              rosterByTeam={rosterByTeam}
              outages={outages}
              onAdd={(entries) => saveOutages([...outages, ...entries])}
              onClose={() => setOutageEditorOpen(false)}
            />
          )}

          {!outageEditorOpen && outages.length === 0 && (
            <p className="rf-outage-hint">Mark a player as unavailable to refine the recommendations.</p>
          )}
        </div>
      )}

      {!teamAId || !teamBId ? (
        <div className="summary no-games">Pick two teams to start scanning open court slots.</div>
      ) : loading ? (
        <Loading />
      ) : candidates.length === 0 ? (
        <div className="summary no-games">No open court slots found for this team pair in the next {SCAN_DAYS} days.</div>
      ) : (
        <div className="reschedule-results">
          <div className="rf-section-title">
            Best open slots for {teamA?.name || 'Team A'} vs {teamB?.name || 'Team B'}
          </div>
          {candidates.map((candidate) => {
            const isExpanded = expanded === candidate.id;
            return (
              <article key={candidate.id} className={`reschedule-card ${candidate.quality}`}>
                <button type="button" className="reschedule-card-main" onClick={() => setExpanded(isExpanded ? null : candidate.id)}>
                  <div>
                    <div className="reschedule-card-date">{formatDateLong(candidate.date)}</div>
                    <div className="reschedule-card-time">
                      {formatTime12(candidate.start)} · {candidate.court.name}
                    </div>
                  </div>
                  <div className="reschedule-fit">
                    <strong>{candidate.quality === 'great' ? 'Great' : candidate.quality === 'maybe' ? 'Maybe' : 'Thin'}</strong>
                    <span>
                      {candidate.teamA.available.length}/{candidate.teamA.rosterSize || '?'} · {candidate.teamB.available.length}/{candidate.teamB.rosterSize || '?'}
                    </span>
                  </div>
                </button>
                {isExpanded && (
                  <div className="reschedule-details">
                    <AvailabilityBlock title={teamA?.name || 'Team A'} team={candidate.teamA} />
                    <AvailabilityBlock title={teamB?.name || 'Team B'} team={candidate.teamB} />
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {pickingSlot && (
        <ReschedTeamModal
          leagues={leagues}
          teams={sortedTeams}
          title={pickingSlot === 'A' ? 'Choose Team A' : 'Choose Team B'}
          excludeTeamId={pickingSlot === 'A' ? teamBId : teamAId}
          onPick={(team) => {
            if (pickingSlot === 'A') setTeamAId(team.id);
            else setTeamBId(team.id);
            setPickingSlot(null);
          }}
          onClose={() => setPickingSlot(null)}
        />
      )}
    </section>
  );
}
