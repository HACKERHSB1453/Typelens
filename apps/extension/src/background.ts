/** MV3 service worker: owns the IndexedDB store, answers messages (see handlers.ts) and pushes to the desktop app. */
import { createDb } from './db';
import { handleMessage, updateBadge, type HandlerDeps } from './handlers';
import { pushToDesktop, type DesktopDeps } from './desktop';
import type { Msg } from './protocol';

const SYNC_ALARM = 'typelens-desktop-sync';

const deps: HandlerDeps = {
  db: createDb(),
  storage: { get: (keys) => chrome.storage.local.get(keys), set: (items) => chrome.storage.local.set(items) },
  extVersion: chrome.runtime.getManifest().version,
  setBadge: (text) => {
    void chrome.action.setBadgeText({ text });
    // the dashboard theme: white badge, black number
    void chrome.action.setBadgeBackgroundColor({ color: '#ffffff' });
    void chrome.action.setBadgeTextColor?.({ color: '#000000' });
  },
  syncDesktop: () => pushToDesktop(desktopDeps),
};

const desktopDeps: DesktopDeps = {
  ...deps,
  fetch: (url, init) => fetch(url, init),
  now: () => Date.now(),
};

chrome.runtime.onMessage.addListener((msg: Msg, sender, sendResponse) => {
  const url = sender.url ?? sender.tab?.url;
  handleMessage(msg, url, deps).then(
    (data) => {
      sendResponse(data);
      // a newly stored test goes to the desktop app straight away
      if (msg.type === 'session') void pushToDesktop(desktopDeps);
    },
    (err: unknown) => sendResponse({ error: err instanceof Error ? err.message : String(err) }),
  );
  return true; // async response
});

/**
 * Chrome only runs manifest content scripts in pages loaded AFTER the extension was installed/updated.
 * Attach the recorder to Monkeytype tabs that are already open, so the first test after installing is not
 * silently lost (capture-entry.ts guards against ending up with two recorders in one page).
 */
async function attachToOpenMonkeytypeTabs(): Promise<void> {
  const tabs = await chrome.tabs.query({ url: 'https://monkeytype.com/*' });
  await Promise.all(
    tabs.map((t) =>
      t.id === undefined
        ? undefined
        : chrome.scripting.executeScript({ target: { tabId: t.id }, files: ['capture.js'] }).catch(() => undefined),
    ),
  );
}

/** Service workers are killed when idle, so a periodic alarm is what keeps retrying the desktop app. */
function ensureSyncAlarm(): void {
  chrome.alarms.get(SYNC_ALARM, (alarm) => {
    if (!alarm) chrome.alarms.create(SYNC_ALARM, { periodInMinutes: 1 });
  });
}

// a new Monkeytype theme reaches the desktop app right away instead of with the next alarm
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.mtTheme) void pushToDesktop(desktopDeps);
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SYNC_ALARM) void pushToDesktop(desktopDeps);
});

chrome.runtime.onInstalled.addListener(() => {
  void updateBadge(deps);
  void attachToOpenMonkeytypeTabs();
  ensureSyncAlarm();
  void pushToDesktop(desktopDeps);
});
chrome.runtime.onStartup.addListener(() => {
  void updateBadge(deps);
  ensureSyncAlarm();
  void pushToDesktop(desktopDeps);
});
ensureSyncAlarm();
