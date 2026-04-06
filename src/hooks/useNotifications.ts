import { useState, useEffect, useCallback } from 'react';

const WORKER_URL = 'https://keva-push.alexfrey317.workers.dev';
const VAPID_PUBLIC = 'BBdxC5b78SO3zZj--WNB2A8K0BCf_6TfIJ2KPkye48mS6LZ6728xv5yYonL459Tfw4x-vyfmydkA1b3HHDomBnM';
const PREFS_KEY = 'keva-notif-prefs';

export interface NotifPrefs {
  enabled: boolean;
  gameDay: boolean;
  scoreAlert: boolean;
  openCourts: boolean;
  openPlay: boolean;
}

const DEFAULT_PREFS: NotifPrefs = {
  enabled: false,
  gameDay: true,
  scoreAlert: true,
  openCourts: false,
  openPlay: false,
};

function loadPrefs(): NotifPrefs {
  try {
    const s = localStorage.getItem(PREFS_KEY);
    if (s) return { ...DEFAULT_PREFS, ...JSON.parse(s) };
  } catch {}
  return { ...DEFAULT_PREFS };
}

function savePrefs(prefs: NotifPrefs): void {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch {}
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

async function subscribePush(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
    });
    return sub;
  } catch {
    return null;
  }
}

async function getExistingSub(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    return reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

async function syncWithWorker(
  sub: PushSubscription,
  prefs: NotifPrefs,
  teams: number[],
): Promise<void> {
  const subJson = sub.toJSON();
  await fetch(`${WORKER_URL}/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subscription: {
        endpoint: sub.endpoint,
        keys: subJson.keys,
      },
      prefs: {
        gameDay: prefs.gameDay,
        scoreAlert: prefs.scoreAlert,
        openCourts: prefs.openCourts,
        openPlay: prefs.openPlay,
      },
      teams,
    }),
  });
}

async function updateWorkerPrefs(
  endpoint: string,
  prefs: NotifPrefs,
  teams: number[],
): Promise<void> {
  await fetch(`${WORKER_URL}/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      endpoint,
      prefs: {
        gameDay: prefs.gameDay,
        scoreAlert: prefs.scoreAlert,
        openCourts: prefs.openCourts,
        openPlay: prefs.openPlay,
      },
      teams,
    }),
  });
}

async function unsubFromWorker(endpoint: string): Promise<void> {
  await fetch(`${WORKER_URL}/subscribe`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint }),
  });
}

export function useNotifications(teams: number[]) {
  const [prefs, setPrefsState] = useState<NotifPrefs>(loadPrefs);
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied',
  );
  const [pushSub, setPushSub] = useState<PushSubscription | null>(null);
  const supported = typeof Notification !== 'undefined' && 'PushManager' in window;

  // Load existing push subscription
  useEffect(() => {
    getExistingSub().then(setPushSub);
  }, []);

  const setPrefs = useCallback(
    (update: Partial<NotifPrefs>) => {
      setPrefsState((prev) => {
        const next = { ...prev, ...update };
        savePrefs(next);
        // Sync with worker if subscribed
        if (pushSub) {
          if (next.enabled) {
            updateWorkerPrefs(pushSub.endpoint, next, teams).catch(() => {});
          } else {
            unsubFromWorker(pushSub.endpoint).catch(() => {});
          }
        }
        return next;
      });
    },
    [pushSub, teams],
  );

  const requestPermission = useCallback(async (): Promise<NotificationPermission> => {
    if (!supported) return 'denied';
    const result = await Notification.requestPermission();
    setPermission(result);

    if (result === 'granted') {
      const sub = await subscribePush();
      if (sub) {
        setPushSub(sub);
        const newPrefs = { ...prefs, enabled: true };
        setPrefsState(newPrefs);
        savePrefs(newPrefs);
        await syncWithWorker(sub, newPrefs, teams);
      }
    }
    return result;
  }, [supported, prefs, teams]);

  // Re-sync when teams change
  useEffect(() => {
    if (pushSub && prefs.enabled) {
      updateWorkerPrefs(pushSub.endpoint, prefs, teams).catch(() => {});
    }
  }, [teams.join(',')]);

  return { prefs, setPrefs, permission, requestPermission, supported, pushSub };
}
