import { useMemo, useState } from 'react';
import type { Game, Team, TeamRosterMap } from '../../types';
import { computeRecordBreakdown, computeStandings } from '../../utils/courts';
import { RecordBreakdownModal } from './RecordBreakdownModal';
import { TeamRosterName } from '../Common/TeamRosterName';

interface StandingsViewProps {
  allGames: Game[];
  teamMap: Record<number, Team>;
  myTeamObjs: Team[];
  myTeamIds: Set<number>;
  rosters: TeamRosterMap;
}

export function StandingsView({ allGames, teamMap, myTeamObjs, myTeamIds, rosters }: StandingsViewProps) {
  const [activeRecordTeamId, setActiveRecordTeamId] = useState<number | null>(null);
  const leagueIds = useMemo(
    () => [...new Set(myTeamObjs.map((t) => t.leagueId))],
    [myTeamObjs],
  );
  const activeRecord = useMemo(
    () => (activeRecordTeamId ? computeRecordBreakdown(allGames, activeRecordTeamId, teamMap) : null),
    [activeRecordTeamId, allGames, teamMap],
  );

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
                    <td><TeamRosterName teamId={r.id} name={r.name} rosters={rosters} /></td>
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
          teamName={teamMap[activeRecord.teamId]?.name || 'Team'}
          breakdown={activeRecord}
          onClose={() => setActiveRecordTeamId(null)}
        />
      )}
    </>
  );
}
