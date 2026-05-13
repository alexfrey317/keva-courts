import { useState, useEffect, useRef, useCallback } from 'react';
import type { Game, DataSource } from '../types';
import { fetchAllSeasonGames } from '../api/daysmart';

const SEASON_CACHE_KEY = 'keva-season-games:v4';

interface SeasonCacheEntry {
  fetchedAt: string;
  data: Game[];
}

function readSeasonCache(): SeasonCacheEntry | null {
  try {
    const raw = window.localStorage.getItem(SEASON_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SeasonCacheEntry;
  } catch {
    return null;
  }
}

function writeSeasonCache(data: Game[], fetchedAt: string): void {
  try {
    window.localStorage.setItem(SEASON_CACHE_KEY, JSON.stringify({ data, fetchedAt }));
  } catch {
    // Ignore storage failures and keep the live request path working.
  }
}

export function useSeasonData(enabled = true) {
  const [allSeasonGames, setAllSeasonGames] = useState<Game[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<DataSource | null>(null);
  const [fetchedAt, setFetchedAt] = useState('');
  const fetched = useRef(false);

  const load = useCallback((force = false) => {
    if (fetched.current && !force) return Promise.resolve();
    const cached = readSeasonCache();
    if (cached && !allSeasonGames) {
      setAllSeasonGames(cached.data);
      setSource('cached');
      setFetchedAt(cached.fetchedAt);
      setError(null);
    }

    setLoading(!cached || force);
    return fetchAllSeasonGames()
      .then((result) => {
        fetched.current = true;
        setAllSeasonGames(result.data);
        setSource(result.source);
        setFetchedAt(result.fetchedAt);
        setError(null);
        writeSeasonCache(result.data, result.fetchedAt);
      })
      .catch((err: Error) => {
        if (!cached) setAllSeasonGames(null);
        setError(err.message);
      })
      .finally(() => setLoading(false));
  }, [allSeasonGames]);

  useEffect(() => {
    if (!enabled) return;

    void load();
  }, [enabled, load]);

  return {
    allSeasonGames,
    loading,
    error,
    source,
    fetchedAt,
    reload: () => {
      fetched.current = false;
      return load(true);
    },
  };
}
