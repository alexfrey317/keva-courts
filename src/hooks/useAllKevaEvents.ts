import { useCallback, useEffect, useState } from 'react';
import { fetchAllKevaEvents } from '../api/daysmart';
import type { AllKevaEvent, DataSource } from '../types';

interface AllKevaEventsState {
  events: AllKevaEvent[] | null;
  loading: boolean;
  error: string | null;
  source: DataSource | null;
  fetchedAt: string;
  reload: () => Promise<void>;
}

export function useAllKevaEvents(date: string, enabled = true): AllKevaEventsState {
  const [events, setEvents] = useState<AllKevaEvent[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<DataSource | null>(null);
  const [fetchedAt, setFetchedAt] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchAllKevaEvents(date);
      setEvents(result.data);
      setSource(result.source);
      setFetchedAt(result.fetchedAt);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Schedule unavailable');
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    if (!enabled) return;
    void load();
  }, [enabled, load]);

  return { events, loading, error, source, fetchedAt, reload: load };
}
