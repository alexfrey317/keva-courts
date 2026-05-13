import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { Mode, Theme, Game, OpenCourtSummary, Team } from '../types';
import { calendarDays } from '../utils/dates';
import { getTeamColor } from '../utils/theme';
import { hasTbdMatch } from '../utils/courts';
import { fetchDayOpenCount } from '../api/daysmart';

const DOT_CACHE_KEY = 'keva-dot-counts:v8';
const DOT_CACHE_TTL_MS = 60 * 60 * 1000;

interface DotCacheEntry extends OpenCourtSummary {
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

function teamDotColor(teamId: number, teamColorMap: Map<number, number>, theme: Theme): string {
  const ci = teamColorMap.get(teamId);
  return ci !== undefined ? getTeamColor(ci, theme).t : '#c4b5fd';
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
  teamMap?: Record<number, Team>,
) {
  const gdCache = useRef(readDotCache());
  const [gameDots, setGameDots] = useState(new Map<string, OpenCourtSummary>());
  const gameDates = useMemo(() => {
    const dates = new Set<string>();
    for (const game of allSeasonGames || []) dates.add(game.date);
    return dates;
  }, [allSeasonGames]);

  // Fetch open court counts for calendar dots
  useEffect(() => {
    if (mode !== 'games') return;

    const cells = calendarDays(calYear, calMonth, weekStart, gameDates);
    const vbDates = [...new Set(cells.filter((c) => c.isVb && !c.isPast).map((c) => c.str))];
    const readVisibleDots = () => {
      const dots = new Map<string, OpenCourtSummary>();
      for (const date of vbDates) {
        const entry = gdCache.current.get(date);
        if (!entry || !isEntryFresh(entry) || entry.total <= 0) continue;
        dots.set(date, { total: entry.total, likely: entry.likely, warning: entry.warning });
      }
      return dots;
    };

    setGameDots(readVisibleDots());

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
                gdCache.current.set(d, { ...result.data, fetchedAt: result.fetchedAt });
                writeDotCache(gdCache.current);
              })
              .catch(() => {
                const prev = gdCache.current.get(d);
                if (prev) return;
                gdCache.current.set(d, { total: -1, likely: 0, warning: 0, fetchedAt: new Date().toISOString() });
              }),
          ),
        );
        if (!cancelled) {
          setGameDots(readVisibleDots());
        }
      }
    }
    run();
    return () => { cancelled = true; };
  }, [calYear, calMonth, weekStart, mode, gameDates]);

  const teamDots = useMemo(() => {
    const dotsByDate = new Map<string, string[]>();
    if (!allSeasonGames || myTeamIds.size === 0) return dotsByDate;

    for (const g of allSeasonGames) {
      const isHome = myTeamIds.has(g.ht);
      const isAway = myTeamIds.has(g.vt);
      if (!isHome && !isAway) continue;

      const homeColor = teamDotColor(g.ht, teamColorMap, theme);
      const awayColor = teamDotColor(g.vt, teamColorMap, theme);
      const color = isHome && isAway
        ? `linear-gradient(135deg, ${homeColor} 0%, ${homeColor} 49.5%, ${awayColor} 50%, ${awayColor} 100%)`
        : isHome ? homeColor : awayColor;
      const dots = dotsByDate.get(g.date);
      if (dots) dots.push(color);
      else dotsByDate.set(g.date, [color]);
    }

    return dotsByDate;
  }, [allSeasonGames, myTeamIds, teamColorMap, theme]);

  const tournamentDates = useMemo(() => {
    const dates = new Set<string>();
    if (!allSeasonGames) return dates;

    const gamesByDate = new Map<string, Game[]>();
    for (const game of allSeasonGames) {
      const games = gamesByDate.get(game.date);
      if (games) games.push(game);
      else gamesByDate.set(game.date, [game]);
    }
    for (const [date, games] of gamesByDate) {
      if (hasTbdMatch(games, teamMap)) dates.add(date);
    }
    return dates;
  }, [allSeasonGames, teamMap]);

  const getDots = useCallback(
    (dateStr: string): string[] => {
      if (mode === 'games') {
        const summary = gameDots.get(dateStr);
        if (!summary) return [];
        if (tournamentDates.has(dateStr)) {
          return [getComputedStyle(document.documentElement).getPropertyValue('--tourney-t').trim()];
        }
        const dots: string[] = [];
        if (summary.likely > 0) {
          dots.push(getComputedStyle(document.documentElement).getPropertyValue('--open-t').trim());
        }
        if (summary.warning > 0) {
          dots.push(getComputedStyle(document.documentElement).getPropertyValue('--warn-t').trim());
        }
        return dots;
      }
      if (mode === 'openplay') {
        return opDates.has(dateStr)
          ? [getComputedStyle(document.documentElement).getPropertyValue('--cyan-t').trim()]
          : [];
      }
      return teamDots.get(dateStr) || [];
    },
    [mode, gameDots, opDates, teamDots, tournamentDates],
  );

  return getDots;
}
