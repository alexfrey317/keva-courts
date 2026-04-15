import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { Mode, Theme, Game } from '../types';
import { calendarDays } from '../utils/dates';
import { getTeamColor } from '../utils/theme';
import { fetchDayOpenCount } from '../api/daysmart';

const DOT_CACHE_KEY = 'keva-dot-counts:v2';
const DOT_CACHE_TTL_MS = 60 * 60 * 1000;

interface DotCacheEntry {
  count: number;
  fetchedAt: string;
}

function readDotCache(): Map<string, DotCacheEntry> {
  try {
    const raw = window.localStorage.getItem(DOT_CACHE_KEY);
    if (!raw) return new Map();
    return new Map(Object.entries(JSON.parse(raw) as Record<string, DotCacheEntry>));
  } catch {
    return new Map();
  }
}

function writeDotCache(cache: Map<string, DotCacheEntry>): void {
  try {
    window.localStorage.setItem(DOT_CACHE_KEY, JSON.stringify(Object.fromEntries(cache)));
  } catch {
    // Ignore storage write failures for this non-critical hint data.
  }
}

function isEntryFresh(entry: DotCacheEntry | undefined): boolean {
  if (!entry?.fetchedAt) return false;
  const fetchedMs = Date.parse(entry.fetchedAt);
  if (Number.isNaN(fetchedMs)) return false;
  return Date.now() - fetchedMs < DOT_CACHE_TTL_MS;
}

export function useCalendarDots(
  calYear: number,
  calMonth: number,
  weekStart: number,
  mode: Mode,
  opDates: Set<string>,
  teamColorMap: Map<number, number>,
  theme: Theme,
  allSeasonGames: Game[] | null,
  myTeamIds: Set<number>,
) {
  const gdCache = useRef(readDotCache());
  const [gameDots, setGameDots] = useState(new Set<string>());

  // Fetch open court counts for calendar dots
  useEffect(() => {
    if (mode !== 'games') return;

    const cells = calendarDays(calYear, calMonth, weekStart);
    const vbDates = [...new Set(cells.filter((c) => c.isVb && !c.isPast).map((c) => c.str))];
    setGameDots(
      new Set(
        vbDates.filter((d) => {
          const entry = gdCache.current.get(d);
          return isEntryFresh(entry) && (entry?.count || 0) > 0;
        }),
      ),
    );

    const uncached = vbDates.filter((d) => !isEntryFresh(gdCache.current.get(d)));
    if (!uncached.length) return;

    let cancelled = false;
    async function run() {
      const queue = [...uncached];
      while (queue.length && !cancelled) {
        const batch = queue.splice(0, 2);
        await Promise.all(
          batch.map((d) =>
            fetchDayOpenCount(d)
              .then((result) => {
                gdCache.current.set(d, { count: result.data, fetchedAt: result.fetchedAt });
                writeDotCache(gdCache.current);
              })
              .catch(() => {
                const prev = gdCache.current.get(d);
                if (prev) return;
                gdCache.current.set(d, { count: -1, fetchedAt: new Date().toISOString() });
              }),
          ),
        );
        if (!cancelled) {
          setGameDots(
            new Set(
              vbDates.filter((d) => {
                const entry = gdCache.current.get(d);
                return isEntryFresh(entry) && (entry?.count || 0) > 0;
              }),
            ),
          );
        }
      }
    }
    run();
    return () => { cancelled = true; };
  }, [calYear, calMonth, weekStart, mode]);

  const teamDots = useMemo(() => {
    const dotsByDate = new Map<string, string[]>();
    if (!allSeasonGames || myTeamIds.size === 0) return dotsByDate;

    for (const g of allSeasonGames) {
      const isHome = myTeamIds.has(g.ht);
      const isAway = myTeamIds.has(g.vt);
      if (!isHome && !isAway) continue;

      const myTid = isHome ? g.ht : g.vt;
      const ci = teamColorMap.get(myTid);
      const color = ci !== undefined ? getTeamColor(ci, theme).t : '#c4b5fd';
      const dots = dotsByDate.get(g.date);
      if (dots) dots.push(color);
      else dotsByDate.set(g.date, [color]);
    }

    return dotsByDate;
  }, [allSeasonGames, myTeamIds, teamColorMap, theme]);

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
      return teamDots.get(dateStr) || [];
    },
    [mode, gameDots, opDates, teamDots],
  );

  return getDots;
}
