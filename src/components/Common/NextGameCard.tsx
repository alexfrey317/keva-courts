import { useMemo } from 'react';
import type { Team, Theme } from '../../types';
import { toDateStr, formatDateLong } from '../../utils/dates';
import { getTeamColor } from '../../utils/theme';

interface NextGameCardProps {
  myTeamDateMap: Map<string, number[]>;
  teamColorMap: Map<number, number>;
  teamMap?: Record<number, Team>;
  theme: Theme;
  dateStr: string;
  onGo: (dateStr: string) => void;
}

export function NextGameCard({
  myTeamDateMap,
  teamColorMap,
  teamMap,
  theme,
  dateStr,
  onGo,
}: NextGameCardProps) {
  const next = useMemo(() => {
    const today = toDateStr(new Date());
    const entries = [...myTeamDateMap.entries()]
      .filter(([d]) => d >= today)
      .sort((a, b) => a[0].localeCompare(b[0]));
    for (const [d, tids] of entries) {
      for (const tid of tids) return { date: d, tid };
    }
    return null;
  }, [myTeamDateMap]);

  if (!next || next.date === dateStr) return null;
  const team = teamMap?.[next.tid];
  if (!team) return null;

  const ci = teamColorMap.get(next.tid);
  const cc = ci !== undefined ? getTeamColor(ci, theme) : null;

  return (
    <button type="button" className="next-game" style={{ cursor: 'pointer' }} onClick={() => onGo(next.date)}>
      <span
        className="ng-badge"
        style={cc ? { background: cc.bg2, color: cc.t, border: `1px solid ${cc.b}` } : {}}
      >
        Next
      </span>
      <div className="ng-detail">
        <div className="ng-vs">{team.name}</div>
        <div className="ng-meta">{formatDateLong(next.date)} &rarr;</div>
      </div>
    </button>
  );
}
