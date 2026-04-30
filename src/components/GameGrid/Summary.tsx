import type { OpenCourtSummary } from '../../types';

interface SummaryProps {
  openSummary: OpenCourtSummary;
  hasCourts: boolean;
  isVbDay: boolean;
}

export function Summary({ openSummary, hasCourts, isVbDay }: SummaryProps) {
  if (!isVbDay) {
    return (
      <div className="summary not-scheduled">
        <span className="count">Not a volleyball night</span>
      </div>
    );
  }
  if (!hasCourts) {
    return (
      <div className="summary not-scheduled">
        <span className="count">Not yet scheduled</span>
        <span className="label">Games haven't been posted for this date</span>
      </div>
    );
  }
  if (openSummary.total === 0) {
    return (
      <div className="summary fully-booked">
        <span className="count">Fully booked</span>
      </div>
    );
  }
  if (openSummary.likely === 0) {
    return (
      <div className="summary has-open-warn">
        <span className="count">{openSummary.warning}</span>
        <span className="label">
          early open slot{openSummary.warning !== 1 ? 's' : ''} · net uncertain
        </span>
      </div>
    );
  }
  return (
    <div className="summary has-open">
      <span className="count">{openSummary.likely}</span>
      <span className="label">
        likely open slot{openSummary.likely !== 1 ? 's' : ''}
        {openSummary.warning > 0 && ` · ${openSummary.warning} early uncertain`}
      </span>
    </div>
  );
}
