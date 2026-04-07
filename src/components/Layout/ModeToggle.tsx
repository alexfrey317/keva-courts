import type { Mode } from '../../types';

interface ModeToggleProps {
  mode: Mode;
  onChange: (mode: Mode) => void;
}

export function ModeToggle({ mode, onChange }: ModeToggleProps) {
  return (
    <nav aria-label="View mode">
      <div className="mode-toggle">
        <button
          className={'mode-btn' + (mode === 'games' ? ' active-games' : '')}
          onClick={() => onChange('games')}
        >
          Games
        </button>
        <button
          className={'mode-btn' + (mode === 'openplay' ? ' active-op' : '')}
          onClick={() => onChange('openplay')}
        >
          Open Play
        </button>
        <button
          className={'mode-btn' + (mode === 'myteam' ? ' active-my' : '')}
          onClick={() => onChange('myteam')}
        >
          My Team(s)
        </button>
        <button
          className={'mode-btn' + (mode === 'season' ? ' active-my' : '')}
          onClick={() => onChange('season')}
        >
          Season
        </button>
        <button
          className={'mode-btn' + (mode === 'notifications' ? ' active-notif' : '')}
          onClick={() => onChange('notifications')}
        >
          Notifications
        </button>
      </div>
    </nav>
  );
}
