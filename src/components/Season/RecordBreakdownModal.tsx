import { useEffect } from 'react';
import type { TeamRecordBreakdown } from '../../types';

interface RecordBreakdownModalProps {
  teamName: string;
  breakdown: TeamRecordBreakdown;
  onClose: () => void;
}

function BreakdownSection({
  title,
  entries,
  emptyCopy,
  tone,
}: {
  title: string;
  entries: TeamRecordBreakdown['wins'];
  emptyCopy: string;
  tone: 'win' | 'loss';
}) {
  return (
    <div className="record-section">
      <div className={'record-section-title ' + tone}>{title}</div>
      {entries.length > 0 ? (
        <div className="record-entry-list">
          {entries.map((entry) => (
            <div key={entry.id} className="record-entry">
              <span className="record-entry-name">{entry.name}</span>
              <span className="record-entry-count">{entry.count}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="record-empty">{emptyCopy}</div>
      )}
    </div>
  );
}

export function RecordBreakdownModal({ teamName, breakdown, onClose }: RecordBreakdownModalProps) {
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
            <h3>{teamName}</h3>
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
          />
          <BreakdownSection
            title="Lost Against"
            entries={breakdown.losses}
            emptyCopy="No completed losses yet."
            tone="loss"
          />
        </div>
      </div>
    </div>
  );
}
