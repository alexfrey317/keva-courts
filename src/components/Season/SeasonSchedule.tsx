import { useState, useMemo, Fragment } from 'react';
import type { Game, SeasonGame, Team, Theme, TeamRosterMap } from '../../types';
import type { TeamRosterStatus } from '../../hooks/useTeamRosters';
import { formatTime12, formatShort, isPastGame, isUpcomingGame } from '../../utils/dates';
import { getTeamColor } from '../../utils/theme';
import { generateTeamCalendar, downloadIcs } from '../../utils/calendar';
import { computeRecord, computeRecordBreakdown } from '../../utils/courts';
import { RecordBreakdownModal } from './RecordBreakdownModal';

interface SeasonScheduleProps {
  allGames: Game[];
  myTeamIds: Set<number>;
  teamMap: Record<number, Team>;
  teamColorMap: Map<number, number>;
  theme: Theme;
  onDateChange: (d: string) => void;
  rosters: TeamRosterMap;
  rosterStatus: TeamRosterStatus;
}

export function SeasonSchedule({
  allGames,
  myTeamIds,
  teamMap,
  teamColorMap,
  theme,
  onDateChange,
  rosters,
  rosterStatus,
}: SeasonScheduleProps) {
  const [view, setView] = useState<'upcoming' | 'past'>('upcoming');
  const [sortBy, setSortBy] = useState<'date' | 'team'>('team');
  const [activeRecordTeamId, setActiveRecordTeamId] = useState<number | null>(null);

  const games = useMemo<SeasonGame[]>(() => {
    const matched: SeasonGame[] = [];

    for (const g of allGames) {
      const isH = myTeamIds.has(g.ht);
      const isA = myTeamIds.has(g.vt);
      if (!isH && !isA) continue;
      const myTid = isH ? g.ht : g.vt;
      const oppId = isH ? g.vt : g.ht;
      const won = g.hs != null ? (isH ? g.hs > g.vs! : g.vs! > g.hs) : null;
      matched.push({ date: g.date, time: g.start, myTid, oppId, won, hs: g.hs, vs: g.vs, isHome: isH });
    }
    matched.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
    return matched;
  }, [allGames, myTeamIds]);

  const filtered = useMemo(() => {
    const now = new Date();
    const list =
      view === 'upcoming'
        ? games.filter((g) => isUpcomingGame(g.date, g.time, now))
        : games.filter((g) => isPastGame(g.date, g.time, now)).reverse();

    if (sortBy === 'team') {
      const copy = [...list];
      copy.sort((a, b) => {
        const an = teamMap[a.myTid]?.name || '';
        const bn = teamMap[b.myTid]?.name || '';
        return an.localeCompare(bn) || a.date.localeCompare(b.date);
      });
      return copy;
    }
    return list;
  }, [games, view, sortBy, teamMap]);

  const grouped = sortBy === 'team';
  let lastTid: number | null = null;
  const activeRecord = useMemo(
    () => (activeRecordTeamId ? computeRecordBreakdown(allGames, activeRecordTeamId, teamMap) : null),
    [activeRecordTeamId, allGames, teamMap],
  );

  return (
    <>
      <div className="sched-toggle">
        <button className={view === 'upcoming' ? 'active' : ''} onClick={() => setView('upcoming')}>
          Upcoming
        </button>
        <button className={view === 'past' ? 'active' : ''} onClick={() => setView('past')}>
          Past
        </button>
        <button className={sortBy === 'date' ? 'active' : ''} onClick={() => setSortBy('date')}>
          By Date
        </button>
        <button className={sortBy === 'team' ? 'active' : ''} onClick={() => setSortBy('team')}>
          By Team
        </button>
        <button
          className="cal-export-btn"
          onClick={() => {
            const now = new Date();
            const upcoming = allGames.filter((g) => isUpcomingGame(g.date, g.start, now));
            const ics = generateTeamCalendar(upcoming, myTeamIds, teamMap);
            downloadIcs(ics, 'keva-games.ics');
          }}
        >
          <span aria-hidden="true">📅</span> Export
        </button>
      </div>

      {filtered.length === 0 && (
        <div className="summary no-games">
          {view === 'upcoming' ? 'No upcoming games' : 'No past games'}
        </div>
      )}

      <div className="sched-list">
        {filtered.map((g, i) => {
          const ci = teamColorMap.get(g.myTid);
          const cc = ci !== undefined ? getTeamColor(ci, theme) : null;
          const opp = teamMap[g.oppId]?.name || 'TBD';
          const oppRec = computeRecord(allGames, g.oppId);
          const myName = teamMap[g.myTid]?.name || '';
          const showHeader = grouped && g.myTid !== lastTid;
          lastTid = g.myTid;

          return (
            <Fragment key={i}>
              {showHeader && (
                <div
                  className="picker-league-name"
                  style={cc ? { color: cc.t, borderColor: cc.b } : {}}
                >
                  {myName}
                </div>
              )}
              <div
                className={'sched-row' + (isPastGame(g.date, g.time) ? ' past-game' : '')}
                style={cc ? { borderColor: cc.b } : {}}
              >
                <button
                  type="button"
                  className="sched-main"
                  onClick={() => onDateChange(g.date)}
                >
                  <span className="sr-date">
                    {formatShort(g.date)} {formatTime12(g.time)}
                  </span>
                  <span className="sr-vs">vs {opp}</span>
                </button>
                <div className="sched-side">
                  <button
                    type="button"
                    className="sr-opp-rec-btn"
                    onClick={() => setActiveRecordTeamId(g.oppId)}
                    aria-label={`Show ${opp} record breakdown`}
                  >
                    {oppRec.w}-{oppRec.l}
                  </button>
                  {g.hs != null && (
                    <span className={'sr-score ' + (g.won ? 'sr-w' : 'sr-l')}>
                      {g.isHome ? g.hs : g.vs}-{g.isHome ? g.vs : g.hs}
                    </span>
                  )}
                </div>
              </div>
            </Fragment>
          );
        })}
      </div>
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
    </>
  );
}
