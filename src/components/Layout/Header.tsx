import type { Theme } from '../../types';

interface HeaderProps {
  theme: Theme;
  onToggleTheme: () => void;
  onShowMap: () => void;
  onShare: () => void;
  copied: boolean;
}

export function Header({ theme, onToggleTheme, onShowMap, onShare, copied }: HeaderProps) {
  return (
    <>
      <div className="header">
        <h1>KEVA Volleyball</h1>
      </div>
      {copied && <div className="copied">Link copied!</div>}
      <div className="subtitle">
        <span>Courts, Teams &amp; Open Play</span>
        <div className="hdr-btns">
          <button className="icon-btn" onClick={onShowMap} title="Court map" aria-label="Court map">
            &#127967;
          </button>
          <button className="icon-btn" onClick={onShare} title="Copy link" aria-label="Copy link">
            &#128279;
          </button>
          <button className="icon-btn" onClick={onToggleTheme} title="Toggle theme" aria-label="Toggle theme">
            {theme === 'dark' ? '\u2600' : '\u263E'}
          </button>
        </div>
      </div>
    </>
  );
}
