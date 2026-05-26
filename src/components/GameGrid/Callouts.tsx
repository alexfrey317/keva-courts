import type { Grid, Court } from '../../types';
import { formatTime12, toMinutes } from '../../utils/dates';
import { isOpenSlotLikely, isTournamentAdvanceSlot } from '../../utils/courts';
import type { Game } from '../../types';

interface CalloutsProps {
  grid: Grid;
  courts: Court[];
  vbStart: Record<string, number>;
  tournamentSeason?: boolean;
  rawGames?: Game[];
}

export function Callouts({ grid, courts, vbStart, tournamentSeason, rawGames = [] }: CalloutsProps) {
  const items: { text: string; warn: boolean; tournament: boolean }[] = [];
  const slots = grid.rows.map((r) => r.time);

  for (let rowIndex = 0; rowIndex < grid.rows.length; rowIndex++) {
    const row = grid.rows[rowIndex];
    const slotMin = toMinutes(row.time);
    for (let i = 0; i < row.cells.length; i++) {
      const cell = row.cells[i];
      if (!cell.booked) {
        const netUp = isOpenSlotLikely(courts[i], slotMin, vbStart);
        const tournament = Boolean(tournamentSeason && isTournamentAdvanceSlot(rawGames, courts[i], slots, rowIndex));
        items.push({
          text: `${cell.court} at ${formatTime12(row.time)}`,
          warn: !netUp && !tournament,
          tournament,
        });
      }
    }
  }

  if (!items.length || items.length > 8) return null;

  return (
    <div className="callouts">
      {items.map((item, i) => (
        <div key={i} className={'callout' + (item.tournament ? ' callout-tournament' : item.warn ? ' callout-warn' : '')}>
          <span className={'dot' + (item.tournament ? ' dot-tournament' : item.warn ? ' dot-warn' : '')} />
          {item.text}
          {item.tournament ? <span className="callout-net">tourney</span> : item.warn && <span className="callout-net">net?</span>}
        </div>
      ))}
    </div>
  );
}
