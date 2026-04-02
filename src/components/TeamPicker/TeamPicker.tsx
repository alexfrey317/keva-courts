import { useState, useMemo } from 'react';
import type { League, Team } from '../../types';

interface TeamPickerProps {
  leagues: League[];
  teams: Team[];
  selectedIds: number[];
  onDone: (ids: number[]) => void;
  onClose: () => void;
}

export function TeamPicker({ leagues, teams, selectedIds, onDone, onClose }: TeamPickerProps) {
  const [selected, setSelected] = useState(() => new Set(selectedIds));
  const [query, setQuery] = useState('');

  const grouped = useMemo(() => {
    const map = new Map<string, Team[]>();
    for (const lg of leagues) map.set(lg.id, []);
    for (const t of teams) {
      const arr = map.get(t.leagueId);
      if (arr) arr.push(t);
    }
    for (const [, arr] of map) arr.sort((a, b) => a.name.localeCompare(b.name));
    return map;
  }, [leagues, teams]);

  const filtered = useMemo(() => {
    if (!query.trim()) return null;
    const q = query.toLowerCase();
    return teams.filter(
      (t) => t.name.toLowerCase().includes(q) || t.leagueName.toLowerCase().includes(q),
    );
  }, [query, teams]);

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function done() {
    onDone([...selected]);
    onClose();
  }

  return (
    <div className="picker-overlay" onClick={(e) => { if (e.target === e.currentTarget) done(); }}>
      <div className="picker-modal" role="dialog" aria-modal="true" aria-label="Select your teams">
        <div className="picker-header">
          <h2>Select Your Teams</h2>
          <div style={{ display: 'flex', gap: '6px' }}>
            {selected.size > 0 && (
              <button
                className="picker-done"
                style={{ background: 'var(--panel)', color: 'var(--muted)', border: '1px solid var(--panel-b)' }}
                onClick={() => setSelected(new Set())}
              >
                Clear all
              </button>
            )}
            <button className="picker-done" onClick={done}>
              Done{selected.size > 0 && ` (${selected.size})`}
            </button>
          </div>
        </div>

        <div className="picker-search-wrap">
          <input
            className="picker-search"
            placeholder="Search teams..."
            aria-label="Search teams"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        </div>

        <div className="picker-list">
          {filtered
            ? filtered.map((tm) => (
                <button
                  type="button"
                  key={tm.id}
                  className={'picker-team' + (selected.has(tm.id) ? ' sel' : '')}
                  onClick={() => toggle(tm.id)}
                >
                  {selected.has(tm.id) ? '\u2713 ' : ''}
                  {tm.name}{' '}
                  <span style={{ fontSize: '.7rem', color: 'var(--muted)' }}>{tm.leagueName}</span>
                </button>
              ))
            : leagues.map((lg) => {
                const t = grouped.get(lg.id) || [];
                if (!t.length) return null;
                return (
                  <div key={lg.id}>
                    <div className="picker-league-name">{lg.name}</div>
                    {t.map((tm) => (
                      <button
                        type="button"
                        key={tm.id}
                        className={'picker-team' + (selected.has(tm.id) ? ' sel' : '')}
                        onClick={() => toggle(tm.id)}
                      >
                        {selected.has(tm.id) ? '\u2713 ' : ''}
                        {tm.name}
                      </button>
                    ))}
                  </div>
                );
              })}
        </div>
      </div>
    </div>
  );
}
