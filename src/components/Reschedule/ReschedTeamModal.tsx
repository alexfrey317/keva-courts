import { useEffect, useMemo, useRef, useState } from 'react';
import type { League, Team } from '../../types';

interface ReschedTeamModalProps {
  leagues: League[];
  teams: Team[];
  title: string;
  excludeTeamId?: number;
  surfaceFilter?: 'sand' | 'indoor';
  seasonFilter?: string;
  onPick: (team: Team) => void;
  onClose: () => void;
}

function teamSurface(team: Team): 'sand' | 'indoor' {
  const name = team.leagueName.toLowerCase();
  if (/\bsand\b/.test(name) || name.includes('beach')) return 'sand';
  return 'indoor';
}

function teamSeasonWord(team: Team): string | null {
  const source = team.seasonName || team.leagueName;
  const match = source.toLowerCase().match(/\b(spring|summer|fall|autumn|winter)\b/);
  return match ? match[1] : null;
}

function normalizeKey(team: Team): string {
  return `${team.leagueId}:${team.name
    .trim()
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ')
    .toLowerCase()}`;
}

function dedupe(source: Team[]): Team[] {
  const seen = new Set<string>();
  return source.filter((team) => {
    const key = normalizeKey(team);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function ReschedTeamModal({
  leagues,
  teams,
  title,
  excludeTeamId,
  surfaceFilter,
  seasonFilter,
  onPick,
  onClose,
}: ReschedTeamModalProps) {
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const visibleTeams = useMemo(
    () =>
      dedupe(teams)
        .filter((team) => team.id !== excludeTeamId)
        .filter((team) => !surfaceFilter || teamSurface(team) === surfaceFilter)
        .filter((team) => !seasonFilter || teamSeasonWord(team) === seasonFilter),
    [teams, excludeTeamId, surfaceFilter, seasonFilter],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, Team[]>();
    for (const league of leagues) map.set(league.id, []);
    for (const team of visibleTeams) {
      const arr = map.get(team.leagueId);
      if (arr) arr.push(team);
    }
    for (const [, arr] of map) arr.sort((a, b) => a.name.localeCompare(b.name));
    return map;
  }, [leagues, visibleTeams]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return visibleTeams.filter(
      (team) => team.name.toLowerCase().includes(q) || team.leagueName.toLowerCase().includes(q),
    );
  }, [query, visibleTeams]);

  const searching = filtered !== null;

  return (
    <div className="picker-overlay" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="picker-modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="picker-header">
          <h2>{title}</h2>
          <div className="picker-actions">
            <button className="picker-done" onClick={onClose} style={{ background: 'var(--panel)', color: 'var(--muted)', border: '1px solid var(--panel-b)' }}>
              Cancel
            </button>
          </div>
        </div>

        <div className="picker-search-wrap">
          <input
            ref={searchRef}
            className="picker-search"
            placeholder="Search teams..."
            aria-label="Search teams"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoFocus
          />
        </div>

        <div className="picker-list">
          {searching ? (
            filtered && filtered.length ? (
              filtered.map((team) => (
                <button
                  key={team.id}
                  type="button"
                  className="picker-team"
                  onClick={() => onPick(team)}
                >
                  {team.name} <span style={{ fontSize: '.7rem', color: 'var(--muted)' }}>{team.leagueName}</span>
                </button>
              ))
            ) : (
              <div className="picker-empty">No teams match that search.</div>
            )
          ) : (
            leagues.map((league) => {
              const list = grouped.get(league.id) || [];
              if (!list.length) return null;
              return (
                <div key={league.id}>
                  <div className="picker-league-name">{league.name}</div>
                  {list.map((team) => (
                    <button
                      key={team.id}
                      type="button"
                      className="picker-team"
                      onClick={() => onPick(team)}
                    >
                      {team.name}
                    </button>
                  ))}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
