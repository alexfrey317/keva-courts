import { useState, useEffect, useRef, useCallback } from 'react';
import type { Mode, Theme, Game } from '../types';
import { calendarDays } from '../utils/dates';
import { getTeamColor } from '../utils/theme';
import { fetchDayOpenCount } from '../api/daysmart';

export function useCalendarDots(
  calYear: number,
  calMonth: number,
  weekStart: number,
  mode: Mode,
  opDates: Set<string>,
  myTeamDateMap: Map<string, number[]>,
  teamColorMap: Map<number, number>,
  theme: Theme,
  allSeasonGames: Game[] | null,
  myTeamIds: Set<number>,
) {
  const gdCache = useRef(new Map<string, number>());
  const [gameDots, setGameDots] = useState(new Set<string>());

  // Fetch open court counts for calendar dots
  useEffect(() => {
    const cells = calendarDays(calYear, calMonth, weekStart);
    const vbDates = [...new Set(cells.filter((c) => c.isVb && !c.isPast).map((c) => c.str))];
    setGameDots(new Set(vbDates.filter((d) => (gdCache.current.get(d) || 0) > 0)));

    const uncached = vbDates.filter((d) => !gdCache.current.has(d));
    if (!uncached.length) return;

    let cancelled = false;
    async function run() {
      const queue = [...uncached];
      while (queue.length && !cancelled) {
        const batch = queue.splice(0, 6);
        await Promise.all(
          batch.map((d) =>
            fetchDayOpenCount(d)
              .then((n) => gdCache.current.set(d, n))
              .catch(() => gdCache.current.set(d, -1)),
          ),
        );
        if (!cancelled) {
          setGameDots(new Set(vbDates.filter((d) => (gdCache.current.get(d) || 0) > 0)));
        }
      }
    }
    run();
    return () => { cancelled = true; };
  }, [calYear, calMonth, weekStart]);

  const getDots = useCallback(
    (dateStr: string): string[] => {
      if (mode === 'games') {
        return gameDots.has(dateStr)
          ? [getComputedStyle(document.documentElement).getPropertyValue('--open-t').trim()]
          : [];
      }
      if (mode === 'openplay') {
        return opDates.has(dateStr)
          ? [getComputedStyle(document.documentElement).getPropertyValue('--cyan-t').trim()]
          : [];
      }

      // My Team(s) / Season: use actual game data when available
      if (allSeasonGames && myTeamIds.size > 0) {
        const dots: string[] = [];
        for (const g of allSeasonGames) {
          if (g.date !== dateStr) continue;
          const isHome = myTeamIds.has(g.ht);
          const isAway = myTeamIds.has(g.vt);
          if (!isHome && !isAway) continue;
          const myTid = isHome ? g.ht : g.vt;
          const ci = teamColorMap.get(myTid);
          dots.push(ci !== undefined ? getTeamColor(ci, theme).t : '#c4b5fd');
        }
        return dots;
      }

      // Fallback: use day-of-week heuristic from myTeamDateMap
      const tids = myTeamDateMap.get(dateStr);
      if (!tids) return [];
      return tids.map((id) => {
        const ci = teamColorMap.get(id);
        return ci !== undefined ? getTeamColor(ci, theme).t : '#c4b5fd';
      });
    },
    [mode, gameDots, opDates, myTeamDateMap, teamColorMap, theme, allSeasonGames, myTeamIds],
  );

  return getDots;
}
