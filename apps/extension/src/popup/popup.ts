import { DASHBOARD_URL } from '../bridge-origins';
import type { DesktopState } from '../desktop';
import type { Msg } from '../protocol';

interface State {
  paused: boolean;
  health: { ok: boolean; missing: string[] } | null;
  total: number;
  unsynced: number;
  pendingDesktop: number;
  desktop: DesktopState | null;
  last: { wpm: number | null; acc: number | null; at: number; completed: boolean; mode: string } | null;
}

/** The desktop app counts as reachable if it answered within this window (the alarm polls every minute). */
const REACHABLE_MS = 10 * 60_000;

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

async function send<T>(msg: Msg): Promise<T> {
  const res = (await chrome.runtime.sendMessage(msg)) as T & { error?: string };
  if (res && typeof res === 'object' && 'error' in res && res.error) throw new Error(res.error);
  return res;
}

function textEl(tag: string, text: string): HTMLElement {
  const el = document.createElement(tag);
  el.textContent = text;
  return el;
}

/** true when the desktop app answered recently; decides whether "Open" goes to the app or the dev dashboard */
let appReachable = false;

function renderDesktop(s: State): void {
  const d = s.desktop;
  const dot = $('deskDot');
  const text = $('deskText');
  appReachable = !!d?.connected && d.lastOkAt !== undefined && Date.now() - d.lastOkAt < REACHABLE_MS;
  if (d?.pairedElsewhere) {
    dot.className = 'dot err';
    text.textContent = 'Paired with another extension';
  } else if (d?.connected) {
    dot.className = 'dot ok';
    const ver = d.appVersion ? ` · v${d.appVersion}` : '';
    text.textContent = s.pendingDesktop > 0 ? `Connected${ver} · ${s.pendingDesktop} tests waiting` : `Connected${ver} · all tests delivered`;
  } else {
    dot.className = 'dot';
    text.textContent = 'Not running — start the TypeLens app';
  }
  $('open').textContent = appReachable ? 'Open TypeLens app' : 'Open web dashboard (dev)';
}

async function refresh(): Promise<void> {
  const s = await send<State>({ type: 'popup:state' });
  $('total').textContent = String(s.total);
  $('unsynced').textContent = String(s.unsynced);
  ($('rec') as HTMLInputElement).checked = !s.paused;
  $('recLabel').textContent = s.paused ? 'Paused' : 'Recording';
  renderDesktop(s);

  const warn = $('warn');
  if (s.health && !s.health.ok) {
    warn.hidden = false;
    warn.textContent = `Monkeytype's page changed; TypeLens can't find: ${s.health.missing.join(', ')}. Recording may not work until the extension is updated.`;
  } else {
    warn.hidden = true;
  }

  const last = $('last');
  last.replaceChildren();
  if (s.last) {
    const when = new Date(s.last.at).toLocaleString();
    const stats = s.last.wpm !== null ? `${Math.round(s.last.wpm)} wpm, ${Math.round(s.last.acc ?? 0)}% acc` : 'no result';
    last.append('Last: ', textEl('b', stats), ` · ${s.last.mode}${s.last.completed ? '' : ' (incomplete)'} · ${when}`);
  } else {
    last.textContent = 'No tests recorded yet. Open monkeytype.com and finish a test.';
  }
}

($('rec') as HTMLInputElement).addEventListener('change', async (e) => {
  await chrome.storage.local.set({ paused: !(e.target as HTMLInputElement).checked });
  await refresh();
});

$('open').addEventListener('click', () => {
  // typelens:// hands off to the desktop app (brings it to the front); otherwise the dev dashboard
  void chrome.tabs.create({ url: appReachable ? 'typelens://open' : DASHBOARD_URL });
});

$('sync').addEventListener('click', async () => {
  const btn = $('sync') as HTMLButtonElement;
  btn.disabled = true;
  btn.textContent = 'Syncing…';
  try {
    await send<DesktopState>({ type: 'popup:sync' });
    await refresh();
  } catch (err) {
    $('last').textContent = `Sync failed: ${err instanceof Error ? err.message : String(err)}`;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sync now';
  }
});

$('export').addEventListener('click', async () => {
  const json = await send<string>({ type: 'export' });
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `typelens-export-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
});

refresh().catch((err) => {
  $('last').textContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
});
