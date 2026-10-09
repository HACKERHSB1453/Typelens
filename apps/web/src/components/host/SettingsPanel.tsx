import { useEffect, useState } from 'react';
import { Download, FolderOpen, RefreshCw } from 'lucide-react';
import type { UpdateState } from '@typelens/host-contract';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Checkbox';
import { Spinner } from '@/components/ui/Spinner';
import { getHost, useAppInfo, useUpdateState } from '@/host';
import { timeAgo } from '@/lib/utils';

export function describeUpdate(s: UpdateState | null): string {
  if (!s) return '';
  switch (s.status) {
    case 'idle':
      return s.checkedAt ? `You have the latest version (checked ${timeAgo(s.checkedAt)}).` : 'Checks for updates automatically.';
    case 'checking':
      return 'Checking for updates…';
    case 'available':
      return `Version ${s.version} is available.`;
    case 'downloading':
      return `Downloading version ${s.version}… ${s.percent}%`;
    case 'ready':
      return `Version ${s.version} is ready. Restart TypeLens to install it.`;
    case 'error':
      return `The update check failed: ${s.message}`;
    case 'unsupported':
      return s.reason;
  }
}

/** App settings that only make sense for an installed app (login item, notifications, updates). */
export function SettingsPanel() {
  const host = getHost();
  const caps = host.capabilities;
  const info = useAppInfo();
  const update = useUpdateState();
  const [login, setLogin] = useState<boolean | null>(null);
  const [notify, setNotify] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (caps.startAtLogin) host.settings.getStartAtLogin().then(setLogin, () => setLogin(false));
    if (caps.notifications) host.settings.getNotifyOnNewTest().then(setNotify, () => setNotify(false));
  }, [host, caps.startAtLogin, caps.notifications]);

  if (!caps.startAtLogin && !caps.notifications && !caps.autoUpdate) return null;

  const fail = (e: unknown): void => setError(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : 'Something went wrong.');

  return (
    <Card>
      <CardHeader title="App" subtitle={info ? `TypeLens ${info.version} · ${info.platform}` : undefined} />
      <div className="space-y-3">
        {caps.startAtLogin && (
          <div>
            <Checkbox
              label="Start TypeLens when I sign in to this computer"
              checked={login ?? false}
              disabled={login === null}
              onChange={(e) => {
                const on = e.target.checked;
                setError(null);
                setLogin(on);
                host.settings.setStartAtLogin(on).catch((err) => (setLogin(!on), fail(err)));
              }}
            />
            <p className="ml-6 mt-0.5 text-xs text-[var(--sub)]">Starts minimised, so the extension can always deliver your tests.</p>
          </div>
        )}
        {caps.notifications && (
          <Checkbox
            label="Show a notification when a new test is recorded"
            checked={notify ?? false}
            disabled={notify === null}
            onChange={(e) => {
              const on = e.target.checked;
              setError(null);
              setNotify(on);
              host.settings.setNotifyOnNewTest(on).catch((err) => (setNotify(!on), fail(err)));
            }}
          />
        )}
        {caps.autoUpdate && (
          <div className="flex flex-wrap items-center gap-3">
            {update?.status === 'ready' ? (
              <Button variant="primary" size="md" onClick={() => host.updates.installAndRestart().catch(fail)}>
                <Download className="h-3.5 w-3.5" /> Restart to update
              </Button>
            ) : (
              <Button
                variant="outline"
                size="md"
                disabled={checking || update?.status === 'checking' || update?.status === 'downloading' || update?.status === 'unsupported'}
                onClick={() => {
                  setChecking(true);
                  host.updates.check().catch(fail).finally(() => setChecking(false));
                }}
              >
                {checking || update?.status === 'checking' ? <Spinner size="sm" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Check for updates
              </Button>
            )}
            <p className="min-w-0 flex-1 text-xs text-[var(--sub)]">{describeUpdate(update)}</p>
          </div>
        )}
        {caps.openFolders && (
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" size="md" onClick={() => host.shell.openDataFolder().catch(fail)}>
              <FolderOpen className="h-3.5 w-3.5" /> Open data folder
            </Button>
            <Button variant="ghost" size="md" onClick={() => host.shell.revealLogs().catch(fail)}>
              Show logs
            </Button>
            {info?.dataDir && <code className="min-w-0 break-all text-[11px] text-[var(--sub)]">{info.dataDir}</code>}
          </div>
        )}
        {error && (
          <p role="alert" className="text-xs text-error">
            {error}
          </p>
        )}
      </div>
    </Card>
  );
}
