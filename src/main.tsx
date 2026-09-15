import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Service worker registration
if ('serviceWorker' in navigator) {
  const params = new URLSearchParams(location.search);
  if (params.has('reset')) {
    navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister()));
    caches.keys().then((ks) => ks.forEach((k) => caches.delete(k)));
    // Also drop the API/season data caches. Saved teams, prefs, outages and the
    // push device id are user state and are kept.
    try {
      const doomed: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('keva-api-cache:') || key.startsWith('keva-season-games'))) doomed.push(key);
      }
      doomed.forEach((key) => localStorage.removeItem(key));
    } catch {
      // Storage unavailable.
    }
    const url = new URL(location.href);
    url.searchParams.delete('reset');
    location.replace(url.toString());
  } else {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
