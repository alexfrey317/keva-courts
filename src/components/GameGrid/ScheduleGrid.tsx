import { Fragment, useState } from 'react';
import type { Grid, Court, Team, Game, Theme, TeamRosterMap } from '../../types';
import type { TeamRosterStatus } from '../../hooks/useTeamRosters';
import { formatTime12, toMinutes, isToday, nowMinutes } from '../../utils/dates';
import { getTeamColor } from '../../utils/theme';
import { isOpenSlotLikely } from '../../utils/courts';
import { RosterModal } from '../Common/RosterModal';

interface ScheduleGridProps {
  grid: Grid;
  courts: Court[];
  teamMap?: Record<number, Team>;
  hideOpen?: boolean;
  vbStart: Record<string, number>;
  teamColors?: Map<number, number>;
  theme?: Theme;
  showNow?: boolean;
  dateStr: string;
  rawGames?: Game[];
  allTeamMap?: Record<number, Team>;
  rosters?: TeamRosterMap;
  rosterStatus?: TeamRosterStatus;
  allSeasonGames?: Game[] | null;
  tournamentSeason?: boolean;
}

export function ScheduleGrid({
  grid,
  courts,
  teamMap,
  hideOpen,
  vbStart,
  teamColors,
  theme = 'dark',
  showNow,
  dateStr,
  rawGames,
  allTeamMap,
  rosters = {},
  rosterStatus = 'idle',
  allSeasonGames,
  tournamentSeason,
}: ScheduleGridProps) {
  const [activeRosterTeams, setActiveRosterTeams] = useState<Array<{ id: number; name: string }> | null>(null);
  if (!courts.length) return null;

  let hasWarn = false;
  const now = showNow && isToday(dateStr) ? nowMinutes() : -1;

  return (
    <>
      <div
        className="grid"
        style={{ gridTemplateColumns: `minmax(52px,64px) repeat(${courts.length},1fr)` }}
      >
        <div className="g-hdr" />
        {courts.map((c) => (
          <div key={c.key} className="g-hdr">{c.name}</div>
        ))}

        {grid.rows.map((row) => {
          const rowClass = row.allBooked ? ' row-full' : '';
          const slotMin = toMinutes(row.time);
          const slotEnd = slotMin + 50;
          const isNow = now >= slotMin && now < slotEnd;

          return (
            <Fragment key={row.time}>
              <div className={'g-time' + rowClass + (isNow ? ' now-slot' : '')}>
                {formatTime12(row.time)}
              </div>

              {row.cells.map((cell, i) => {
                // My game cell — highlighted with team color
                if (cell.myGame) {
                  const myName = cell.myTid && teamMap?.[cell.myTid]?.name;
                  const oppName = cell.oppId && teamMap?.[cell.oppId]?.name;
                  const ci = teamColors?.get(cell.myTid!);
                  const cc = ci !== undefined ? getTeamColor(ci, theme) : null;
                  const style = cc
                    ? {
                        background: `linear-gradient(135deg,${cc.bg1},${cc.bg2})`,
                        color: cc.t,
                        border: `1px solid ${cc.b}`,
                        textShadow: `0 0 10px ${cc.t}33`,
                      }
                    : {};
                  const sc = cell.score;
                  const scoreStr = sc
                    ? ` (${sc.myIsHome ? sc.h : sc.v}-${sc.myIsHome ? sc.v : sc.h})`
                    : '';

                  return (
                    <button
                      key={i}
                      type="button"
                      className="g-cell my-game g-cell-actionable"
                      style={style}
                      onClick={() => {
                        const teams = [
                          myName ? { id: cell.myTid!, name: myName } : null,
                          oppName ? { id: cell.oppId!, name: oppName } : null,
                        ].filter((team): team is { id: number; name: string } => Boolean(team));
                        if (teams.length > 0) setActiveRosterTeams(teams);
                      }}
                      aria-label={
                        oppName && myName
                          ? `Show rosters for ${myName} and ${oppName}`
                          : myName
                            ? `Show ${myName} roster`
                            : 'Show team roster'
                      }
                    >
                      {myName && (
                        <>
                          {myName}
                          <br />
                        </>
                      )}
                      {oppName ? (
                        <>
                          vs {oppName}
                          {scoreStr}
                        </>
                      ) : 'YOUR GAME'}
                    </button>
                  );
                }

                // Hidden open slot (My Team view with open courts hidden)
                if (!cell.booked && hideOpen) {
                  return (
                    <div key={i} className="g-cell booked">{'\u2014'}</div>
                  );
                }

                // Open slot
                if (!cell.booked) {
                  if (tournamentSeason) {
                    return (
                      <div key={i} className="g-cell open-tournament">
                        OPEN?<br />tourney
                      </div>
                    );
                  }

                  const netUp = isOpenSlotLikely(courts[i], slotMin, vbStart);
                  if (!netUp) hasWarn = true;

                  return (
                    <div key={i} className={'g-cell ' + (netUp ? 'open' : 'open-warn')}>
                      {netUp ? 'OPEN' : <>OPEN<br />net?</>}
                    </div>
                  );
                }

                // Booked cell — show team names if available
                const game =
                  rawGames && courts[i]
                    ? rawGames.find(
                        (g) =>
                          g.res === courts[i].res &&
                          g.area === courts[i].area &&
                          toMinutes(g.start) <= slotMin &&
                          slotMin < toMinutes(g.end),
                      )
                    : null;
                const homeName = game && allTeamMap ? allTeamMap[game.ht]?.name : '';
                const visitName = game && allTeamMap ? allTeamMap[game.vt]?.name : '';

                return (
                  <button
                    key={i}
                    type="button"
                    className={'g-cell booked g-cell-actionable' + rowClass}
                    onClick={() => {
                      const teams = [
                        homeName ? { id: game!.ht, name: homeName } : null,
                        visitName ? { id: game!.vt, name: visitName } : null,
                      ].filter((team): team is { id: number; name: string } => Boolean(team));
                      if (teams.length > 0) setActiveRosterTeams(teams);
                    }}
                    aria-label={
                      homeName && visitName
                        ? `Show rosters for ${homeName} and ${visitName}`
                        : homeName
                          ? `Show ${homeName} roster`
                          : 'Show team roster'
                    }
                    title={homeName && visitName ? `${homeName} vs ${visitName}` : ''}
                  >
                    {homeName ? (
                      <span className="booked-teams">
                        {homeName}
                        <br />
                        vs {visitName || 'TBD'}
                      </span>
                    ) : (
                      '\u2014'
                    )}
                  </button>
                );
              })}
            </Fragment>
          );
        })}
      </div>

      {tournamentSeason && !hideOpen && (
        <div className="grid-legend">
          <span><span className="legend-dot tournament" />Tournament schedule</span>
        </div>
      )}
      {hasWarn && !hideOpen && !tournamentSeason && (
        <div className="grid-legend">
          <span><span className="legend-dot green" />Net likely up</span>
          <span><span className="legend-dot yellow" />Net uncertain</span>
        </div>
      )}
      {activeRosterTeams && (
        <RosterModal
          title={activeRosterTeams.length > 1 ? 'Matchup Rosters' : activeRosterTeams[0].name}
          teams={activeRosterTeams}
          rosters={rosters}
          status={rosterStatus}
          allGames={allSeasonGames}
          teamMap={allTeamMap || teamMap}
          onClose={() => setActiveRosterTeams(null)}
        />
      )}
    </>
  );
}
