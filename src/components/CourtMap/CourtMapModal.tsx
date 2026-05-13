interface CourtMapModalProps {
  onClose: () => void;
}

export function CourtMapModal({ onClose }: CourtMapModalProps) {
  return (
    <div className="map-overlay" onClick={onClose}>
      <div className="map-popup" role="dialog" aria-modal="true" aria-label="Court map" onClick={(e) => e.stopPropagation()}>
        <button className="map-close" aria-label="Close" onClick={onClose}>&times;</button>
        <div className="cm-title">KEVA Court Layout</div>
        <svg viewBox="0 0 400 340" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="KEVA court layout diagram">
          <rect x="0" y="0" width="400" height="340" fill="var(--bg)" rx="8" />
          <rect x="210" y="10" width="80" height="200" rx="4" fill="var(--open-bg1)" stroke="var(--open-b)" strokeWidth="1.5" opacity=".3" />
          <text x="250" y="115" textAnchor="middle" fill="var(--muted)" fontSize="9" fontWeight="600">Soccer 1</text>
          <rect x="300" y="10" width="80" height="200" rx="4" fill="var(--open-bg1)" stroke="var(--open-b)" strokeWidth="1.5" opacity=".3" />
          <text x="340" y="115" textAnchor="middle" fill="var(--muted)" fontSize="9" fontWeight="600">Soccer 2</text>
          <rect x="292" y="10" width="6" height="200" fill="var(--panel-b)" opacity=".5" />
          <rect x="20" y="175" width="175" height="55" rx="4" fill="var(--panel)" stroke="var(--panel-b)" strokeWidth="1.5" strokeDasharray="4,2" />
          <text x="107" y="200" textAnchor="middle" fill="var(--heading)" fontSize="11" fontWeight="700">Court 1</text>
          <text x="107" y="213" textAnchor="middle" fill="var(--muted)" fontSize="7">glass enclosed</text>
          <rect x="20" y="105" width="175" height="60" rx="4" fill="var(--panel)" stroke="var(--panel-b)" strokeWidth="1.5" />
          <text x="107" y="138" textAnchor="middle" fill="var(--heading)" fontSize="11" fontWeight="700">Court 2</text>
          <text x="107" y="150" textAnchor="middle" fill="var(--muted)" fontSize="7">open / nets</text>
          <rect x="20" y="10" width="175" height="85" rx="4" fill="var(--panel)" stroke="var(--panel-b)" strokeWidth="1.5" />
          <line x1="107" y1="12" x2="107" y2="93" stroke="var(--panel-b)" strokeWidth="1" strokeDasharray="3,3" />
          <text x="63" y="50" textAnchor="middle" fill="var(--heading)" fontSize="10" fontWeight="700">Ct 3 West</text>
          <text x="63" y="62" textAnchor="middle" fill="var(--muted)" fontSize="7">(outer wall)</text>
          <text x="150" y="50" textAnchor="middle" fill="var(--heading)" fontSize="10" fontWeight="700">Ct 3 East</text>
          <text x="150" y="62" textAnchor="middle" fill="var(--muted)" fontSize="7">(soccer side)</text>
          <rect x="20" y="245" width="60" height="40" rx="4" fill="var(--panel)" stroke="var(--panel-b)" strokeWidth="1" />
          <text x="50" y="268" textAnchor="middle" fill="var(--muted)" fontSize="8" fontWeight="600">WC</text>
          <rect x="90" y="245" width="120" height="40" rx="4" fill="var(--warn-bg1)" stroke="var(--warn-b)" strokeWidth="1" />
          <text x="150" y="268" textAnchor="middle" fill="var(--warn-t)" fontSize="8" fontWeight="600">Food / Sidelines</text>
          <rect x="300" y="220" width="80" height="65" rx="4" fill="var(--my-bg1)" stroke="var(--my-b)" strokeWidth="1.5" />
          <text x="340" y="250" textAnchor="middle" fill="var(--my-t)" fontSize="9" fontWeight="700">Entrance</text>
          <text x="340" y="262" textAnchor="middle" fill="var(--muted)" fontSize="7">Front Desk</text>
          <rect x="20" y="300" width="360" height="28" rx="4" fill="var(--warn-bg1)" stroke="var(--warn-b)" strokeWidth="1.2" opacity=".9" />
          <text x="200" y="311" textAnchor="middle" fill="var(--warn-t)" fontSize="7" fontWeight="700">Outdoor Sand Volleyball</text>
          <rect x="44" y="316" width="86" height="8" rx="2" fill="var(--panel)" stroke="var(--warn-b)" strokeWidth=".8" />
          <rect x="157" y="316" width="86" height="8" rx="2" fill="var(--panel)" stroke="var(--warn-b)" strokeWidth=".8" />
          <rect x="270" y="316" width="86" height="8" rx="2" fill="var(--panel)" stroke="var(--warn-b)" strokeWidth=".8" />
          <text x="87" y="322" textAnchor="middle" fill="var(--heading)" fontSize="5" fontWeight="700">Sand 1</text>
          <text x="200" y="322" textAnchor="middle" fill="var(--heading)" fontSize="5" fontWeight="700">Sand 2</text>
          <text x="313" y="322" textAnchor="middle" fill="var(--heading)" fontSize="5" fontWeight="700">Sand 3</text>
        </svg>
      </div>
    </div>
  );
}
