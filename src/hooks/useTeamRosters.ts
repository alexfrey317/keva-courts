import { useEffect, useMemo, useState } from 'react';
import type { TeamRosterMap } from '../types';
import { WORKER_URL } from '../utils/constants';

interface WorkerRosterPayload {
  stale?: boolean;
  teams?: Record<string, {
    teamId: number;
    teamName: string;
    players: string[];
    syncedAt: string;
  }>;
}

export type TeamRosterStatus = 'idle' | 'loading' | 'ready' | 'error';

async function fetchRosterPayload(url: string): Promise<WorkerRosterPayload | null> {
  const response = await fetch(url);
  if (!response.ok) return null;
  return response.json() as Promise<WorkerRosterPayload>;
}

function toRosterMap(payload: WorkerRosterPayload): TeamRosterMap {
  const next: TeamRosterMap = {};

  for (const [rawTeamId, roster] of Object.entries(payload.teams || {})) {
    const teamId = Number(rawTeamId);
    if (!Number.isInteger(teamId) || teamId <= 0) continue;
    next[teamId] = {
      teamId: roster.teamId,
      teamName: roster.teamName,
      players: Array.isArray(roster.players) ? roster.players : [],
      syncedAt: roster.syncedAt,
    };
  }

  return next;
}

export function useTeamRosters(teamIds: number[], enabled = true): { rosters: TeamRosterMap; status: TeamRosterStatus } {
  const [rosters, setRosters] = useState<TeamRosterMap>({});
  const [status, setStatus] = useState<TeamRosterStatus>('idle');
  const key = useMemo(() => [...new Set(teamIds)].sort((a, b) => a - b).join(','), [teamIds.join(',')]);

  useEffect(() => {
    if (!key) {
      setRosters({});
      setStatus('idle');
      return;
    }
    if (!enabled) return;

    let cancelled = false;
    setStatus('loading');

    const staticUrl = `${import.meta.env.BASE_URL || '/'}rosters.json`;
    const requestedTeamIds = key.split(',').map(Number).filter((teamId) => teamId > 0);

    (async () => {
      try {
        const staticPayload = await fetchRosterPayload(staticUrl);
        let next = staticPayload ? toRosterMap(staticPayload) : {};
        const missingIds = requestedTeamIds.filter((teamId) => !next[teamId]);
        const needsWorker = !staticPayload || staticPayload.stale || missingIds.length > 0;

        if (needsWorker) {
          const workerUrl = missingIds.length && !staticPayload?.stale
            ? `${WORKER_URL}/rosters?teamIds=${missingIds.join(',')}`
            : `${WORKER_URL}/rosters`;
          try {
            const workerPayload = await fetchRosterPayload(workerUrl);
            if (workerPayload) next = { ...next, ...toRosterMap(workerPayload) };
          } catch {
            if (!staticPayload) throw new Error('Roster snapshot unavailable');
          }
        }

        if (Object.keys(next).length === 0) {
          if (!cancelled) {
            setRosters({});
            setStatus('error');
          }
          return;
        }

        if (!cancelled) {
          setRosters(next);
          setStatus('ready');
        }
      } catch {
        if (!cancelled) {
          setRosters({});
          setStatus('error');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, key]);

  return { rosters, status };
}
