import { useCallback } from 'react';
import { formatDateLong, getDefaultDate, nextVbDay, toDateStr } from '../../utils/dates';
import { useSwipe } from '../../hooks/useSwipe';

interface DayNavProps {
  dateStr: string;
  onDateChange: (d: string) => void;
  volleyballDates?: Set<string>;
}

export function DayNav({ dateStr, onDateChange, volleyballDates }: DayNavProps) {
  const goPrev = useCallback(() => onDateChange(nextVbDay(dateStr, -1, volleyballDates)), [dateStr, onDateChange, volleyballDates]);
  const goNext = useCallback(() => onDateChange(nextVbDay(dateStr, 1, volleyballDates)), [dateStr, onDateChange, volleyballDates]);
  const goToday = useCallback(() => onDateChange(toDateStr(new Date())), [onDateChange]);
  const swipeRef = useSwipe(goNext, goPrev);

  const todayStr = toDateStr(new Date());
  const showToday = dateStr !== todayStr;

  return (
    <div className="day-nav" ref={swipeRef}>
      <button className="day-nav-btn" onClick={goPrev} aria-label="Previous day">&lsaquo;</button>
      <div className="day-nav-center">
        <div className="day-nav-date">{formatDateLong(dateStr)}</div>
        <button
          className={'today-btn' + (showToday ? '' : ' hidden')}
          onClick={goToday}
        >
          Back to today
        </button>
      </div>
      <button className="day-nav-btn" onClick={goNext} aria-label="Next day">&rsaquo;</button>
    </div>
  );
}
