import type { Mode } from '../../types';

interface ModeToggleProps {
  mode: Mode;
  onChange: (mode: Mode) => void;
}

export function ModeToggle({ mode, onChange }: ModeToggleProps) {
  const modes: Array<{ id: Mode; label: string; activeClass: string }> = [
    { id: 'games', label: 'Games', activeClass: 'active-games' },
    { id: 'myteam', label: 'My Teams', activeClass: 'active-my' },
    { id: 'season', label: 'Season', activeClass: 'active-my' },
    { id: 'findsubs', label: 'Find Subs', activeClass: 'active-my' },
    { id: 'openplay', label: 'Open Play', activeClass: 'active-op' },
    { id: 'notifications', label: 'Notifications', activeClass: 'active-notif' },
  ];

  return (
    <nav aria-label="View mode">
      <div className="mode-toggle">
        {modes.map((entry) => (
          <button
            key={entry.id}
            className={`mode-btn mode-btn-${entry.id}${mode === entry.id ? ` ${entry.activeClass}` : ''}`}
            onClick={() => onChange(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
