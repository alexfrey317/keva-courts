import { useState, useEffect, useMemo, useCallback } from 'react';
import type { Team, TeamData, DataSource, TeamColorOverrideMap } from '../types';
import { fetchTeamData } from '../api/daysmart';
import { parseDayFromLeague, toDateStr } from '../utils/dates';

const TEAM_COLOR_KEY = 'keva-team-colors';

function readSavedTeams(): number[] {
  try {
    const json = localStorage.getItem('keva-teams');
    if (json) {
      const parsed = JSON.parse(json);
      if (Array.isArray(parsed)) return parsed.map(Number).filter((n) => Number.isInteger(n) && n > 0);
    }
  } catch { /* ignore */ }
  return [];
}

function sameIds(a: number[], b: number[]): boolean {
  return a.length === b.length && [...a].sort().join(',') === [...b].sort().join(',');
}

/**
 * Initial team selection. A `?teams=` param adopts silently when nothing is
 * saved yet; when it differs from an existing saved selection the user is
 * asked first, so opening a friend's shared link cannot wipe their own teams.
 */
function readInitialTeams(): number[] {
  const saved = readSavedTeams();
  const qt = new URLSearchParams(window.location.search).get('teams');
  const fromUrl = qt ? qt.split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0) : [];
  if (!fromUrl.length) return saved;
  if (!saved.length || sameIds(saved, fromUrl)) return fromUrl;
  const replace = window.confirm('Replace your saved teams with the ones in this link?');
  return replace ? fromUrl : saved;
}

function writeTeams(ids: number[]): void {
  try {
    if (ids.length) localStorage.setItem('keva-teams', JSON.stringify(ids));
    else localStorage.removeItem('keva-teams');
  } catch { /* ignore */ }
  const url = new URL(window.location.href);
  if (ids.length) url.searchParams.set('teams', ids.join(','));
  else url.searchParams.delete('teams');
  window.history.replaceState(null, '', url.toString());
}

function readTeamColorOverrides(): TeamColorOverrideMap {
  try {
    const raw = localStorage.getItem(TEAM_COLOR_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const overrides: TeamColorOverrideMap = {};
    for (const [key, value] of Object.entries(parsed)) {
      const teamId = Number(key);
      const colorIndex = Number(value);
      if (Number.isInteger(teamId) && teamId > 0 && Number.isInteger(colorIndex) && colorIndex >= 0) {
        overrides[teamId] = colorIndex;
      }
    }
    return overrides;
  } catch {
    return {};
  }
}

function writeTeamColorOverrides(overrides: TeamColorOverrideMap): void {
  try {
    if (Object.keys(overrides).length) localStorage.setItem(TEAM_COLOR_KEY, JSON.stringify(overrides));
    else localStorage.removeItem(TEAM_COLOR_KEY);
  } catch {
    // Ignore storage failures and keep in-memory state working.
  }
}

export function useTeams() {
  const [teamData, setTeamData] = useState<TeamData | null>(null);
  const [teamLoading, setTeamLoading] = useState(true);
  const [teamError, setTeamError] = useState<string | null>(null);
  const [teamSource, setTeamSource] = useState<DataSource | null>(null);
  const [teamFetchedAt, setTeamFetchedAt] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [teamColorOverrides, setTeamColorOverrides] = useState<TeamColorOverrideMap>(readTeamColorOverrides);
  const [myTeams, setMyTeams] = useState<number[]>(() => {
    const teams = readInitialTeams();
    writeTeams(teams);
    return teams;
  });

  const loadTeams = useCallback(() => {
    setTeamLoading(true);
    return fetchTeamData()
      .then((result) => {
        setTeamData(result.data);
        setTeamSource(result.source);
        setTeamFetchedAt(result.fetchedAt);
        setTeamError(null);
      })
      .catch((err: Error) => {
        setTeamData(null);
        setTeamError(err.message);
      })
      .finally(() => setTeamLoading(false));
  }, []);

  useEffect(() => {
    void loadTeams();
  }, [loadTeams]);

  const saveTeams = useCallback((ids: number[], overrides?: TeamColorOverrideMap) => {
    setMyTeams(ids);
    writeTeams(ids);
    const nextOverrides = overrides ?? teamColorOverrides;
    setTeamColorOverrides(nextOverrides);
    writeTeamColorOverrides(nextOverrides);
  }, [teamColorOverrides]);

  // Prune saved teams that DaySmart no longer lists, but only when the
  // directory actually loaded something. An empty directory (between seasons,
  // or an upcoming season with no teams yet) must not wipe the user's selection.
  useEffect(() => {
    if (!teamData || !myTeams.length) return;
    if (!Object.keys(teamData.teamMap).length || !teamData.leagues.length) return;
    const validTeams = myTeams.filter((id) => Boolean(teamData.teamMap[id]));
    if (validTeams.length === myTeams.length) return;
    setMyTeams(validTeams);
    writeTeams(validTeams);
  }, [myTeams, teamData]);

  const myTeamObjs = useMemo<Team[]>(() => {
    if (!teamData) return [];
    return myTeams.map((id) => teamData.teamMap[id]).filter(Boolean);
  }, [myTeams, teamData]);

  const myTeamIdSet = useMemo(() => new Set(myTeams), [myTeams]);

  const teamColorMap = useMemo(() => {
    const m = new Map<number, number>();
    myTeams.forEach((id, i) => m.set(id, teamColorOverrides[id] ?? i));
    return m;
  }, [myTeams, teamColorOverrides]);

  /** Map of dateStr -> team IDs that play on that date */
  const myTeamDateMap = useMemo(() => {
    if (!myTeamObjs.length) return new Map<string, number[]>();
    const map = new Map<string, number[]>();

    for (const t of myTeamObjs) {
      const startDate = t.seasonStart || teamData?.seasonStart;
      const endDate = t.seasonEnd || teamData?.seasonEnd;
      if (!startDate || !endDate) continue;

      const dayNum = parseDayFromLeague(t.rawLeagueName || t.leagueName);
      if (dayNum < 0) continue;
      const start = new Date(startDate + 'T12:00:00');
      const end = new Date(endDate + 'T12:00:00');
      const d = new Date(start);
      while (d <= end) {
        if (d.getDay() === dayNum) {
          const s = toDateStr(d);
          if (!map.has(s)) map.set(s, []);
          map.get(s)!.push(t.id);
        }
        d.setDate(d.getDate() + 1);
      }
    }
    return map;
  }, [myTeamObjs, teamData]);

  return {
    teamData,
    teamLoading,
    teamError,
    teamSource,
    teamFetchedAt,
    showPicker,
    setShowPicker,
    myTeams,
    saveTeams,
    myTeamObjs,
    myTeamIdSet,
    teamColorOverrides,
    teamColorMap,
    myTeamDateMap,
    reloadTeams: loadTeams,
  };
}
