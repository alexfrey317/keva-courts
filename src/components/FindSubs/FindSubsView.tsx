import { useMemo, useState } from 'react';
import type { Game, Team, TeamRosterMap } from '../../types';
import type { TeamRosterStatus } from '../../hooks/useTeamRosters';
import { Loading } from '../Common/Loading';
import { RosterModal } from '../Common/RosterModal';
import { collectPlayerTeams, PlayerTeamsModal, type PlayerTeamMatch } from '../Common/PlayerTeamsModal';

type SubLevel = 'upper' | 'high-intermediate' | 'intermediate' | 'recreational';

interface FindSubsViewProps {
  teams: Team[];
  teamMap: Record<number, Team>;
  rosters: TeamRosterMap;
  rosterStatus: TeamRosterStatus;
  allSeasonGames: Game[] | null;
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

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function normalizePlayerName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

function isEpicLeague(team: Team): boolean {
  return /epic/i.test(team.leagueName);
}

function getTeamLevel(team: Team): SubLevel | null {
  const leagueName = team.leagueName.toLowerCase();
  if (leagueName.includes('upper')) return 'upper';
  if (/high[\s-]*(intermediate|int)/.test(leagueName)) return 'high-intermediate';
  if (leagueName.includes('recreational') || /\brec\b/.test(leagueName)) return 'recreational';
  if (leagueName.includes('intermediate') || /\bint\b/.test(leagueName)) return 'intermediate';
  return null;
}

function teamNameForMatch(match: PlayerTeamMatch): string {
  return match.teamName || `Team ${match.teamId}`;
}

export function FindSubsView({ teams, teamMap, rosters, rosterStatus, allSeasonGames }: FindSubsViewProps) {
  const [level, setLevel] = useState<SubLevel>('high-intermediate');
  const [search, setSearch] = useState('');
  const [activePlayerName, setActivePlayerName] = useState<string | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<{ id: number; name: string } | null>(null);

  const playersByLevel = useMemo(() => {
    const levelPlayers: Record<SubLevel, Map<string, SubPlayer>> = {
      upper: new Map(),
      'high-intermediate': new Map(),
      intermediate: new Map(),
      recreational: new Map(),
    };

    for (const team of teams) {
      if (!isEpicLeague(team)) continue;
      const teamLevel = getTeamLevel(team);
      if (!teamLevel) continue;

      const players = rosters[team.id]?.players ?? [];
      for (const rawPlayer of players) {
        const player = rawPlayer.trim().replace(/\s+/g, ' ');
        const key = normalizePlayerName(player);
        if (!key) continue;

        const existing = levelPlayers[teamLevel].get(key);
        if (existing) existing.teams += 1;
        else levelPlayers[teamLevel].set(key, { name: player, teams: 1 });
      }
    }

    return levelPlayers;
  }, [rosters, teams]);

  const allPlayers = useMemo(
    () => [...playersByLevel[level].values()].sort((a, b) => collator.compare(a.name, b.name)),
    [level, playersByLevel],
  );
  const visiblePlayers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return allPlayers;
    return allPlayers.filter((player) => player.name.toLowerCase().includes(query));
  }, [allPlayers, search]);
  const activePlayerTeams = useMemo(
    () => (activePlayerName ? collectPlayerTeams(activePlayerName, rosters, teamMap) : []),
    [activePlayerName, rosters, teamMap],
  );
  const rosterPending = rosterStatus === 'loading' || rosterStatus === 'idle';

  return (
    <section className="find-subs">
      <div className="find-subs-hero">
        <div>
          <p className="find-subs-kicker">Epic subs</p>
          <h2>Find Subs</h2>
          <p>Pick a level to see unique Epic league players across every day.</p>
        </div>
        <div className="find-subs-count">
          <strong>{allPlayers.length}</strong>
          <span>{allPlayers.length === 1 ? 'player' : 'players'}</span>
        </div>
      </div>

      <div className="find-subs-levels" role="group" aria-label="Sub level">
        {LEVELS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={level === entry.id ? 'active' : ''}
            onClick={() => setLevel(entry.id)}
          >
            {entry.label}
          </button>
        ))}
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
              onClick={() => setActivePlayerName(player.name)}
              aria-label={`Show teams for ${player.name}`}
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
                  ? 'No Epic players match that search.'
                  : 'No Epic players found for this level yet.'}
            </div>
          )}
        </div>
      )}

      {activePlayerName && (
        <PlayerTeamsModal
          playerName={activePlayerName}
          matches={activePlayerTeams}
          onSelectTeam={(match) => {
            setSelectedTeam({ id: match.teamId, name: teamNameForMatch(match) });
            setActivePlayerName(null);
          }}
          onClose={() => setActivePlayerName(null)}
        />
      )}

      {selectedTeam && (
        <RosterModal
          title={selectedTeam.name}
          teams={[selectedTeam]}
          rosters={rosters}
          status={rosterStatus}
          allGames={allSeasonGames}
          teamMap={teamMap}
          onClose={() => setSelectedTeam(null)}
        />
      )}
    </section>
  );
}
