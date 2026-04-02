import type { OpenPlaySession } from '../../types';
import { formatTime12 } from '../../utils/dates';
import { simpleCourtName } from '../../utils/courts';
import { generateOpenPlayCalendar, downloadIcs } from '../../utils/calendar';

interface OpenPlayViewProps {
  sessions: OpenPlaySession[];
  allSessions: OpenPlaySession[];
}

export function OpenPlayView({ sessions, allSessions }: OpenPlayViewProps) {
  if (!sessions.length) {
    return (
      <>
        <div className="summary no-op">No open play scheduled for this date</div>
        {allSessions.length > 0 && (
          <button
            className="cal-export-btn"
            onClick={() => {
              const today = new Date().toISOString().slice(0, 10);
              const future = allSessions.filter((s) => s.date >= today);
              const ics = generateOpenPlayCalendar(future);
              downloadIcs(ics, 'keva-open-play.ics');
            }}
          >
            <span aria-hidden="true">📅</span> Export All Open Play
          </button>
        )}
      </>
    );
  }

  return (
    <>
      <div className="summary has-op">
        <span className="count">{sessions.length}</span>
        <span className="label">
          open play session{sessions.length !== 1 ? 's' : ''}
        </span>
      </div>
      <button
        className="cal-export-btn"
        onClick={() => {
          const today = new Date().toISOString().slice(0, 10);
          const future = allSessions.filter((s) => s.date >= today);
          const ics = generateOpenPlayCalendar(future);
          downloadIcs(ics, 'keva-open-play.ics');
        }}
      >
        <span aria-hidden="true">📅</span> Export Open Play
      </button>
      <div className="op-list">
        {sessions.map((s, i) => (
          <div key={i} className="op-card">
            <div className="op-name">{s.desc}</div>
            <div className="op-time">
              {formatTime12(s.start)} &ndash; {formatTime12(s.end)}
            </div>
            <div className="op-court">{simpleCourtName(s.res)}</div>
          </div>
        ))}
      </div>
    </>
  );
}
