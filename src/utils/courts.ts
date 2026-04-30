import type { Game, Court, Grid, GridCell, GridRow, ApiEvent, TeamRecordBreakdown, RecordBreakdownEntry, OpenCourtSummary } from '../types';
import { VB_RESOURCES } from './constants';
import { toMinutes } from './dates';

/** Map resource_id + area to human-readable court name */
export function courtName(res: number, area: number): string {
  if (res === 5) return 'Court 1';
  if (res === 4) return 'Court 2';
  if (res === 3 && area === 51) return 'Ct 3 West';
  if (res === 3 && area === 52) return 'Ct 3 East';
  if (res === 3) return 'Court 3';
  return 'Court ?';
}

/** Simple court name from resource_id only */
export function simpleCourtName(res: number): string {
  if (res === 5) return 'Court 1';
  if (res === 4) return 'Court 2';
  if (res === 3) return 'Court 3';
  return 'Court ?';
}

/** Parse raw API events into Game objects, filtering to VB courts */
export function parseGames(raw: ApiEvent[]): Game[] {
  return raw
    .filter((e) => {
      const a = e.attributes;
      return VB_RESOURCES.includes(a.resource_id) && !(a.resource_id === 3 && !a.resource_area_id);
    })
    .map((e) => {
      const a = e.attributes;
      return {
        res: a.resource_id,
        area: a.resource_area_id || 0,
        start: a.start.slice(11, 16),
        end: a.end.slice(11, 16),
        ht: a.hteam_id,
        vt: a.vteam_id,
        hs: a.home_score,
        vs: a.visiting_score,
        date: a.start.slice(0, 10),
      };
    });
}

/** Discover which courts have games scheduled */
export function discoverCourts(games: Game[]): Court[] {
  const seen = new Map<string, Court>();
  for (const g of games) {
    const key = g.res + '-' + g.area;
    if (!seen.has(key)) {
      seen.set(key, { res: g.res, area: g.area, key, name: '' });
    }
  }
  const courts = [...seen.values()].sort((a, b) =>
    a.res !== b.res ? b.res - a.res : a.area - b.area
  );
  for (const c of courts) {
    c.name = courtName(c.res, c.area);
  }
  return courts;
}

/** Compute earliest VB activity per resource (for net confidence) */
export function computeVbStart(allEvents: ApiEvent[], courts: Court[]): Record<number, number> {
  const earliest: Record<number, number> = {};
  const seenRes = new Set<number>();

  for (const c of courts) {
    if (seenRes.has(c.res)) continue;
    seenRes.add(c.res);
    let min = Infinity;

    for (const e of allEvents) {
      const a = e.attributes;
      if (a.resource_id !== c.res) continue;
      const desc = (a.desc || '').toLowerCase();
      const isVb =
        desc.includes('vb') ||
        desc.includes('volleyball') ||
        (a.event_type_id === 'g' && VB_RESOURCES.includes(a.resource_id) && (a.resource_id !== 3 || a.resource_area_id));
      if (isVb) {
        const t = toMinutes(a.start.slice(11, 16));
        if (t < min) min = t;
      }
    }
    earliest[c.res] = min === Infinity ? -1 : min;
  }
  return earliest;
}

export function isOpenSlotLikely(court: Court | undefined, slotMin: number, vbStart: Record<number, number>): boolean {
  if (!court) return false;
  const earliestStart = vbStart[court.res] ?? -1;
  return earliestStart >= 0 && earliestStart <= slotMin;
}

export function countOpenSlots(grid: Grid, courts: Court[], vbStart: Record<number, number>): OpenCourtSummary {
  let likely = 0;
  let warning = 0;

  for (const row of grid.rows) {
    const slotMin = toMinutes(row.time);
    for (let i = 0; i < row.cells.length; i++) {
      if (row.cells[i].booked) continue;
      if (isOpenSlotLikely(courts[i], slotMin, vbStart)) likely++;
      else warning++;
    }
  }

  return {
    total: likely + warning,
    likely,
    warning,
  };
}

/** Build the time x court grid */
export function buildGrid(
  games: Game[],
  courts: Court[],
  slots: string[],
  myTeamIds: Set<number> | null,
): Grid {
  const ids = myTeamIds || new Set<number>();
  const rows: GridRow[] = [];
  let openTotal = 0;

  for (const slot of slots) {
    const slotMin = toMinutes(slot);
    const cells: GridCell[] = courts.map((c) => {
      const game = games.find(
        (g) =>
          g.res === c.res &&
          g.area === c.area &&
          toMinutes(g.start) <= slotMin &&
          slotMin < toMinutes(g.end),
      );
      const booked = !!game;
      const myGame = booked && ids.size > 0 && (ids.has(game!.ht) || ids.has(game!.vt));
      const myTid = myGame ? (ids.has(game!.ht) ? game!.ht : game!.vt) : null;
      const oppId = myGame ? (myTid === game!.ht ? game!.vt : game!.ht) : null;
      const score =
        game && game.hs != null
          ? { h: game.hs, v: game.vs!, myIsHome: myTid === game.ht }
          : null;
      if (!booked) openTotal++;
      return { court: c.name, booked, myGame, myTid, oppId, score };
    });

    rows.push({
      time: slot,
      cells,
      allBooked: cells.every((c) => c.booked),
    });
  }

  return { rows, openTotal };
}

/** Compute W/L record for a team */
export function computeRecord(games: Game[], teamId: number): { w: number; l: number } {
  let w = 0;
  let l = 0;
  for (const g of games) {
    if (g.hs == null) continue;
    const isH = g.ht === teamId;
    const isA = g.vt === teamId;
    if (!isH && !isA) continue;
    const my = isH ? g.hs : g.vs!;
    const th = isH ? g.vs! : g.hs;
    if (my > th) w++;
    else if (th > my) l++;
  }
  return { w, l };
}

/** Compute W/L record plus opponent breakdown for a team */
export function computeRecordBreakdown(
  games: Game[],
  teamId: number,
  teamMap: Record<number, { name: string }>,
): TeamRecordBreakdown {
  let w = 0;
  let l = 0;
  const wins = new Map<number, RecordBreakdownEntry>();
  const losses = new Map<number, RecordBreakdownEntry>();

  for (const g of games) {
    if (g.hs == null) continue;
    const isH = g.ht === teamId;
    const isA = g.vt === teamId;
    if (!isH && !isA) continue;

    const oppId = isH ? g.vt : g.ht;
    const oppName = teamMap[oppId]?.name || 'TBD';
    const my = isH ? g.hs : g.vs!;
    const th = isH ? g.vs! : g.hs;

    if (my > th) {
      w++;
      const prev = wins.get(oppId);
      wins.set(oppId, {
        id: oppId,
        name: oppName,
        count: (prev?.count || 0) + 1,
        games: [...(prev?.games || []), { date: g.date, time: g.start }],
      });
    } else if (th > my) {
      l++;
      const prev = losses.get(oppId);
      losses.set(oppId, {
        id: oppId,
        name: oppName,
        count: (prev?.count || 0) + 1,
        games: [...(prev?.games || []), { date: g.date, time: g.start }],
      });
    }
  }

  const sortEntries = (entries: Iterable<RecordBreakdownEntry>) =>
    [...entries]
      .map((entry) => ({
        ...entry,
        games: [...entry.games].sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time)),
      }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  return {
    teamId,
    w,
    l,
    wins: sortEntries(wins.values()),
    losses: sortEntries(losses.values()),
  };
}

/** Compute standings for a league */
export function computeStandings(
  allGames: Game[],
  teamMap: Record<number, { leagueId: string; name: string }>,
  leagueId: string,
): { id: number; name: string; w: number; l: number }[] {
  const teams: Record<number, { id: number; name: string; w: number; l: number }> = {};

  for (const g of allGames) {
    if (g.hs == null) continue;
    for (const tid of [g.ht, g.vt]) {
      const t = teamMap[tid];
      if (!t || t.leagueId !== leagueId) continue;
      if (!teams[tid]) teams[tid] = { id: tid, name: t.name, w: 0, l: 0 };
      const isH = tid === g.ht;
      const my = isH ? g.hs : g.vs!;
      const th = isH ? g.vs! : g.hs;
      if (my > th) teams[tid].w++;
      else if (th > my) teams[tid].l++;
    }
  }

  return Object.values(teams).sort((a, b) => (b.w - b.l) - (a.w - a.l) || b.w - a.w);
}

/** Detect missing courts */
export function detectMissingCourts(courts: Court[]): string[] {
  const resSet = new Set(courts.map((c) => c.res));
  const missing: string[] = [];
  if (!resSet.has(5)) missing.push('Court 1');
  if (!resSet.has(4)) missing.push('Court 2');
  if (!courts.some((c) => c.res === 3)) missing.push('Court 3');
  return missing;
}

/** Check if Court 3 is basketball (area 0 on resource 3) */
export function hasCourt3Basketball(raw: ApiEvent[]): boolean {
  return raw.some(
    (e) => e.attributes.resource_id === 3 && !e.attributes.resource_area_id && VB_RESOURCES.includes(e.attributes.resource_id),
  );
}
