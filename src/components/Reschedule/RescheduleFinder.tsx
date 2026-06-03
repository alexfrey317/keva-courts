import { useMemo, useState } from 'react';
import type { Court, Game, Grid, League, Team, TeamRosterMap } from '../../types';
import type { TeamRosterStatus } from '../../hooks/useTeamRosters';
import { buildGrid, discoverCourts, isOpenSlotLikely } from '../../utils/courts';
import { compareDateTime, formatDateLong, formatTime12, getSlotsForDay, isStandardVbDay, mergeSlotsWithGameStarts, toDateStr, toMinutes } from '../../utils/dates';
import { collectPlayerTeams } from '../Common/PlayerTeamsModal';
import { Loading } from '../Common/Loading';
import { ReschedTeamModal } from './ReschedTeamModal';

const OUTAGE_KEY = 'keva-reschedule-outages:v1';
const SCAN_DAYS = 45;
const OUTAGE_DATE_CHIPS = 21;
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

const SHORT_DAY = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
const SHORT_MONTH_DAY = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

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
  onAdd: (entry: PlayerOutage) => void;
  onClose: () => void;
}

function buildDateChips(count: number): { iso: string; weekday: string; label: string; isToday: boolean }[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = toDateStr(today);
  const out: { iso: string; weekday: string; label: string; isToday: boolean }[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const iso = toDateStr(d);
    out.push({
      iso,
      weekday: SHORT_DAY.format(d),
      label: SHORT_MONTH_DAY.format(d),
      isToday: iso === todayStr,
    });
  }
  return out;
}

function OutageEditor({ rosterByTeam, outages, onAdd, onClose }: OutageEditorProps) {
  const [player, setPlayer] = useState('');
  const [date, setDate] = useState(() => toDateStr(new Date()));
  const dateChips = useMemo(() => buildDateChips(OUTAGE_DATE_CHIPS), []);
  const canAdd = player && date;

  const existingKey = (p: string, d: string) => `${normalizeName(p)}|${d}`;
  const existing = useMemo(() => new Set(outages.map((entry) => existingKey(entry.player, entry.date))), [outages]);

  const submit = () => {
    if (!canAdd) return;
    onAdd({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      player,
      date,
      note: '',
    });
    setPlayer('');
  };

  return (
    <div className="rf-outage-editor">
      <div className="rf-outage-step">
        <div className="rf-outage-step-label">When?</div>
        <div className="rf-date-strip" role="radiogroup" aria-label="Choose date">
          {dateChips.map((chip) => (
            <button
              key={chip.iso}
              type="button"
              role="radio"
              aria-checked={chip.iso === date}
              className={'rf-date-chip' + (chip.iso === date ? ' active' : '') + (chip.isToday ? ' today' : '')}
              onClick={() => setDate(chip.iso)}
            >
              <span className="rf-date-chip-dow">{chip.weekday}</span>
              <span className="rf-date-chip-day">{chip.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="rf-outage-step">
        <div className="rf-outage-step-label">Who's out?</div>
        {rosterByTeam.every((entry) => entry.players.length === 0) ? (
          <div className="rf-empty-note">Rosters aren't loaded yet. Try again in a moment.</div>
        ) : (
          rosterByTeam.map(({ team, players }) => (
            <div key={team.id} className="rf-roster-group">
              <div className="rf-roster-group-title">{team.name}</div>
              <div className="rf-player-grid">
                {players.length === 0 ? (
                  <div className="rf-empty-note">No roster on file.</div>
                ) : (
                  players.map((name) => {
                    const already = existing.has(existingKey(name, date));
                    const selected = name === player;
                    return (
                      <button
                        key={name}
                        type="button"
                        className={'rf-player-chip' + (selected ? ' active' : '') + (already ? ' already' : '')}
                        onClick={() => setPlayer(selected ? '' : name)}
                        disabled={already}
                        title={already ? 'Already marked out for this date' : undefined}
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
        <button type="button" className="rf-btn-primary" onClick={submit} disabled={!canAdd}>
          Mark out
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
    return buildCandidates(teamAId, teamBId, allGames, rosters, teamMap, outages);
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
              onAdd={(entry) => saveOutages([...outages, entry])}
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
