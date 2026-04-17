import { useMemo, useState } from 'react';
import type { Game, Team, TeamRosterMap } from '../../types';
import type { TeamRosterStatus } from '../../hooks/useTeamRosters';
import { computeRecordBreakdown, computeStandings } from '../../utils/courts';
import { RecordBreakdownModal } from './RecordBreakdownModal';
import { RosterModal } from '../Common/RosterModal';

interface StandingsViewProps {
  allGames: Game[];
  teamMap: Record<number, Team>;
  myTeamObjs: Team[];
  myTeamIds: Set<number>;
  rosters: TeamRosterMap;
  rosterStatus: TeamRosterStatus;
}

export function StandingsView({ allGames, teamMap, myTeamObjs, myTeamIds, rosters, rosterStatus }: StandingsViewProps) {
  const [activeRecordTeamId, setActiveRecordTeamId] = useState<number | null>(null);
  const [activeRosterTeamId, setActiveRosterTeamId] = useState<number | null>(null);
  const leagueIds = useMemo(
    () => [...new Set(myTeamObjs.map((t) => t.leagueId))],
    [myTeamObjs],
  );
  const activeRecord = useMemo(
    () => (activeRecordTeamId ? computeRecordBreakdown(allGames, activeRecordTeamId, teamMap) : null),
    [activeRecordTeamId, allGames, teamMap],
  );
  const activeRosterTeam = activeRosterTeamId ? teamMap[activeRosterTeamId] : null;

  return (
    <>
      {leagueIds.map((lid) => {
        const lg = myTeamObjs.find((t) => t.leagueId === lid);
        const rows = computeStandings(allGames, teamMap, lid);

        return (
          <div key={lid} className="standings">
            <div className="standings-title">{lg?.leagueName || 'League'}</div>
            <table>
              <thead>
                <tr>
                  <th className="rank">#</th>
                  <th>Team</th>
                  <th className="rec">Record</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id} className={myTeamIds.has(r.id) ? 'me' : ''}>
                    <td className="rank">{i + 1}</td>
                    <td>
                      <button
                        type="button"
                        className="standings-team-btn"
                        onClick={() => setActiveRosterTeamId(r.id)}
                        aria-label={`Show ${r.name} roster`}
                      >
                        {r.name}
                      </button>
                    </td>
                    <td className="rec">
                      <button
                        type="button"
                        className="standings-rec-btn"
                        onClick={() => setActiveRecordTeamId(r.id)}
                        aria-label={`Show ${r.name} record breakdown`}
                      >
                        {r.w}-{r.l}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
      {activeRecord && (
        <RecordBreakdownModal
          teamId={activeRecord.teamId}
          teamName={teamMap[activeRecord.teamId]?.name || 'Team'}
          breakdown={activeRecord}
          rosters={rosters}
          rosterStatus={rosterStatus}
          allGames={allGames}
          teamMap={teamMap}
          onClose={() => setActiveRecordTeamId(null)}
        />
      )}
      {activeRosterTeam && (
        <RosterModal
          title={activeRosterTeam.name}
          teams={[{ id: activeRosterTeam.id, name: activeRosterTeam.name }]}
          rosters={rosters}
          status={rosterStatus}
          allGames={allGames}
          teamMap={teamMap}
          onClose={() => setActiveRosterTeamId(null)}
        />
      )}
    </>
  );
}
