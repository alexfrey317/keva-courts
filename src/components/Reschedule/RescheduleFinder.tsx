import { useMemo, useState } from 'react';
import type { Court, Game, Grid, Team, TeamRosterMap } from '../../types';
import type { TeamRosterStatus } from '../../hooks/useTeamRosters';
import { buildGrid, discoverCourts, isOpenSlotLikely } from '../../utils/courts';
import { compareDateTime, formatDateLong, formatTime12, getSlotsForDay, isStandardVbDay, mergeSlotsWithGameStarts, toDateStr, toMinutes } from '../../utils/dates';
import { collectPlayerTeams } from '../Common/PlayerTeamsModal';
import { Loading } from '../Common/Loading';

const OUTAGE_KEY = 'keva-reschedule-outages:v1';
const SCAN_DAYS = 45;
const MIN_PLAYERS = 4;

interface RescheduleFinderProps {
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
  start: string;
  end: string;
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

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

function readOutages(): PlayerOutage[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(OUTAGE_KEY) || '[]') as PlayerOutage[];
    return Array.isArray(parsed) ? parsed.filter((entry) => entry.player && entry.date) : [];
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
    players.some((player) => normalizeName(player) === normalizeName(outage.player)) &&
    (!outage.start || !outage.end || overlaps(start, end, outage.start, outage.end)),
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

function TeamSelect({
  id,
  label,
  teams,
  value,
  exclude,
  onChange,
}: {
  id: string;
  label: string;
  teams: Team[];
  value: number;
  exclude: number;
  onChange: (teamId: number) => void;
}) {
  return (
    <label className="reschedule-field">
      <span>{label}</span>
      <select id={id} value={value || ''} onChange={(event) => onChange(Number(event.target.value))}>
        <option value="">Choose a team...</option>
        {teams.filter((team) => team.id !== exclude).map((team) => (
          <option key={team.id} value={team.id}>
            {team.name} · {team.leagueName}
          </option>
        ))}
      </select>
    </label>
  );
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

export function RescheduleFinder({ teams, teamMap, allGames, rosters, rosterStatus }: RescheduleFinderProps) {
  const sortedTeams = useMemo(
    () => teams.slice().sort((a, b) => a.leagueName.localeCompare(b.leagueName) || collator.compare(a.name, b.name)),
    [teams],
  );
  const [teamAId, setTeamAId] = useState(0);
  const [teamBId, setTeamBId] = useState(0);
  const [outages, setOutages] = useState<PlayerOutage[]>(readOutages);
  const [outagePlayer, setOutagePlayer] = useState('');
  const [outageDate, setOutageDate] = useState(toDateStr(new Date()));
  const [outageStart, setOutageStart] = useState('');
  const [outageEnd, setOutageEnd] = useState('');
  const [outageNote, setOutageNote] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const candidatePlayers = useMemo(() => {
    const names = new Set<string>();
    for (const teamId of [teamAId, teamBId]) {
      for (const player of getTeamPlayers(teamId, rosters)) names.add(player);
    }
    return [...names].sort((a, b) => collator.compare(a, b));
  }, [rosters, teamAId, teamBId]);

  const candidates = useMemo(() => {
    if (!teamAId || !teamBId || !allGames) return [];
    return buildCandidates(teamAId, teamBId, allGames, rosters, teamMap, outages);
  }, [allGames, outages, rosters, teamAId, teamBId, teamMap]);

  const saveOutages = (next: PlayerOutage[]) => {
    setOutages(next);
    writeOutages(next);
  };

  const addOutage = () => {
    const player = outagePlayer.trim().replace(/\s+/g, ' ');
    if (!player || !outageDate) return;
    saveOutages([
      ...outages,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        player,
        date: outageDate,
        start: outageStart,
        end: outageEnd,
        note: outageNote.trim(),
      },
    ]);
    setOutagePlayer('');
    setOutageStart('');
    setOutageEnd('');
    setOutageNote('');
  };

  const loading = !allGames || rosterStatus === 'loading' || rosterStatus === 'idle';
  const teamA = teamMap[teamAId];
  const teamB = teamMap[teamBId];

  return (
    <section className="reschedule">
      <div className="reschedule-hero">
        <div>
          <p className="reschedule-kicker">Schedule helper</p>
          <h2>Reschedule Finder</h2>
          <p>Pick two teams to find open court slots, inferred player conflicts, and manually entered outages.</p>
        </div>
      </div>

      <div className="reschedule-picker">
        <TeamSelect id="reschedule-team-a" label="Team A" teams={sortedTeams} value={teamAId} exclude={teamBId} onChange={setTeamAId} />
        <TeamSelect id="reschedule-team-b" label="Team B" teams={sortedTeams} value={teamBId} exclude={teamAId} onChange={setTeamBId} />
      </div>

      {(teamA || teamB) && (
        <div className="reschedule-outages">
          <div className="reschedule-section-title">Player outages</div>
          <div className="reschedule-outage-form">
            <label>
              <span>Player</span>
              <input
                list="reschedule-player-options"
                value={outagePlayer}
                onChange={(event) => setOutagePlayer(event.target.value)}
                placeholder="Player name..."
              />
              <datalist id="reschedule-player-options">
                {candidatePlayers.map((player) => <option key={player} value={player} />)}
              </datalist>
            </label>
            <label>
              <span>Date</span>
              <input type="date" value={outageDate} onChange={(event) => setOutageDate(event.target.value)} />
            </label>
            <label>
              <span>Start</span>
              <input type="time" value={outageStart} onChange={(event) => setOutageStart(event.target.value)} />
            </label>
            <label>
              <span>End</span>
              <input type="time" value={outageEnd} onChange={(event) => setOutageEnd(event.target.value)} />
            </label>
            <label className="reschedule-note-field">
              <span>Note</span>
              <input value={outageNote} onChange={(event) => setOutageNote(event.target.value)} placeholder="Optional..." />
            </label>
            <button type="button" onClick={addOutage}>Add outage</button>
          </div>
          {outages.length > 0 && (
            <div className="reschedule-outage-list">
              {outages.map((outage) => (
                <div key={outage.id} className="reschedule-outage-chip">
                  <span>
                    {outage.player} · {outage.date}
                    {outage.start && outage.end ? ` ${formatTime12(outage.start)}-${formatTime12(outage.end)}` : ' all day'}
                    {outage.note ? ` · ${outage.note}` : ''}
                  </span>
                  <button type="button" onClick={() => saveOutages(outages.filter((entry) => entry.id !== outage.id))}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
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
          <div className="reschedule-section-title">
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
    </section>
  );
}
