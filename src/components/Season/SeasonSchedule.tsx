import { useState, useMemo, Fragment } from 'react';
import type { Game, Team, Theme } from '../../types';
import { toDateStr, formatTime12, formatShort } from '../../utils/dates';
import { getTeamColor } from '../../utils/theme';
import { generateTeamCalendar, downloadIcs } from '../../utils/calendar';
import { computeRecord } from '../../utils/courts';

interface SeasonScheduleProps {
  allGames: Game[];
  myTeamIds: Set<number>;
  teamMap: Record<number, Team>;
  teamColorMap: Map<number, number>;
  theme: Theme;
  onDateChange: (d: string) => void;
}

export function SeasonSchedule({
  allGames,
  myTeamIds,
  teamMap,
  teamColorMap,
  theme,
  onDateChange,
}: SeasonScheduleProps) {
  const [view, setView] = useState<'upcoming' | 'past'>('upcoming');
  const [sortBy, setSortBy] = useState<'date' | 'team'>('team');
  const today = toDateStr(new Date());

  const games = useMemo(() => {
    const matched: {
      date: string;
      time: string;
      myTid: number;
      oppId: number;
      won: boolean | null;
      hs: number | null;
      vs: number | null;
      isHome: boolean;
    }[] = [];

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
    const list =
      view === 'upcoming'
        ? games.filter((g) => g.date >= today)
        : games.filter((g) => g.date < today).reverse();

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
  }, [games, view, sortBy, today, teamMap]);

  const grouped = sortBy === 'team';
  let lastTid: number | null = null;

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
            const upcoming = allGames.filter((g) => g.date >= today);
            const ics = generateTeamCalendar(upcoming, myTeamIds, teamMap);
            downloadIcs(ics, 'keva-games.ics');
          }}
        >
          📅 Export
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
                className={'sched-row' + (g.date < today ? ' past-game' : '')}
                onClick={() => onDateChange(g.date)}
                style={cc ? { borderColor: cc.b } : {}}
              >
                <span className="sr-date">
                  {formatShort(g.date)} {formatTime12(g.time)}
                </span>
                <span className="sr-vs">
                  vs {opp} <span className="sr-opp-rec">({oppRec.w}W-{oppRec.l}L)</span>
                </span>
                {g.hs != null && (
                  <span className={'sr-score ' + (g.won ? 'sr-w' : 'sr-l')}>
                    {g.isHome ? g.hs : g.vs}-{g.isHome ? g.vs : g.hs}
                  </span>
                )}
              </div>
            </Fragment>
          );
        })}
      </div>
    </>
  );
}
