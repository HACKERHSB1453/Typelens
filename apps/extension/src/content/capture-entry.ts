/**
 * Content script for monkeytype.com: wires the pure capture logic to chrome.* APIs.
 *
 * It arrives two ways: declared in the manifest (pages loaded after install) and injected by the
 * background into Monkeytype tabs that were already open when the extension was installed or updated.
 * The guard below makes sure a page never ends up with two live recorders (duplicate sessions).
 */
import type { Session } from '@typelens/core/schema';
import { Recorder } from '../recorder';
import { attachCapture } from './capture';
import type { Health } from '../selectors';

interface Live {
  alive(): boolean;
  detach(): void;
}
const g = globalThis as typeof globalThis & { __typelensCapture?: Live };

/** A recorder from an extension version that was reloaded/updated has a dead chrome.runtime. */
const runtimeAlive = (): boolean => {
  try {
    return typeof chrome !== 'undefined' && !!chrome.runtime?.id;
  } catch {
    return false;
  }
};

if (!g.__typelensCapture?.alive()) {
  g.__typelensCapture?.detach(); // an orphan from an older extension instance: stop it listening
  start();
}

function start(): void {
  let paused = false;
  chrome.storage.local.get('paused').then((r) => {
    paused = r.paused === true;
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.paused) paused = changes.paused.newValue === true;
  });

  const recorder = new Recorder({
    now: () => Date.now(),
    uuid: () => crypto.randomUUID(),
    extVersion: chrome.runtime.getManifest().version,
  });

  let lastHealth = '';
  const reportHealth = (h: Health): void => {
    const key = JSON.stringify(h);
    if (key === lastHealth) return;
    lastHealth = key;
    chrome.storage.local.set({ health: h }).catch(() => undefined);
  };

  const cap = attachCapture({
    doc: document,
    win: window,
    recorder,
    send: (session: Session) => {
      // the extension may have been reloaded under a still-open tab; never throw into the page
      chrome.runtime.sendMessage({ type: 'session', session }).catch(() => undefined);
    },
    isPaused: () => paused,
    readConfigJson: () => {
      try {
        return localStorage.getItem('config');
      } catch {
        return null;
      }
    },
    reportHealth,
  });

  // lets the dashboard tell "no recorder on Monkeytype" apart from "recorded nothing yet"
  chrome.storage.local.set({ recorderSeenAt: Date.now() }).catch(() => undefined);

  g.__typelensCapture = { alive: runtimeAlive, detach: cap.detach };
}
