import { useMemo } from 'react';
import type { Game, Team, Theme } from '../../types';
import { compareDateStr, compareDateTime, formatDateLong, formatTime12, isUpcomingGame, toDateStr } from '../../utils/dates';
import { getTeamColor } from '../../utils/theme';

interface NextGameCardProps {
  myTeamDateMap: Map<string, number[]>;
  allSeasonGames: Game[] | null;
  myTeamIds: Set<number>;
  teamColorMap: Map<number, number>;
  teamMap?: Record<number, Team>;
  theme: Theme;
  dateStr: string;
  onGo: (dateStr: string) => void;
}

export function NextGameCard({
  myTeamDateMap,
  allSeasonGames,
  myTeamIds,
  teamColorMap,
  teamMap,
  theme,
  dateStr,
  onGo,
}: NextGameCardProps) {
  const next = useMemo(() => {
    if (allSeasonGames && myTeamIds.size > 0) {
      const now = new Date();
      const scheduled = allSeasonGames
        .filter((g) => (myTeamIds.has(g.ht) || myTeamIds.has(g.vt)) && isUpcomingGame(g.date, g.start, now))
        .sort((a, b) => compareDateTime(a.date, a.start, b.date, b.start));

      const game = scheduled[0];
      if (game) {
        const tid = myTeamIds.has(game.ht) ? game.ht : game.vt;
        return { date: game.date, tid, time: game.start };
      }
    }

    const today = toDateStr(new Date());
    const entries = [...myTeamDateMap.entries()]
      .filter(([d]) => d >= today)
      .sort((a, b) => compareDateStr(a[0], b[0]));
    for (const [d, tids] of entries) {
      for (const tid of tids) return { date: d, tid, time: null };
    }
    return null;
  }, [allSeasonGames, myTeamDateMap, myTeamIds]);

  if (!next || next.date === dateStr) return null;
  const team = teamMap?.[next.tid];
  if (!team) return null;

  const ci = teamColorMap.get(next.tid);
  const cc = ci !== undefined ? getTeamColor(ci, theme) : null;

  return (
    <button type="button" className="next-game" style={{ cursor: 'pointer' }} onClick={() => onGo(next.date)}>
      <span
        className="ng-badge"
        style={cc ? { background: cc.bg2, color: cc.t, border: `1px solid ${cc.b}` } : {}}
      >
        Next
      </span>
      <div className="ng-detail">
        <div className="ng-vs">{team.name}</div>
        <div className="ng-meta">
          {formatDateLong(next.date)}{next.time ? ` at ${formatTime12(next.time)}` : ''} &rarr;
        </div>
      </div>
    </button>
  );
}
