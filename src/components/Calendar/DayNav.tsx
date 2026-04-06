import { useCallback } from 'react';
import { formatDateLong, getDefaultDate, nextVbDay, toDateStr } from '../../utils/dates';
import { useSwipe } from '../../hooks/useSwipe';

interface DayNavProps {
  dateStr: string;
  onDateChange: (d: string) => void;
}

export function DayNav({ dateStr, onDateChange }: DayNavProps) {
  const goPrev = useCallback(() => onDateChange(nextVbDay(dateStr, -1)), [dateStr, onDateChange]);
  const goNext = useCallback(() => onDateChange(nextVbDay(dateStr, 1)), [dateStr, onDateChange]);
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
          Today
        </button>
      </div>
      <button className="day-nav-btn" onClick={goNext} aria-label="Next day">&rsaquo;</button>
    </div>
  );
}
