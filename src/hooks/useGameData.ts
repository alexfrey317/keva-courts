import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { ApiEvent, DataSource, GameState } from '../types';
import { fetchGames, fetchAllDayEvents } from '../api/daysmart';
import { parseGames, discoverCourts, buildGrid, computeVbStart, detectMissingCourts } from '../utils/courts';
import { isToday, getSlotsForDay, isStandardVbDay, mergeSlotsWithGameStarts } from '../utils/dates';
import { REFRESH_INTERVAL_MS } from '../utils/constants';

const INITIAL_STATE: GameState = {
  status: 'loading',
  courts: [],
  grid: { rows: [], openTotal: 0 },
  missing: [],
  vbStart: {},
  rawGames: [],
  updatedAt: '',
  source: null,
  fetchedAt: '',
};

interface RawDayState {
  status: 'loading' | 'ok' | 'error';
  rawApiGames: ApiEvent[];
  allDayEvents: ApiEvent[];
  fetchedAt: string;
  source: DataSource | null;
  message?: string;
}

const INITIAL_RAW_STATE: RawDayState = {
  status: 'loading',
  rawApiGames: [],
  allDayEvents: [],
  fetchedAt: '',
  source: null,
};

export function useGameData(dateStr: string, myTeamIds: Set<number> | null) {
  const [rawDayState, setRawDayState] = useState<RawDayState>(INITIAL_RAW_STATE);
  const refreshRef = useRef<ReturnType<typeof setInterval>>(0 as any);

  const fetchDay = useCallback(() => {
    return Promise.all([fetchGames(dateStr), fetchAllDayEvents(dateStr)])
      .then(([raw, allEvts]) => {
        const stamps = [raw.fetchedAt, allEvts.fetchedAt].sort();
        const fetchedAt = stamps[stamps.length - 1] || new Date().toISOString();
        const source = raw.source === 'cached' || allEvts.source === 'cached' ? 'cached' : 'live';

        setRawDayState({
          status: 'ok',
          rawApiGames: raw.data,
          allDayEvents: allEvts.data,
          fetchedAt,
          source,
        });
      })
      .catch((e) =>
        setRawDayState({ ...INITIAL_RAW_STATE, status: 'error', message: e.message }),
      );
  }, [dateStr]);

  const gameState = useMemo<GameState>(() => {
    if (rawDayState.status === 'loading') return INITIAL_STATE;
    if (rawDayState.status === 'error') {
      return { ...INITIAL_STATE, status: 'error', message: rawDayState.message };
    }

    const games = parseGames(rawDayState.rawApiGames);
    const baseSlots = isStandardVbDay(dateStr) ? getSlotsForDay(dateStr) : [];
    const gridSlots = mergeSlotsWithGameStarts(baseSlots, games);
    const courts = discoverCourts(games);
    const grid = buildGrid(games, courts, gridSlots, myTeamIds);
    const missing = detectMissingCourts(courts, rawDayState.allDayEvents);
    const vbStart = computeVbStart(rawDayState.allDayEvents, courts);

    return {
      status: 'ok',
      courts,
      grid,
      missing,
      vbStart,
      rawGames: games,
      updatedAt: new Date(rawDayState.fetchedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      source: rawDayState.source,
      fetchedAt: rawDayState.fetchedAt,
    };
  }, [dateStr, myTeamIds, rawDayState]);

  useEffect(() => {
    setRawDayState(INITIAL_RAW_STATE);
    fetchDay();
    clearInterval(refreshRef.current);

    if (isToday(dateStr)) {
      refreshRef.current = setInterval(() => {
        if (!document.hidden) fetchDay();
      }, REFRESH_INTERVAL_MS);
    }

    return () => clearInterval(refreshRef.current);
  }, [fetchDay]);

  return { gameState, refetch: fetchDay };
}
