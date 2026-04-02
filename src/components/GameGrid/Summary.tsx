import { EmptyState } from '../Common/EmptyState';

interface SummaryProps {
  openTotal: number;
  hasCourts: boolean;
  isVbDay: boolean;
}

export function Summary({ openTotal, hasCourts, isVbDay }: SummaryProps) {
  if (!isVbDay) {
    return (
      <div className="summary not-scheduled">
        <EmptyState variant="rest" />
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
  if (openTotal === 0) {
    return (
      <div className="summary fully-booked">
        <span className="count">Fully booked</span>
      </div>
    );
  }
  return (
    <div className="summary has-open">
      <span className="count">{openTotal}</span>
      <span className="label">open slot{openTotal !== 1 ? 's' : ''}</span>
    </div>
  );
}
