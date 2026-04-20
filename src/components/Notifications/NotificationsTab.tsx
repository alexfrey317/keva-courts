import { useState } from 'react';
import type { NotifPrefs } from '../../hooks/useNotifications';
import { WORKER_URL } from '../../utils/constants';

interface NotificationsTabProps {
  prefs: NotifPrefs;
  setPrefs: (update: Partial<NotifPrefs>) => void;
  permission: NotificationPermission;
  requestPermission: () => Promise<NotificationPermission>;
  supported: boolean;
  hasTeams: boolean;
  pushSub: PushSubscription | null;
}

export function NotificationsTab({
  prefs,
  setPrefs,
  permission,
  requestPermission,
  supported,
  hasTeams,
  pushSub,
}: NotificationsTabProps) {
  const [sendingTest, setSendingTest] = useState(false);
  const [testStatus, setTestStatus] = useState('');
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent.toLowerCase() : '';
  const isIos = /iphone|ipad|ipod/.test(ua);
  const isStandalone = typeof window !== 'undefined'
    && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true);

  if (!supported) {
    return (
      <div className="notif-panel">
        <div className="notif-header">
          <h2>Notifications</h2>
          <p className="notif-desc">
            Push alerts are not available in this browser context yet.
          </p>
        </div>
        <div className="notif-guide">
          <p className="notif-guide-title">What to try</p>
          <p className="notif-hint">
            {isIos
              ? 'On iPhone or iPad, install the app from Share > Add to Home Screen, then open the installed app and try again.'
              : 'Use Chrome or Edge, or install the PWA, then return here to enable alerts.'}
          </p>
        </div>
      </div>
    );
  }

  const denied = permission === 'denied';
  const needsPermission = permission !== 'granted';

  const sendRealTestPush = async () => {
    if (!pushSub) {
      setTestStatus('Push subscription missing. Re-enable notifications to register this device.');
      return;
    }

    const subJson = pushSub.toJSON();
    if (!subJson.keys?.p256dh || !subJson.keys?.auth) {
      setTestStatus('Push subscription keys are missing. Re-enable notifications and try again.');
      return;
    }

    setSendingTest(true);
    setTestStatus('Sending real push test. Switch apps or lock your phone now.');

    try {
      const response = await fetch(`${WORKER_URL}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: {
            endpoint: pushSub.endpoint,
            keys: subJson.keys,
          },
          delaySeconds: isIos ? 8 : 4,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Test push failed.');
      }

      setTestStatus(isIos
        ? 'Real push queued. Leave the app now; it should arrive in about 8 seconds.'
        : 'Real push queued. It should arrive in a few seconds even if you switch tabs.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Test push failed.';
      setTestStatus(message);
    } finally {
      setSendingTest(false);
    }
  };

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
            {isIos
              ? 'Open the installed app, then allow notifications in iPhone Settings for this app.'
              : 'Open the site settings from the lock icon in your address bar and allow notifications.'}
          </p>
        </div>
      ) : needsPermission ? (
        <div className="notif-enable">
          <div className="notif-guide">
            <p className="notif-guide-title">Before you enable alerts</p>
            <p className="notif-hint">
              {isIos && !isStandalone
                ? 'Install the app to your Home Screen first. Safari only allows push from the installed app.'
                : 'You can enable alerts here, then fine-tune which ones you want below.'}
            </p>
            {!hasTeams && (
              <p className="notif-hint">
                Select your teams first if you want game day and score alerts. Open court and open play alerts can work without teams.
              </p>
            )}
          </div>
          <button className="notif-enable-btn" onClick={requestPermission}>
            Enable Push Notifications
          </button>
          <p className="notif-hint">
            {isIos
              ? 'After the prompt, keep using the Home Screen app for the best results.'
              : 'Your browser will ask for permission, then alerts can arrive even when the app is closed.'}
          </p>
        </div>
      ) : (
        <div className="notif-settings">
          <div className="notif-guide compact">
            <p className="notif-guide-title">Alert readiness</p>
            <p className="notif-hint">
              {hasTeams
                ? 'Game day and score alerts are ready for your selected teams.'
                : 'Select teams in My Teams if you want game day and score alerts.'}
            </p>
            {isIos && !isStandalone && (
              <p className="notif-hint">
                Keep using the installed Home Screen app on iPhone or iPad so alerts continue to work reliably.
              </p>
            )}
          </div>

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
              disabled={sendingTest}
              onClick={() => void sendRealTestPush()}
            >
              {sendingTest ? 'Sending Test Push...' : 'Send Real Test Push'}
            </button>
          )}
          {testStatus && (
            <p className="notif-hint" style={{ marginTop: '12px' }}>
              {testStatus}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
