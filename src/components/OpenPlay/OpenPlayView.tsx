import type { OpenPlaySession } from '../../types';
import { compareDateTime, formatDateLong, formatTime12, isUpcomingTimeRange } from '../../utils/dates';
import { simpleCourtName } from '../../utils/courts';
import { generateOpenPlayCalendar, downloadIcs } from '../../utils/calendar';

interface OpenPlayViewProps {
  selectedDate: string;
  sessions: OpenPlaySession[];
  allSessions: OpenPlaySession[];
}

function exportOpenPlay(allSessions: OpenPlaySession[]) {
  const now = new Date();
  const future = allSessions.filter((s) => isUpcomingTimeRange(s.date, s.end, now));
  const ics = generateOpenPlayCalendar(future);
  downloadIcs(ics, 'keva-open-play.ics');
}

export function OpenPlayView({ selectedDate, sessions, allSessions }: OpenPlayViewProps) {
  const now = new Date();
  const nextSession = allSessions
    .slice()
    .sort((a, b) => compareDateTime(a.date, a.start, b.date, b.start))
    .find((session) => session.date > selectedDate || (session.date === selectedDate && isUpcomingTimeRange(session.date, session.end, now)));

  if (!sessions.length) {
    return (
      <>
        <div className="summary no-op">No open play scheduled for this date</div>
        {nextSession && (
          <div className="op-next-card">
            <div className="op-next-kicker">Next session</div>
            <div className="op-next-title">{formatDateLong(nextSession.date)}</div>
            <div className="op-next-meta">
              {formatTime12(nextSession.start)} &middot; {simpleCourtName(nextSession.res)}
            </div>
            <div className="op-next-desc">{nextSession.desc}</div>
          </div>
        )}
        {allSessions.length > 0 && (
          <button
            className="cal-export-btn"
            onClick={() => exportOpenPlay(allSessions)}
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
        onClick={() => exportOpenPlay(allSessions)}
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
