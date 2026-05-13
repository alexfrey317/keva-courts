import { API_BASE, COMPANY, VB_RESOURCES } from '../utils/constants';
import type { ApiResponse, ApiEvent, Game, TeamData, OpenPlaySession, SourceResult, DataSource, OpenCourtSummary } from '../types';
import { toDateStr, parseDayFromLeague, getSlotsForDay, isStandardVbDay, mergeSlotsWithGameStarts } from '../utils/dates';
import { parseGames, discoverCourts, buildGrid, computeVbStart, countOpenSlots } from '../utils/courts';

interface CacheEntry<T> {
  fetchedAt: string;
  data: T;
}

const CACHE_PREFIX = 'keva-api-cache:v2:';
const UPCOMING_SEASON_LOOKAHEAD_DAYS = 45;

function buildCacheKey(endpoint: string, params: Record<string, string>): string {
  const search = new URLSearchParams();
  search.set('company', COMPANY);
  Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([key, value]) => search.set(key, value));
  return `${CACHE_PREFIX}${endpoint}?${search.toString()}`;
}

function readCache<T>(key: string): CacheEntry<T> | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as CacheEntry<T>;
  } catch {
    return null;
  }
}

function writeCache<T>(key: string, data: T, fetchedAt: string): void {
  try {
    window.localStorage.setItem(key, JSON.stringify({ data, fetchedAt }));
  } catch {
    // Ignore quota or storage failures and keep live data flowing.
  }
}

function withSource<T>(data: T, source: DataSource, fetchedAt: string): SourceResult<T> {
  return { data, source, fetchedAt };
}

function combineSourceMeta(results: Array<{ source: DataSource; fetchedAt: string }>): { source: DataSource; fetchedAt: string } {
  const stamps = results
    .map((result) => result.fetchedAt)
    .sort();
  return {
    source: results.some((result) => result.source === 'cached') ? 'cached' : 'live',
    fetchedAt: stamps[stamps.length - 1] || new Date().toISOString(),
  };
}

interface ActiveAdultDirectory {
  leagueIds: Set<number>;
  teamIds: Set<number>;
}

let activeAdultDirectoryPromise: Promise<SourceResult<ActiveAdultDirectory>> | null = null;

function getAttr(resource: ApiEvent, key: string): string {
  return String((resource.attributes as any)[key] || '');
}

function isAdultIndoorSeason(resource: ApiEvent): boolean {
  const name = getAttr(resource, 'name').toLowerCase();
  return name.includes('vb adult') && !name.includes('sand') && !name.includes('tournament');
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

function selectRelevantAdultSeasons(seasons: ApiEvent[], today: string): ApiEvent[] {
  const adultSeasons = seasons
    .filter(isAdultIndoorSeason)
    .map((season) => ({
      season,
      start: getAttr(season, 'start_date').slice(0, 10),
      end: getAttr(season, 'end_date').slice(0, 10),
    }))
    .filter((season) => season.start && season.end);

  const selected = new Map<string, ApiEvent>();
  for (const entry of adultSeasons) {
    if (entry.start <= today && today <= entry.end) selected.set(entry.season.id, entry.season);
  }

  const lookahead = addDays(today, UPCOMING_SEASON_LOOKAHEAD_DAYS);
  const next = adultSeasons
    .filter((entry) => entry.start > today && entry.start <= lookahead)
    .sort((a, b) => a.start.localeCompare(b.start))[0];
  if (next) selected.set(next.season.id, next.season);

  if (selected.size === 0) {
    const upcoming = adultSeasons
      .filter((entry) => entry.start > today)
      .sort((a, b) => a.start.localeCompare(b.start))[0];
    const recent = adultSeasons
      .filter((entry) => entry.end < today)
      .sort((a, b) => b.end.localeCompare(a.end))[0];
    const fallback = upcoming?.season || recent?.season || adultSeasons[0]?.season;
    if (fallback) selected.set(fallback.id, fallback);
  }

  return [...selected.values()];
}

async function fetchActiveAdultDirectory(): Promise<SourceResult<ActiveAdultDirectory>> {
  if (activeAdultDirectoryPromise) return activeAdultDirectoryPromise;

  activeAdultDirectoryPromise = (async () => {
    const seasonBatch = await apiFetch('seasons', { sort: '-id', 'page[size]': '50' });
    const today = toDateStr(new Date());
    const sources: Array<{ source: DataSource; fetchedAt: string }> = [seasonBatch];
    const seasons = selectRelevantAdultSeasons(seasonBatch.data.data || [], today);

    if (!seasons.length) {
      return withSource({ leagueIds: new Set<number>(), teamIds: new Set<number>() }, seasonBatch.source, seasonBatch.fetchedAt);
    }

    const leagueBatches = await Promise.all(
      seasons.map((season) =>
        apiFetch('leagues', {
          'filter[season_id]': season.id,
          'page[size]': '100',
        }),
      ),
    );
    sources.push(...leagueBatches);

    const skip = /waitlist|sub list|canceled/i;
    const leagues = leagueBatches.flatMap((batch) => batch.data.data || [])
      .filter((league) => !skip.test((league.attributes as any).name));
    const leagueIds = new Set(leagues.map((league) => Number(league.id)));
    const teamIds = new Set<number>();

    const teamBatches = await Promise.all(
      leagues.map((league) =>
        apiFetch('teams', {
          'filter[league_id]': league.id,
          'page[size]': '100',
        }),
      ),
    );
    for (const batch of teamBatches) {
      sources.push(batch);
      for (const team of batch.data.data || []) teamIds.add(Number(team.id));
    }

    const meta = combineSourceMeta(sources);
    return withSource({ leagueIds, teamIds }, meta.source, meta.fetchedAt);
  })();

  return activeAdultDirectoryPromise;
}

function isActiveAdultGame(event: ApiEvent, directory: ActiveAdultDirectory): boolean {
  const attrs = event.attributes;
  return (
    directory.leagueIds.has(Number(attrs.league_id)) ||
    directory.teamIds.has(Number(attrs.hteam_id)) ||
    directory.teamIds.has(Number(attrs.vteam_id))
  );
}

async function apiFetch(endpoint: string, params: Record<string, string> = {}): Promise<SourceResult<ApiResponse>> {
  const url = new URL(`${API_BASE}/${endpoint}`);
  url.searchParams.set('company', COMPANY);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  const cacheKey = buildCacheKey(endpoint, params);

  try {
    const res = await fetch(url.toString(), {
      headers: { Accept: 'application/vnd.api+json' },
    });
    if (!res.ok) throw new Error(`API ${res.status}`);
    const json = await res.json() as ApiResponse;
    const fetchedAt = new Date().toISOString();
    writeCache(cacheKey, json, fetchedAt);
    return withSource(json, 'live', fetchedAt);
  } catch (error) {
    const cached = readCache<ApiResponse>(cacheKey);
    if (cached) {
      return withSource(cached.data, 'cached', cached.fetchedAt);
    }
    throw error;
  }
}

export async function fetchGames(date: string): Promise<SourceResult<ApiEvent[]>> {
  const [res, activeDirectory] = await Promise.all([
    apiFetch('events', {
      'filter[start_date]': date,
      'filter[event_type_id]': 'g',
      sort: 'start',
      'page[size]': '500',
    }),
    fetchActiveAdultDirectory(),
  ]);
  const meta = combineSourceMeta([res, activeDirectory]);
  const games = (res.data.data || []).filter((event) =>
    isActiveAdultGame(event, activeDirectory.data),
  );
  return withSource(games, meta.source, meta.fetchedAt);
}

export async function fetchAllDayEvents(date: string): Promise<SourceResult<ApiEvent[]>> {
  const res = await apiFetch('events', {
    'filter[start_date]': date,
    sort: 'start',
    'page[size]': '500',
  });
  return withSource(res.data.data || [], res.source, res.fetchedAt);
}

export async function fetchAllOpenPlay(): Promise<SourceResult<OpenPlaySession[]>> {
  const all: ApiEvent[] = [];
  let page = 1;
  const pages: Array<{ source: DataSource; fetchedAt: string }> = [];

  while (true) {
    const batch = await apiFetch('events', {
      'filter[event_type_id]': '14',
      sort: 'start',
      'page[size]': '100',
      'page[number]': String(page),
    });
    all.push(...(batch.data.data || []));
    pages.push({ source: batch.source, fetchedAt: batch.fetchedAt });
    const meta = batch.data.meta?.page || {};
    if ((meta['current-page'] || 1) >= (meta['last-page'] || 1)) break;
    page++;
  }

  const sessions = all
    .filter((e) => /vb|volleyball/i.test(e.attributes.desc || ''))
    .map((e) => {
      const a = e.attributes;
      return {
        date: a.start.slice(0, 10),
        start: a.start.slice(11, 16),
        end: a.end.slice(11, 16),
        desc: a.desc || '',
        res: a.resource_id,
      };
    });

  const meta = combineSourceMeta(pages);
  return withSource(sessions, meta.source, meta.fetchedAt);
}

export async function fetchTeamData(): Promise<SourceResult<TeamData>> {
  const seasonBatch = await apiFetch('seasons', { sort: '-id', 'page[size]': '50' });
  const today = toDateStr(new Date());
  const sources: Array<{ source: DataSource; fetchedAt: string }> = [seasonBatch];
  const seasons = selectRelevantAdultSeasons(seasonBatch.data.data || [], today);

  if (!seasons.length) {
    return withSource({ leagues: [], teams: [], teamMap: {} }, seasonBatch.source, seasonBatch.fetchedAt);
  }

  const leagueBatches = await Promise.all(
    seasons.map((season) =>
      apiFetch('leagues', {
        'filter[season_id]': season.id,
        'page[size]': '100',
      }),
    ),
  );
  sources.push(...leagueBatches);

  const skip = /waitlist|sub list|canceled/i;
  const leagues = leagueBatches.flatMap((batch) => batch.data.data || [])
    .filter((l) => !skip.test((l.attributes as any).name))
    .map((l) => ({ id: l.id, name: (l.attributes as any).name as string }));

  const teamsByLeague = await Promise.all(
    leagues.map(async (lg) => {
      const tb = await apiFetch('teams', {
        'filter[league_id]': lg.id,
        'page[size]': '100',
      });
      sources.push(tb);
      return (tb.data.data || []).map((t) => ({
        id: Number(t.id),
        name: (t.attributes as any).name as string,
        leagueId: lg.id,
        leagueName: lg.name,
      }));
    }),
  );

  const teams = teamsByLeague.flat();
  const teamMap: Record<number, typeof teams[number]> = {};
  for (const t of teams) teamMap[t.id] = t;

  // Sort leagues: Epic teams first, then by level (upper > high int > int > rec), then by day
  const isEpic = (n: string) => (/epic/i.test(n) ? 0 : 1);
  const levelOrder = (n: string) => {
    const nl = n.toLowerCase();
    if (nl.includes('upper')) return 0;
    if (nl.includes('high int') || nl.includes('high-int')) return 1;
    if (nl.includes('intermediate') || nl.includes(' int')) return 2;
    if (nl.includes('rec')) return 3;
    return 1.5;
  };
  const dayOrder = (n: string) => {
    const d = parseDayFromLeague(n);
    return d < 0 ? 99 : [2, 3, 4, 0, 5, 6, 1][d] || 99;
  };

  leagues.sort(
    (a, b) =>
      isEpic(a.name) - isEpic(b.name) ||
      levelOrder(a.name) - levelOrder(b.name) ||
      dayOrder(a.name) - dayOrder(b.name),
  );

  const seasonStarts = seasons
    .map((season) => getAttr(season, 'start_date').slice(0, 10))
    .filter(Boolean)
    .sort();
  const seasonEnds = seasons
    .map((season) => getAttr(season, 'end_date').slice(0, 10))
    .filter(Boolean)
    .sort();
  const meta = combineSourceMeta(sources);

  return withSource({
    leagues,
    teams,
    teamMap,
    seasonStart: seasonStarts[0],
    seasonEnd: seasonEnds[seasonEnds.length - 1],
  }, meta.source, meta.fetchedAt);
}

export async function fetchAllSeasonGames(): Promise<SourceResult<Game[]>> {
  const [first, activeDirectory] = await Promise.all([
    apiFetch('events', {
      'filter[event_type_id]': 'g',
      sort: 'start',
      'page[size]': '2000',
      'page[number]': '1',
    }),
    fetchActiveAdultDirectory(),
  ]);
  const sources: Array<{ source: DataSource; fetchedAt: string }> = [first, activeDirectory];
  const all = [...(first.data.data || [])];
  const totalPages = first.data.meta?.page?.['last-page'] || 1;

  if (totalPages > 1) {
    const remaining = await Promise.all(
      Array.from({ length: totalPages - 1 }, (_, i) =>
        apiFetch('events', {
          'filter[event_type_id]': 'g',
          sort: 'start',
          'page[size]': '2000',
          'page[number]': String(i + 2),
        }),
      ),
    );
    for (const batch of remaining) {
      sources.push(batch);
      all.push(...(batch.data.data || []));
    }
  }

  const meta = combineSourceMeta(sources);
  const adultGames = all.filter((event) => isActiveAdultGame(event, activeDirectory.data));
  return withSource(parseGames(adultGames), meta.source, meta.fetchedAt);
}

/** Quick check: how many likely/warning open slots are on a given day */
export async function fetchDayOpenCount(date: string): Promise<SourceResult<OpenCourtSummary>> {
  const raw = await fetchGames(date);
  const games = parseGames(raw.data);
  const courts = discoverCourts(games);
  if (!courts.length) return withSource({ total: -1, likely: 0, warning: 0 }, raw.source, raw.fetchedAt);
  const baseSlots = isStandardVbDay(date) ? getSlotsForDay(date) : [];
  const slots = mergeSlotsWithGameStarts(baseSlots, games);
  const grid = buildGrid(games, courts, slots, null);
  const vbStart = computeVbStart(raw.data, courts);
  return withSource(countOpenSlots(grid, courts, vbStart), raw.source, raw.fetchedAt);
}
