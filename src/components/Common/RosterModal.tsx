import { useEffect, useMemo, useState } from 'react';
import type { Game, Team, TeamRosterMap } from '../../types';
import type { TeamRosterStatus } from '../../hooks/useTeamRosters';
import { computeRecord, computeRecordBreakdown } from '../../utils/courts';
import { RecordBreakdownModal } from '../Season/RecordBreakdownModal';

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
              <h3>{title}</h3>
            </div>
            <button type="button" className="roster-close" onClick={onClose}>
              Close
            </button>
          </div>

          <div className="roster-groups">
            {teams.map((team) => {
              const players = rosters[team.id]?.players ?? [];
              const syncedAt = rosters[team.id]?.syncedAt;
              const record = allGames ? computeRecord(allGames, team.id) : null;

              return (
                <section key={team.id} className="roster-group">
                  <div className="roster-team-header">
                    <div className="roster-team-name">{team.name}</div>
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
                          <div key={player} className="roster-player">
                            {player}
                          </div>
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
          onClose={() => setActiveRecordTeamId(null)}
        />
      )}
    </>
  );
}
