import { useEffect, useMemo, useState } from 'react';
import type { Game, Team, TeamRosterMap } from '../../types';
import type { TeamRosterStatus } from '../../hooks/useTeamRosters';
import { computeRecord, computeRecordBreakdown } from '../../utils/courts';
import { RecordBreakdownModal } from '../Season/RecordBreakdownModal';
import { collectPlayerTeams, PlayerTeamsModal, type PlayerTeamMatch } from './PlayerTeamsModal';

interface RosterModalTeam {
  id: number;
  name: string;
}

interface RosterModalProps {
  title: string;
  teams: RosterModalTeam[];
  rosters: TeamRosterMap;
  status: TeamRosterStatus;
  allGames?: Game[] | null;
  teamMap?: Record<number, Team>;
  onClose: () => void;
}

export function RosterModal({ title, teams, rosters, status, allGames, teamMap, onClose }: RosterModalProps) {
  const [activeRecordTeamId, setActiveRecordTeamId] = useState<number | null>(null);
  const [activePlayerName, setActivePlayerName] = useState<string | null>(null);
  const [drilldownTeam, setDrilldownTeam] = useState<RosterModalTeam | null>(null);
  const teamKey = useMemo(() => teams.map((team) => team.id).join(','), [teams]);

  useEffect(() => {
    setDrilldownTeam(null);
    setActivePlayerName(null);
    setActiveRecordTeamId(null);
  }, [teamKey, title]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);
  const activeRecord = useMemo(
    () => (activeRecordTeamId != null && allGames && teamMap ? computeRecordBreakdown(allGames, activeRecordTeamId, teamMap) : null),
    [activeRecordTeamId, allGames, teamMap],
  );
  const activePlayerTeams = useMemo(
    () => (activePlayerName ? collectPlayerTeams(activePlayerName, rosters, teamMap) : []),
    [activePlayerName, rosters, teamMap],
  );
  const displayedTeams = drilldownTeam ? [drilldownTeam] : teams;
  const displayedTitle = drilldownTeam?.name || title;
  const sharedLevelName = useMemo(() => {
    const levels = [...new Set(
      displayedTeams
        .map((team) => teamMap?.[team.id]?.leagueName?.trim() || '')
        .filter(Boolean),
    )];
    return levels.length === 1 ? levels[0] : '';
  }, [displayedTeams, teamMap]);

  return (
    <>
      <div className="roster-overlay" onClick={onClose}>
        <div
          className="roster-popup"
          role="dialog"
          aria-modal="true"
          aria-label={title}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="roster-header">
            <div>
              <div className="roster-kicker">Team Roster</div>
              <h3>{displayedTitle}</h3>
              {sharedLevelName && <div className="roster-level">{sharedLevelName}</div>}
            </div>
            <div className="roster-actions">
              {drilldownTeam && (
                <button type="button" className="roster-back" onClick={() => setDrilldownTeam(null)}>
                  Back
                </button>
              )}
              <button type="button" className="roster-close" onClick={onClose}>
                Close
              </button>
            </div>
          </div>

          <div className="roster-groups">
            {displayedTeams.map((team) => {
              const players = rosters[team.id]?.players ?? [];
              const syncedAt = rosters[team.id]?.syncedAt;
              const record = allGames ? computeRecord(allGames, team.id) : null;
              const levelName = teamMap?.[team.id]?.leagueName;

              return (
                <section key={team.id} className="roster-group">
                  <div className="roster-team-header">
                    <div>
                      <div className="roster-team-name">{team.name}</div>
                      {levelName && levelName !== sharedLevelName && (
                        <div className="roster-team-level">{levelName}</div>
                      )}
                    </div>
                    {record && (
                      <button
                        type="button"
                        className="standings-rec-btn"
                        onClick={() => setActiveRecordTeamId(team.id)}
                        aria-label={`Show ${team.name} record breakdown`}
                      >
                        {record.w}-{record.l}
                      </button>
                    )}
                  </div>
                  {players.length > 0 ? (
                    <>
                      <div className="roster-team-meta">
                        {players.length} {players.length === 1 ? 'player' : 'players'}
                      </div>
                      <div className="roster-player-list">
                        {players.map((player) => (
                          <button
                            key={player}
                            type="button"
                            className="roster-player"
                            onClick={() => setActivePlayerName(player)}
                            aria-label={`Show teams for ${player}`}
                          >
                            {player}
                          </button>
                        ))}
                      </div>
                      {syncedAt && <div className="roster-team-sync">Synced {new Date(syncedAt).toLocaleString()}</div>}
                    </>
                  ) : (
                    <div className="roster-empty">
                      {status === 'loading' || status === 'idle'
                        ? 'Roster snapshot still loading.'
                        : 'Roster unavailable right now.'}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </div>
      </div>
      {activeRecord && teamMap && (
        <RecordBreakdownModal
          teamId={activeRecord.teamId}
          teamName={teamMap[activeRecord.teamId]?.name || 'Team'}
          breakdown={activeRecord}
          rosters={rosters}
          rosterStatus={status}
          allGames={allGames ?? []}
          teamMap={teamMap}
          onClose={onClose}
        />
      )}
      {activePlayerName && (
        <PlayerTeamsModal
          playerName={activePlayerName}
          matches={activePlayerTeams}
          onSelectTeam={(match) => {
            setDrilldownTeam({ id: match.teamId, name: match.teamName });
            setActivePlayerName(null);
          }}
          onClose={onClose}
        />
      )}
    </>
  );
}
