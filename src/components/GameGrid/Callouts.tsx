import type { Grid, Court } from '../../types';
import { formatTime12, toMinutes } from '../../utils/dates';
import { isOpenSlotLikely } from '../../utils/courts';

interface CalloutsProps {
  grid: Grid;
  courts: Court[];
  vbStart: Record<number, number>;
}

export function Callouts({ grid, courts, vbStart }: CalloutsProps) {
  const items: { text: string; warn: boolean }[] = [];

  for (const row of grid.rows) {
    const slotMin = toMinutes(row.time);
    for (let i = 0; i < row.cells.length; i++) {
      const cell = row.cells[i];
      if (!cell.booked) {
        const netUp = isOpenSlotLikely(courts[i], slotMin, vbStart);
        items.push({
          text: `${cell.court} at ${formatTime12(row.time)}`,
          warn: !netUp,
        });
      }
    }
  }

  if (!items.length || items.length > 8) return null;

  return (
    <div className="callouts">
      {items.map((item, i) => (
        <div key={i} className={'callout' + (item.warn ? ' callout-warn' : '')}>
          <span className={'dot' + (item.warn ? ' dot-warn' : '')} />
          {item.text}
          {item.warn && <span className="callout-net">net?</span>}
        </div>
      ))}
    </div>
  );
}
