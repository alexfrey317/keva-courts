import type { Team, TeamRosterMap } from '../../types';

export interface PlayerTeamMatch {
  teamId: number;
  teamName: string;
  leagueName: string;
  isEpic: boolean;
}

function normalizePlayerName(name: string): string {
  return name.trim().toLowerCase();
}

export function collectPlayerTeams(
  playerName: string,
  rosters: TeamRosterMap,
  teamMap?: Record<number, Team>,
): PlayerTeamMatch[] {
  const target = normalizePlayerName(playerName);
  if (!target) return [];

  const matches: PlayerTeamMatch[] = [];
  for (const roster of Object.values(rosters)) {
    if (!roster.players.some((player) => normalizePlayerName(player) === target)) continue;

    const team = teamMap?.[roster.teamId];
    const leagueName = team?.leagueName || '';
    matches.push({
      teamId: roster.teamId,
      teamName: team?.name || roster.teamName,
      leagueName,
      isEpic: /epic/i.test(leagueName) || /epic/i.test(team?.name || roster.teamName),
    });
  }

  return matches.sort(
    (a, b) =>
      Number(b.isEpic) - Number(a.isEpic) ||
      a.leagueName.localeCompare(b.leagueName) ||
      a.teamName.localeCompare(b.teamName),
  );
}

export function PlayerTeamsModal({
  playerName,
  matches,
  onSelectTeam,
  onClose,
}: {
  playerName: string;
  matches: PlayerTeamMatch[];
  onSelectTeam: (match: PlayerTeamMatch) => void;
  onClose: () => void;
}) {
  const epicTeams = matches.filter((match) => match.isEpic);
  const otherTeams = matches.filter((match) => !match.isEpic);

  return (
    <div className="player-teams-overlay" onClick={onClose}>
      <div
        className="player-teams-popup"
        role="dialog"
        aria-modal="true"
        aria-label={`${playerName} teams`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="player-teams-header">
          <div>
            <div className="player-teams-kicker">Player Teams</div>
            <h3>{playerName}</h3>
          </div>
          <button type="button" className="player-teams-close" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="player-teams-groups">
          {epicTeams.length > 0 && (
            <section className="player-teams-group">
              <div className="player-teams-group-title">Epic Teams</div>
              <div className="player-teams-list">
                {epicTeams.map((match) => (
                  <button
                    key={match.teamId}
                    type="button"
                    className="player-team-row"
                    onClick={() => onSelectTeam(match)}
                    aria-label={`Show ${match.teamName} roster`}
                  >
                    <div className="player-team-name">{match.teamName}</div>
                    {match.leagueName && <div className="player-team-league">{match.leagueName}</div>}
                  </button>
                ))}
              </div>
            </section>
          )}

          {otherTeams.length > 0 && (
            <section className="player-teams-group">
              <div className="player-teams-group-title">Other Teams</div>
              <div className="player-teams-list">
                {otherTeams.map((match) => (
                  <button
                    key={match.teamId}
                    type="button"
                    className="player-team-row"
                    onClick={() => onSelectTeam(match)}
                    aria-label={`Show ${match.teamName} roster`}
                  >
                    <div className="player-team-name">{match.teamName}</div>
                    {match.leagueName && <div className="player-team-league">{match.leagueName}</div>}
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
