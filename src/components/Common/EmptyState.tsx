interface EmptyStateProps {
  variant: 'rest' | 'pick-team' | 'no-sessions';
}

function VolleyballSvg() {
  return (
    <g>
      <circle cx="50" cy="50" r="28" fill="none" stroke="var(--dim)" strokeWidth="2" />
      <path d="M22 50 Q35 35 50 22" fill="none" stroke="var(--dim)" strokeWidth="1.5" />
      <path d="M78 50 Q65 35 50 22" fill="none" stroke="var(--dim)" strokeWidth="1.5" />
      <path d="M30 73 Q50 60 70 73" fill="none" stroke="var(--dim)" strokeWidth="1.5" />
    </g>
  );
}

export function EmptyState({ variant }: EmptyStateProps) {
  return (
    <div style={{ textAlign: 'center', padding: '8px 0 4px', opacity: 0.6 }}>
      <svg width="100" height="100" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <VolleyballSvg />
        {variant === 'rest' && (
          <>
            <circle cx="80" cy="18" r="8" fill="none" stroke="var(--muted)" strokeWidth="1.5" />
            <circle cx="80" cy="18" r="5" fill="var(--muted)" opacity=".3" />
            <circle cx="70" cy="10" r="1.5" fill="var(--muted)" opacity=".5" />
            <circle cx="90" cy="12" r="1" fill="var(--muted)" opacity=".4" />
            <circle cx="85" cy="8" r="1.5" fill="var(--muted)" opacity=".5" />
          </>
        )}
        {variant === 'pick-team' && (
          <>
            <rect x="74" y="14" width="16" height="16" rx="4" fill="var(--my-bg2)" stroke="var(--my-b)" strokeWidth="1.5" />
            <line x1="82" y1="18" x2="82" y2="26" stroke="var(--my-t)" strokeWidth="2" strokeLinecap="round" />
            <line x1="78" y1="22" x2="86" y2="22" stroke="var(--my-t)" strokeWidth="2" strokeLinecap="round" />
          </>
        )}
        {variant === 'no-sessions' && (
          <>
            <circle cx="82" cy="20" r="10" fill="none" stroke="var(--muted)" strokeWidth="1.5" />
            <line x1="82" y1="14" x2="82" y2="20" stroke="var(--muted)" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="82" y1="20" x2="87" y2="22" stroke="var(--muted)" strokeWidth="1.5" strokeLinecap="round" />
          </>
        )}
      </svg>
    </div>
  );
}
