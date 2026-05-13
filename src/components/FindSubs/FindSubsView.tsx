import { useMemo, useState } from 'react';
import type { Team, TeamRosterMap } from '../../types';
import type { TeamRosterStatus } from '../../hooks/useTeamRosters';
import { Loading } from '../Common/Loading';
import { collectPlayerTeams } from '../Common/PlayerTeamsModal';

type SubLevel = 'upper' | 'high-intermediate' | 'intermediate' | 'recreational';
type SubSurface = 'indoor' | 'sand';
type SubPlayerBuckets = Record<SubSurface, Record<SubLevel, Map<string, SubPlayer>>>;

interface FindSubsViewProps {
  teams: Team[];
  teamMap: Record<number, Team>;
  rosters: TeamRosterMap;
  rosterStatus: TeamRosterStatus;
  onViewPlayerSchedule: (playerName: string, teamIds: number[]) => void;
}

interface SubPlayer {
  name: string;
  teams: number;
}

const LEVELS: Array<{ id: SubLevel; label: string }> = [
  { id: 'upper', label: 'Upper' },
  { id: 'high-intermediate', label: 'High-Intermediate' },
  { id: 'intermediate', label: 'Intermediate' },
  { id: 'recreational', label: 'Recreational' },
];

const SURFACES: Array<{ id: SubSurface; label: string }> = [
  { id: 'indoor', label: 'Indoor' },
  { id: 'sand', label: 'Sand' },
];

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function normalizePlayerName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

function getLeagueText(team: Team): string {
  return `${team.rawLeagueName || ''} ${team.leagueName}`.trim();
}

function isEpicLeague(team: Team): boolean {
  return /epic/i.test(getLeagueText(team));
}

function isSandLeague(team: Team): boolean {
  return /sand/i.test(getLeagueText(team));
}

function getTeamLevel(team: Team): SubLevel | null {
  const leagueName = getLeagueText(team).toLowerCase();
  if (leagueName.includes('upper')) return 'upper';
  if (/high[\s-]*(intermediate|int)/.test(leagueName)) return 'high-intermediate';
  if (leagueName.includes('recreational') || /\brec\b/.test(leagueName)) return 'recreational';
  if (leagueName.includes('intermediate') || /\bint\b/.test(leagueName)) return 'intermediate';
  return null;
}

function createLevelBuckets(): Record<SubLevel, Map<string, SubPlayer>> {
  return {
    upper: new Map(),
    'high-intermediate': new Map(),
    intermediate: new Map(),
    recreational: new Map(),
  };
}

function createPlayerBuckets(): SubPlayerBuckets {
  return {
    indoor: createLevelBuckets(),
    sand: createLevelBuckets(),
  };
}

function countSurfacePlayers(playersBySurface: SubPlayerBuckets, surface: SubSurface): number {
  const names = new Set<string>();
  for (const entry of LEVELS) {
    for (const key of playersBySurface[surface][entry.id].keys()) names.add(key);
  }
  return names.size;
}

export function FindSubsView({ teams, teamMap, rosters, rosterStatus, onViewPlayerSchedule }: FindSubsViewProps) {
  const [surface, setSurface] = useState<SubSurface>('indoor');
  const [level, setLevel] = useState<SubLevel>('high-intermediate');
  const [search, setSearch] = useState('');

  const playersBySurface = useMemo(() => {
    const surfacePlayers = createPlayerBuckets();

    for (const team of teams) {
      if (!isEpicLeague(team)) continue;
      const teamLevel = getTeamLevel(team);
      if (!teamLevel) continue;
      const teamSurface = isSandLeague(team) ? 'sand' : 'indoor';

      const players = rosters[team.id]?.players ?? [];
      for (const rawPlayer of players) {
        const player = rawPlayer.trim().replace(/\s+/g, ' ');
        const key = normalizePlayerName(player);
        if (!key) continue;

        const existing = surfacePlayers[teamSurface][teamLevel].get(key);
        if (existing) existing.teams += 1;
        else surfacePlayers[teamSurface][teamLevel].set(key, { name: player, teams: 1 });
      }
    }

    return surfacePlayers;
  }, [rosters, teams]);

  const selectedSurfaceLabel = SURFACES.find((entry) => entry.id === surface)?.label ?? 'Indoor';
  const selectedLevelLabel = LEVELS.find((entry) => entry.id === level)?.label ?? 'Level';
  const allPlayers = useMemo(
    () => [...playersBySurface[surface][level].values()].sort((a, b) => collator.compare(a.name, b.name)),
    [level, playersBySurface, surface],
  );
  const visiblePlayers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return allPlayers;
    return allPlayers.filter((player) => player.name.toLowerCase().includes(query));
  }, [allPlayers, search]);
  const rosterPending = rosterStatus === 'loading' || rosterStatus === 'idle';
  const viewPlayerSchedule = (playerName: string) => {
    const teamIds = [...new Set(collectPlayerTeams(playerName, rosters, teamMap).map((match) => match.teamId))];
    if (teamIds.length > 0) onViewPlayerSchedule(playerName, teamIds);
  };
  const selectSurface = (nextSurface: SubSurface) => {
    setSurface(nextSurface);
    setSearch('');
  };
  const selectLevel = (nextLevel: SubLevel) => {
    setLevel(nextLevel);
    setSearch('');
  };

  return (
    <section className="find-subs">
      <div className="find-subs-hero">
        <div>
          <p className="find-subs-kicker">Epic subs</p>
          <h2>Find Subs</h2>
          <p>Pick indoor or sand, choose a level, then tap a name to view their schedule.</p>
        </div>
        <div className="find-subs-count">
          <strong>{allPlayers.length}</strong>
          <span>{selectedSurfaceLabel} {allPlayers.length === 1 ? 'player' : 'players'}</span>
        </div>
      </div>

      <div className="find-subs-filters">
        <div className="find-subs-surfaces" role="group" aria-label="Sub surface">
          {SURFACES.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={surface === entry.id ? 'active' : ''}
              onClick={() => selectSurface(entry.id)}
              aria-pressed={surface === entry.id}
            >
              <span>{entry.label}</span>
              <small>{countSurfacePlayers(playersBySurface, entry.id)}</small>
            </button>
          ))}
        </div>

        <div className="find-subs-levels" role="group" aria-label="Sub level">
          {LEVELS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={level === entry.id ? 'active' : ''}
              onClick={() => selectLevel(entry.id)}
              aria-pressed={level === entry.id}
            >
              <span>{entry.label}</span>
              <small>{playersBySurface[surface][entry.id].size}</small>
            </button>
          ))}
        </div>
      </div>

      <label className="find-subs-search">
        <span>Search players</span>
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Type a player name..."
        />
      </label>

      {rosterPending && allPlayers.length === 0 ? (
        <Loading />
      ) : (
        <div className="find-subs-list" aria-live="polite">
          {visiblePlayers.map((player) => (
            <button
              key={normalizePlayerName(player.name)}
              type="button"
              className="find-sub-player"
              onClick={() => viewPlayerSchedule(player.name)}
              aria-label={`View schedule for ${player.name}`}
            >
              <span>{player.name}</span>
              {player.teams > 1 && <small>{player.teams} teams</small>}
            </button>
          ))}
          {visiblePlayers.length === 0 && (
            <div className="find-subs-empty">
              {rosterStatus === 'error'
                ? 'Roster snapshot is unavailable right now.'
                : rosterPending
                  ? 'Roster snapshot still loading.'
                : search.trim()
                  ? `No Epic ${selectedSurfaceLabel.toLowerCase()} ${selectedLevelLabel.toLowerCase()} players match that search.`
                  : `No Epic ${selectedSurfaceLabel.toLowerCase()} ${selectedLevelLabel.toLowerCase()} players found yet.`}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
