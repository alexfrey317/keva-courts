import { useEffect, useState } from 'react';
import type { Game, Team, TeamRecordBreakdown, TeamRosterMap } from '../../types';
import type { TeamRosterStatus } from '../../hooks/useTeamRosters';
import { formatShort, formatTime12 } from '../../utils/dates';
import { RosterModal } from '../Common/RosterModal';

interface RecordBreakdownModalProps {
  teamId: number;
  teamName: string;
  breakdown: TeamRecordBreakdown;
  rosters: TeamRosterMap;
  rosterStatus: TeamRosterStatus;
  allGames: Game[];
  teamMap: Record<number, Team>;
  onClose: () => void;
}

function BreakdownSection({
  title,
  entries,
  emptyCopy,
  tone,
  onSelectTeam,
}: {
  title: string;
  entries: TeamRecordBreakdown['wins'];
  emptyCopy: string;
  tone: 'win' | 'loss';
  onSelectTeam: (teamId: number, teamName: string) => void;
}) {
  const [activeEntryKey, setActiveEntryKey] = useState<string | null>(null);

  return (
    <div className="record-section">
      <div className={'record-section-title ' + tone}>{title}</div>
      {entries.length > 0 ? (
        <div className="record-entry-list">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="record-entry"
              onMouseLeave={() => setActiveEntryKey((current) => (current === `${tone}-${entry.id}` ? null : current))}
            >
              <button
                type="button"
                className="standings-team-btn record-entry-team-btn"
                onClick={() => onSelectTeam(entry.id, entry.name)}
                aria-label={`Show ${entry.name} roster`}
              >
                {entry.name}
              </button>
              <div className="record-entry-meta">
                <button
                  type="button"
                  className="record-entry-count"
                  aria-label={`Show ${entry.name} ${title.toLowerCase()} game times`}
                  onMouseEnter={() => setActiveEntryKey(`${tone}-${entry.id}`)}
                  onFocus={() => setActiveEntryKey(`${tone}-${entry.id}`)}
                  onBlur={() => setActiveEntryKey((current) => (current === `${tone}-${entry.id}` ? null : current))}
                  onClick={() =>
                    setActiveEntryKey((current) => (current === `${tone}-${entry.id}` ? null : `${tone}-${entry.id}`))
                  }
                >
                  {entry.count}
                </button>
                {activeEntryKey === `${tone}-${entry.id}` && (
                  <div className="record-entry-popover" role="status">
                    <div className="record-entry-popover-title">Game times</div>
                    <div className="record-entry-times">
                      {entry.games.map((game, index) => (
                        <div key={`${game.date}-${game.time}-${index}`} className="record-entry-time">
                          {formatShort(game.date)} at {formatTime12(game.time)}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="record-empty">{emptyCopy}</div>
      )}
    </div>
  );
}

export function RecordBreakdownModal({
  teamId,
  teamName,
  breakdown,
  rosters,
  rosterStatus,
  allGames,
  teamMap,
  onClose,
}: RecordBreakdownModalProps) {
  const [activeRosterTeam, setActiveRosterTeam] = useState<{ id: number; name: string } | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="record-overlay" onClick={onClose}>
      <div
        className="record-popup"
        role="dialog"
        aria-modal="true"
        aria-label={`${teamName} record breakdown`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="record-header">
          <div>
            <div className="record-kicker">Record Breakdown</div>
            <h3>
              <button
                type="button"
                className="standings-team-btn record-header-team-btn"
                onClick={() => setActiveRosterTeam({ id: teamId, name: teamName })}
                aria-label={`Show ${teamName} roster`}
              >
                {teamName}
              </button>
            </h3>
          </div>
          <button type="button" className="record-close" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="record-summary">
          <span className="record-pill win">{breakdown.w} wins</span>
          <span className="record-pill loss">{breakdown.l} losses</span>
        </div>

        <div className="record-sections">
          <BreakdownSection
            title="Won Against"
            entries={breakdown.wins}
            emptyCopy="No completed wins yet."
            tone="win"
            onSelectTeam={(entryTeamId, entryTeamName) => setActiveRosterTeam({ id: entryTeamId, name: entryTeamName })}
          />
          <BreakdownSection
            title="Lost Against"
            entries={breakdown.losses}
            emptyCopy="No completed losses yet."
            tone="loss"
            onSelectTeam={(entryTeamId, entryTeamName) => setActiveRosterTeam({ id: entryTeamId, name: entryTeamName })}
          />
        </div>
      </div>
      {activeRosterTeam && (
        <RosterModal
          title={activeRosterTeam.name}
          teams={[activeRosterTeam]}
          rosters={rosters}
          status={rosterStatus}
          allGames={allGames}
          teamMap={teamMap}
          onClose={onClose}
        />
      )}
    </div>
  );
}
