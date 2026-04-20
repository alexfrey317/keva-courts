import { useState, useMemo, useRef, useEffect } from 'react';
import type { League, Team, Theme, TeamColorOverrideMap } from '../../types';
import { TEAM_COLORS } from '../../utils/constants';
import { getTeamColor } from '../../utils/theme';

interface TeamPickerProps {
  leagues: League[];
  teams: Team[];
  selectedIds: number[];
  selectedColors: Map<number, number>;
  colorOverrides: TeamColorOverrideMap;
  theme: Theme;
  onDone: (ids: number[], colorOverrides: TeamColorOverrideMap) => void;
  onClose: () => void;
}

export function TeamPicker({
  leagues,
  teams,
  selectedIds,
  selectedColors,
  colorOverrides: initialOverrides,
  theme,
  onDone,
  onClose,
}: TeamPickerProps) {
  const [selected, setSelected] = useState(() => new Set(selectedIds));
  const [colorOverrides, setColorOverrides] = useState<TeamColorOverrideMap>(() => ({ ...initialOverrides }));
  const [query, setQuery] = useState('');
  const [showColorEditor, setShowColorEditor] = useState(false);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const teamMap = useMemo(() => {
    const map = new Map<number, Team>();
    for (const team of teams) map.set(team.id, team);
    return map;
  }, [teams]);

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

  const selectedOrder = useMemo(() => [...selected], [selected]);
  const selectedTeams = useMemo(
    () => selectedOrder.map((id) => teamMap.get(id)).filter((team): team is Team => Boolean(team)),
    [selectedOrder, teamMap],
  );
  const searching = query.trim().length > 0;

  useEffect(() => {
    if (!selectedTeams.length) setShowColorEditor(false);
  }, [selectedTeams.length]);

  useEffect(() => {
    if (searching) setShowColorEditor(false);
  }, [searching]);

  const getColorIndex = (teamId: number): number => {
    if (colorOverrides[teamId] !== undefined) return colorOverrides[teamId];
    const existing = selectedColors.get(teamId);
    if (existing !== undefined) return existing;
    const orderIndex = selectedOrder.indexOf(teamId);
    return orderIndex >= 0 ? orderIndex : 0;
  };

  const getSelectedStyle = (teamId: number) => {
    if (!selected.has(teamId)) return undefined;
    const color = getTeamColor(getColorIndex(teamId), theme);
    return {
      background: color.bg1,
      color: color.t,
      border: `1px solid ${color.b}`,
    };
  };

  function focusSearchAndClear() {
    setQuery('');
    window.requestAnimationFrame(() => searchRef.current?.focus());
  }

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      const wasSelected = next.has(id);
      if (wasSelected) {
        next.delete(id);
      } else {
        next.add(id);
      }
      if (!wasSelected) focusSearchAndClear();
      return next;
    });
  }

  function removeTeam(id: number) {
    setSelected((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  function done() {
    onDone([...selected], colorOverrides);
    onClose();
  }

  function setColor(teamId: number, colorIndex: number) {
    setColorOverrides((prev) => ({ ...prev, [teamId]: colorIndex }));
  }

  function resetColor(teamId: number) {
    setColorOverrides((prev) => {
      const next = { ...prev };
      delete next[teamId];
      return next;
    });
  }

  function renderTeamButton(tm: Team, showLeague: boolean) {
    const selectedStyle = getSelectedStyle(tm.id);
    const leagueColor = selected.has(tm.id)
      ? getTeamColor(getColorIndex(tm.id), theme).b
      : 'var(--muted)';
    return (
      <button
        type="button"
        key={tm.id}
        className={'picker-team' + (selected.has(tm.id) ? ' sel' : '')}
        onClick={() => toggle(tm.id)}
        style={selectedStyle}
      >
        {selected.has(tm.id) ? '\u2713 ' : ''}
        {tm.name}{' '}
        {showLeague && <span style={{ fontSize: '.7rem', color: leagueColor }}>{tm.leagueName}</span>}
      </button>
    );
  }

  return (
    <div className="picker-overlay" onClick={(e) => { if (e.target === e.currentTarget) done(); }}>
      <div className="picker-modal" role="dialog" aria-modal="true" aria-label="Select your teams">
        <div className="picker-header">
          <h2>Select Your Teams</h2>
          <div className="picker-actions">
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
            ref={searchRef}
            className="picker-search"
            placeholder="Search teams..."
            aria-label="Search teams"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        </div>

        {selectedTeams.length > 0 && !searching && (
          <div className="picker-selected">
            <div className="picker-selected-head">
              <div className="picker-colors-title">Selected Teams</div>
              <button
                type="button"
                className="picker-color-toggle"
                onClick={() => setShowColorEditor((prev) => !prev)}
              >
                {showColorEditor ? 'Hide Colors' : 'Edit Colors'}
              </button>
            </div>

            <div className="picker-selected-list">
              {selectedTeams.map((team) => {
                const teamColor = getTeamColor(getColorIndex(team.id), theme);
                return (
                  <div
                    key={team.id}
                    className="picker-selected-chip"
                    style={{
                      background: teamColor.bg1,
                      color: teamColor.t,
                      border: `1px solid ${teamColor.b}`,
                    }}
                  >
                    <div className="picker-selected-copy">
                      <div className="picker-selected-name">{team.name}</div>
                      <div className="picker-selected-league">{team.leagueName}</div>
                    </div>
                    <button
                      type="button"
                      className="picker-remove"
                      aria-label={`Remove ${team.name}`}
                      onClick={() => removeTeam(team.id)}
                    >
                      Remove
                    </button>
                  </div>
                );
              })}
            </div>

            {showColorEditor && (
              <div className="picker-colors">
                <div className="picker-color-list">
                  {selectedTeams.map((team) => {
                    const colorIndex = getColorIndex(team.id);
                    const activeColor = getTeamColor(colorIndex, theme);
                    const usingDefault = colorOverrides[team.id] === undefined;

                    return (
                      <div key={team.id} className="picker-color-card">
                        <div className="picker-color-head">
                          <div>
                            <div className="picker-color-name" style={{ color: activeColor.t }}>{team.name}</div>
                            <div className="picker-color-league">{team.leagueName}</div>
                          </div>
                          <button
                            type="button"
                            className="picker-color-reset"
                            disabled={usingDefault}
                            onClick={() => resetColor(team.id)}
                          >
                            Auto
                          </button>
                        </div>
                        <div className="picker-swatch-row">
                          {TEAM_COLORS.map((_, idx) => {
                            const swatch = getTeamColor(idx, theme);
                            const active = colorIndex === idx;
                            return (
                              <button
                                key={idx}
                                type="button"
                                className={'picker-swatch' + (active ? ' active' : '')}
                                aria-label={`Set ${team.name} color ${idx + 1}`}
                                onClick={() => setColor(team.id, idx)}
                                style={{
                                  background: `linear-gradient(135deg, ${swatch.bg1}, ${swatch.bg2})`,
                                  borderColor: swatch.b,
                                  color: swatch.t,
                                  boxShadow: active ? `0 0 0 2px ${swatch.b}55` : undefined,
                                }}
                              >
                                {active ? '\u2713' : ''}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="picker-list">
          {filtered
            ? filtered.map((tm) => renderTeamButton(tm, true))
            : leagues.map((lg) => {
                const t = grouped.get(lg.id) || [];
                if (!t.length) return null;
                return (
                  <div key={lg.id}>
                    <div className="picker-league-name">{lg.name}</div>
                    {t.map((tm) => renderTeamButton(tm, false))}
                  </div>
                );
              })}
        </div>
      </div>
    </div>
  );
}
