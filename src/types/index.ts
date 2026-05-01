// Raw API event attributes
export interface EventAttributes {
  resource_id: number;
  resource_area_id: number | null;
  start: string; // ISO datetime
  end: string;
  event_type_id: string;
  league_id?: number;
  hteam_id: number;
  vteam_id: number;
  home_score: number | null;
  visiting_score: number | null;
  desc?: string;
}

export interface ApiEvent {
  id: string;
  attributes: EventAttributes;
}

export interface ApiResponse {
  data: ApiEvent[];
  meta?: {
    page?: {
      'current-page'?: number;
      'last-page'?: number;
    };
  };
}

export type DataSource = 'live' | 'cached';

export interface SourceResult<T> {
  data: T;
  source: DataSource;
  fetchedAt: string;
}

// Parsed game
export interface Game {
  res: number;
  area: number;
  start: string; // "HH:MM"
  end: string;
  ht: number; // home team id
  vt: number; // visiting team id
  hs: number | null; // home score
  vs: number | null; // visiting score
  date: string; // "YYYY-MM-DD"
}

// Court
export interface Court {
  res: number;
  area: number;
  key: string;
  name: string;
}

// Grid cell
export interface GridCell {
  court: string;
  booked: boolean;
  myGame: boolean;
  myTid: number | null;
  oppId: number | null;
  score: { h: number; v: number; myIsHome: boolean } | null;
}

// Grid row
export interface GridRow {
  time: string;
  cells: GridCell[];
  allBooked: boolean;
}

// Full grid
export interface Grid {
  rows: GridRow[];
  openTotal: number;
}

export type MissingCourtReason = 'other_activity' | 'unlisted';

export interface MissingCourtNote {
  court: string;
  reason: MissingCourtReason;
}

export interface OpenCourtSummary {
  total: number;
  likely: number;
  warning: number;
}

// Team
export interface Team {
  id: number;
  name: string;
  leagueId: string;
  leagueName: string;
}

// League
export interface League {
  id: string;
  name: string;
}

// Team data from API
export interface TeamData {
  leagues: League[];
  teams: Team[];
  teamMap: Record<number, Team>;
  seasonStart?: string;
  seasonEnd?: string;
}

// Open play session
export interface OpenPlaySession {
  date: string;
  start: string;
  end: string;
  desc: string;
  res: number;
}

// Game state for a selected day
export interface GameState {
  status: 'loading' | 'ok' | 'error';
  courts: Court[];
  grid: Grid;
  missing: MissingCourtNote[];
  vbStart: Record<string, number>;
  rawGames: Game[];
  updatedAt: string;
  source: DataSource | null;
  fetchedAt: string;
  message?: string;
}

// Theme
export type Theme = 'dark' | 'light';

// Tab modes
export type Mode = 'games' | 'openplay' | 'myteam' | 'season' | 'notifications';

// Team color tuple: [dark-text, dark-bg1, dark-bg2, dark-border, light-text, light-bg1, light-bg2, light-border]
export type TeamColorTuple = [string, string, string, string, string, string, string, string];

export interface TeamColor {
  t: string;
  bg1: string;
  bg2: string;
  b: string;
}

export type TeamColorOverrideMap = Record<number, number>;

export interface TeamRoster {
  teamId: number;
  teamName: string;
  players: string[];
  syncedAt: string;
}

export type TeamRosterMap = Record<number, TeamRoster>;

export interface RecordBreakdownGame {
  date: string;
  time: string;
}

export interface RecordBreakdownEntry {
  id: number;
  name: string;
  count: number;
  games: RecordBreakdownGame[];
}

export interface TeamRecordBreakdown {
  teamId: number;
  w: number;
  l: number;
  wins: RecordBreakdownEntry[];
  losses: RecordBreakdownEntry[];
}

// Calendar day
export interface CalendarDay {
  day: number;
  str: string;
  overflow: boolean;
  isVb: boolean;
  isToday: boolean;
  isPast: boolean;
}

// Season schedule game (processed for display)
export interface SeasonGame {
  date: string;
  time: string;
  myTid: number;
  oppId: number;
  won: boolean | null;
  hs: number | null;
  vs: number | null;
  isHome: boolean;
}

// Standing entry
export interface StandingEntry {
  id: number;
  name: string;
  w: number;
  l: number;
}
