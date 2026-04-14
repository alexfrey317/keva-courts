import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import type { TeamRosterMap } from '../../types';

interface TeamRosterNameProps {
  teamId: number;
  name: string;
  rosters: TeamRosterMap;
  className?: string;
  style?: CSSProperties;
}

export function TeamRosterName({
  teamId,
  name,
  rosters,
  className,
  style,
}: TeamRosterNameProps) {
  const players = rosters[teamId]?.players ?? [];
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const popoverId = useId();

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  if (!players.length) {
    return (
      <span className={className} style={style}>
        {name}
      </span>
    );
  }

  return (
    <span
      ref={rootRef}
      className="team-roster"
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className={`team-roster-trigger${className ? ` ${className}` : ''}`}
        style={style}
        aria-expanded={open}
        aria-controls={popoverId}
        aria-haspopup="dialog"
        onMouseEnter={() => setOpen(true)}
        onFocus={() => setOpen(true)}
        onBlur={(event) => {
          if (rootRef.current?.contains(event.relatedTarget as Node | null)) return;
          setOpen(false);
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        {name}
      </button>

      {open && (
        <span
          id={popoverId}
          role="dialog"
          aria-label={`${name} roster`}
          className="team-roster-popover"
        >
          <span className="team-roster-popover-title">
            {players.length} {players.length === 1 ? 'player' : 'players'}
          </span>
          <span className="team-roster-list">
            {players.map((player) => (
              <span key={player} className="team-roster-player">
                {player}
              </span>
            ))}
          </span>
        </span>
      )}
    </span>
  );
}
