import { Fragment } from 'react';
import type { Grid, Court, Team, Game, Theme, TeamRosterMap } from '../../types';
import { formatTime12, toMinutes, isToday, nowMinutes } from '../../utils/dates';
import { getTeamColor } from '../../utils/theme';
import { TeamRosterName } from '../Common/TeamRosterName';

interface ScheduleGridProps {
  grid: Grid;
  courts: Court[];
  teamMap?: Record<number, Team>;
  hideOpen?: boolean;
  vbStart: Record<number, number>;
  teamColors?: Map<number, number>;
  theme?: Theme;
  showNow?: boolean;
  dateStr: string;
  rawGames?: Game[];
  allTeamMap?: Record<number, Team>;
  rosters?: TeamRosterMap;
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
}: ScheduleGridProps) {
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
                    <div key={i} className="g-cell my-game" style={style}>
                      {myName && (
                        <>
                          <TeamRosterName teamId={cell.myTid!} name={myName} rosters={rosters} />
                          <br />
                        </>
                      )}
                      {oppName ? (
                        <>
                          vs <TeamRosterName teamId={cell.oppId!} name={oppName} rosters={rosters} />
                          {scoreStr}
                        </>
                      ) : 'YOUR GAME'}
                    </div>
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
                  const earliestStart = vbStart && courts[i] ? vbStart[courts[i].res] : -1;
                  const netUp = earliestStart >= 0 && earliestStart <= slotMin;
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
                  <div
                    key={i}
                    className={'g-cell booked' + rowClass}
                    title={homeName && visitName ? `${homeName} vs ${visitName}` : ''}
                  >
                    {homeName ? (
                      <span className="booked-teams">
                        <TeamRosterName teamId={game!.ht} name={homeName} rosters={rosters} />
                        <br />
                        vs {visitName ? <TeamRosterName teamId={game!.vt} name={visitName} rosters={rosters} /> : 'TBD'}
                      </span>
                    ) : (
                      '\u2014'
                    )}
                  </div>
                );
              })}
            </Fragment>
          );
        })}
      </div>

      {hasWarn && !hideOpen && (
        <div className="grid-legend">
          <span><span className="legend-dot green" />Net likely up</span>
          <span><span className="legend-dot yellow" />Net uncertain</span>
        </div>
      )}
    </>
  );
}
