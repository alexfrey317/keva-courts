import type { NotifPrefs } from '../../hooks/useNotifications';

interface NotificationsTabProps {
  prefs: NotifPrefs;
  setPrefs: (update: Partial<NotifPrefs>) => void;
  permission: NotificationPermission;
  requestPermission: () => Promise<NotificationPermission>;
  supported: boolean;
  hasTeams: boolean;
}

export function NotificationsTab({
  prefs,
  setPrefs,
  permission,
  requestPermission,
  supported,
  hasTeams,
}: NotificationsTabProps) {
  if (!supported) {
    return (
      <div className="notif-panel">
        <div className="notif-header">
          <h2>Notifications</h2>
          <p className="notif-desc">
            Notifications are not supported in this browser. Try Chrome or add this app to your home screen.
          </p>
        </div>
      </div>
    );
  }

  const denied = permission === 'denied';
  const needsPermission = permission !== 'granted';

  return (
    <div className="notif-panel">
      <div className="notif-header">
        <h2>Notifications</h2>
        <p className="notif-desc">
          Get push alerts for game days, scores, open courts, and open play — even when the app is closed.
        </p>
      </div>

      {denied ? (
        <div className="notif-blocked">
          <p>Notifications are blocked in your browser.</p>
          <p className="notif-hint">
            Tap the lock icon in your address bar and allow notifications for this site.
          </p>
        </div>
      ) : needsPermission ? (
        <div className="notif-enable">
          <button className="notif-enable-btn" onClick={requestPermission}>
            Enable Push Notifications
          </button>
          <p className="notif-hint">
            Your browser will ask for permission. On iOS, add this app to your home screen first.
          </p>
        </div>
      ) : (
        <div className="notif-settings">
          <label className="notif-toggle">
            <span className="notif-toggle-info">
              <strong>Notifications</strong>
              <span className="notif-toggle-desc">Master on/off</span>
            </span>
            <input
              type="checkbox"
              checked={prefs.enabled}
              onChange={(e) => setPrefs({ enabled: e.target.checked })}
            />
            <span className="notif-switch" />
          </label>

          <div className={prefs.enabled ? 'notif-options' : 'notif-options disabled'}>
            <label className="notif-toggle">
              <span className="notif-toggle-info">
                <strong>Game Day Reminders</strong>
                <span className="notif-toggle-desc">Alert when your team plays tonight</span>
              </span>
              <input
                type="checkbox"
                checked={prefs.gameDay}
                disabled={!prefs.enabled}
                onChange={(e) => setPrefs({ gameDay: e.target.checked })}
              />
              <span className="notif-switch" />
            </label>

            <label className="notif-toggle">
              <span className="notif-toggle-info">
                <strong>Score Alerts</strong>
                <span className="notif-toggle-desc">Notify when game scores are posted</span>
              </span>
              <input
                type="checkbox"
                checked={prefs.scoreAlert}
                disabled={!prefs.enabled}
                onChange={(e) => setPrefs({ scoreAlert: e.target.checked })}
              />
              <span className="notif-switch" />
            </label>

            <label className="notif-toggle">
              <span className="notif-toggle-info">
                <strong>Open Court Alerts</strong>
                <span className="notif-toggle-desc">Alert when open volleyball slots are available tonight</span>
              </span>
              <input
                type="checkbox"
                checked={prefs.openCourts}
                disabled={!prefs.enabled}
                onChange={(e) => setPrefs({ openCourts: e.target.checked })}
              />
              <span className="notif-switch" />
            </label>

            <label className="notif-toggle">
              <span className="notif-toggle-info">
                <strong>Open Play Reminders</strong>
                <span className="notif-toggle-desc">Alert when open play sessions are today</span>
              </span>
              <input
                type="checkbox"
                checked={prefs.openPlay}
                disabled={!prefs.enabled}
                onChange={(e) => setPrefs({ openPlay: e.target.checked })}
              />
              <span className="notif-switch" />
            </label>
          </div>

          {!hasTeams && prefs.enabled && (
            <p className="notif-hint" style={{ marginTop: '12px' }}>
              Select your teams in the My Team(s) tab to enable game day and score alerts.
            </p>
          )}

          {prefs.enabled && (
            <button
              className="notif-test-btn"
              onClick={() => {
                navigator.serviceWorker.ready.then((reg) =>
                  reg.showNotification('KEVA Volleyball', {
                    body: 'Push notifications are working!',
                    tag: 'test',
                    icon: 'icon-192.png',
                  }),
                ).catch(() => {
                  new Notification('KEVA Volleyball', { body: 'Notifications are working!' });
                });
              }}
            >
              Send Test Notification
            </button>
          )}
        </div>
      )}
    </div>
  );
}
