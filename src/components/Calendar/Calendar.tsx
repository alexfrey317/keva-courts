import { useMemo } from 'react';
import { calendarDays, dowHeaders } from '../../utils/dates';
import { MONTH_ABBREVS, WEEK_START_OPTIONS } from '../../utils/constants';

interface CalendarProps {
  selected: string;
  onSelect: (dateStr: string) => void;
  getDots: (dateStr: string) => string[];
  weekStart: number;
  onWeekStartChange: (ws: number) => void;
  viewYear: number;
  viewMonth: number;
  onViewChange: (year: number, month: number) => void;
}

export function Calendar({
  selected,
  onSelect,
  getDots,
  weekStart,
  onWeekStartChange,
  viewYear,
  viewMonth,
  onViewChange,
}: CalendarProps) {
  const cells = useMemo(
    () => calendarDays(viewYear, viewMonth, weekStart),
    [viewYear, viewMonth, weekStart],
  );
  const headers = useMemo(() => dowHeaders(weekStart), [weekStart]);

  const prevMonth = () =>
    onViewChange(
      viewMonth === 0 ? viewYear - 1 : viewYear,
      viewMonth === 0 ? 11 : viewMonth - 1,
    );
  const nextMonth = () =>
    onViewChange(
      viewMonth === 11 ? viewYear + 1 : viewYear,
      viewMonth === 11 ? 0 : viewMonth + 1,
    );

  return (
    <div className="cal">
      <div className="cal-nav">
        <button onClick={prevMonth} aria-label="Previous month">&lsaquo;</button>
        <span className="cal-title">
          {MONTH_ABBREVS[viewMonth]} {viewYear}
        </span>
        <button onClick={nextMonth} aria-label="Next month">&rsaquo;</button>
      </div>

      <div className="ws-toggle">
        {WEEK_START_OPTIONS.map((o) => (
          <button
            key={o.value}
            className={'ws-btn' + (weekStart === o.value ? ' active' : '')}
            onClick={() => onWeekStartChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>

      <div className="cal-grid">
        {headers.map((d, i) => (
          <div key={i} className="cal-dow">{d}</div>
        ))}
        {cells.map((c, i) => {
          let cls = 'cal-day';
          if (c.overflow) cls += ' overflow';
          if (c.isVb) cls += ' vb-day';
          if (c.isToday) cls += ' today';
          if (c.isPast) cls += ' past';
          if (c.str === selected) cls += ' selected';
          const dots = getDots(c.str);

          return (
            <button key={c.str + i} className={cls} onClick={() => onSelect(c.str)} type="button">
              {c.day}
              {dots.length > 0 && (
                <div className="cal-dots">
                  {dots.map((color, j) => (
                    <span
                      key={j}
                      style={{ background: color, boxShadow: `0 0 4px ${color}` }}
                    />
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
