export const API_BASE = 'https://api.daysmartrecreation.com/api/v1';
export const COMPANY = 'keva';
export const WORKER_URL = 'https://keva-push.alexfrey317.workers.dev';

export const INDOOR_VB_RESOURCES: readonly number[] = [3, 4, 5];
export const SAND_VB_RESOURCES: readonly number[] = [51, 52, 92];
export const VB_RESOURCES: readonly number[] = [...INDOOR_VB_RESOURCES, ...SAND_VB_RESOURCES];
// Indoor defaults; extra sand/reschedule dates are added from actual DaySmart games.
export const VB_DAYS = new Set([0, 2, 3, 4]); // Sun, Tue, Wed, Thu
export const VB_DAYS_ARRAY = [0, 2, 3, 4] as const;

export const WEEKDAY_SLOTS = ['18:00', '18:50', '19:40', '20:30', '21:20', '22:10'];
export const SUNDAY_SLOTS = ['15:00', '15:50', '16:40', '17:30', '18:20', '19:10', '20:00', '20:50', '21:40'];

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MONTH_ABBREVS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const DOW_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export const WEEK_START_OPTIONS = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 6, label: 'Sat' },
];

export const REFRESH_INTERVAL_MS = 3 * 60 * 1000;

import type { TeamColorTuple } from '../types';

export const TEAM_COLORS: TeamColorTuple[] = [
  ['#c4b5fd', '#1a0a2e', '#2d1450', '#7c3aed', '#6d28d9', '#f5f3ff', '#ede9fe', '#a78bfa'],
  ['#f9a8d4', '#2e0a1a', '#4a1030', '#db2777', '#db2777', '#fdf2f8', '#fce7f3', '#f9a8d4'],
  ['#fdba74', '#2e1a00', '#4a2a00', '#ea580c', '#ce4a0c', '#fff7ed', '#ffedd5', '#fdba74'],
  ['#5eead4', '#042f2e', '#0a4a48', '#0d9488', '#0d9488', '#f0fdfa', '#ccfbf1', '#5eead4'],
  ['#93c5fd', '#0a1a2e', '#102a50', '#2563eb', '#2563eb', '#eff6ff', '#dbeafe', '#93c5fd'],
  ['#fda4af', '#2e0a10', '#4a1020', '#e11d48', '#e11d48', '#fff1f2', '#ffe4e6', '#fda4af'],
];
