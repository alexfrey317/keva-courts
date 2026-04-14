import { useEffect, useMemo, useState } from 'react';
import type { TeamRosterMap } from '../types';
import { WORKER_URL } from '../utils/constants';

interface WorkerRosterPayload {
  teams?: Record<string, {
    teamId: number;
    teamName: string;
    players: string[];
    syncedAt: string;
  }>;
}

export function useTeamRosters(teamIds: number[]): TeamRosterMap {
  const [rosters, setRosters] = useState<TeamRosterMap>({});
  const key = useMemo(
    () => [...new Set(teamIds)].sort((a, b) => a - b).join(','),
    [teamIds.join(',')],
  );

  useEffect(() => {
    if (!key) {
      setRosters({});
      return;
    }

    let cancelled = false;

    fetch(`${WORKER_URL}/rosters?teamIds=${encodeURIComponent(key)}`)
      .then(async (response) => {
        if (!response.ok) return;
        const payload = await response.json() as WorkerRosterPayload;
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

        if (!cancelled) setRosters(next);
      })
      .catch(() => {
        // Keep roster popovers optional. The rest of the UI should remain usable.
      });

    return () => {
      cancelled = true;
    };
  }, [key]);

  return rosters;
}
