import { useEffect, useState } from 'react';
import { AlertTriangle, Check, Clipboard, FolderOpen, Plug, RotateCcw } from 'lucide-react';
import type { ExtensionStatus } from '@typelens/host-contract';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { getHost, useExtensionStatus } from '@/host';
import { timeAgo } from '@/lib/utils';

/** Re-renders every `ms` so "3 min ago" keeps moving. */
function useNow(ms = 15_000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-3 py-1.5 text-xs">
      <dt className="text-[var(--sub)]">{label}</dt>
      <dd className="min-w-0 break-words text-[var(--text)]">{children}</dd>
    </div>
  );
}

function headline(s: ExtensionStatus): { tone: 'ok' | 'error' | 'sub'; text: string } {
  if (s.endpoint && !s.endpoint.listening) return { tone: 'error', text: 'Not listening' };
  if (!s.paired) return { tone: 'sub', text: 'Waiting for the extension' };
  if (s.connected) return { tone: 'ok', text: 'Connected' };
  return { tone: 'sub', text: 'Waiting for the extension' };
}

/** Desktop only: the extension pushes tests to this app, so there is nothing to sync by hand. */
export function ExtensionPanel() {
  const host = getHost();
  const { status, error, refresh } = useExtensionStatus();
  const now = useNow();
  const [confirmReset, setConfirmReset] = useState(false);
  const [note, setNote] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const run = async (fn: () => Promise<unknown>, done?: string): Promise<void> => {
    setNote(null);
    try {
      await fn();
      if (done) setNote({ kind: 'ok', text: done });
    } catch (e) {
      setNote({ kind: 'error', text: e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : 'Something went wrong.' });
    }
  };

  const head = status ? headline(status) : null;
  const folder = status?.extensionFolder ?? null;
  const p = status?.paired ?? null;
  const unhealthy = p?.health && !p.health.ok;

  return (
    <Card>
      <CardHeader
        title="Browser extension"
        subtitle="The TypeLens extension sends each finished Monkeytype test straight to this app. New tests appear here automatically."
        right={head ? <Badge tone={head.tone}>{head.text}</Badge> : <Badge tone="sub">Checking…</Badge>}
      />

      {error && <p className="text-xs text-error">Could not read the extension status: {error.message}</p>}

      {status && (
        <dl className="divide-y divide-[var(--sub-2)] border-y border-[var(--sub-2)]">
          <Row label="Local endpoint">
            {status.endpoint?.listening ? (
              <span className="inline-flex items-center gap-1.5">
                <Check className="h-3 w-3 text-ok" aria-hidden /> Listening on {status.endpoint.host}:{status.endpoint.port} (this computer only)
              </span>
            ) : (
              <span className="inline-flex items-start gap-1.5 text-error">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden /> {status.endpoint?.error ?? 'The endpoint is not running.'}
              </span>
            )}
          </Row>
          <Row label="Paired extension">
            {p ? (
              <>
                <code className="rounded bg-[var(--bg-dark)] px-1.5 py-0.5">{p.id}</code>
                {p.version && <span className="text-[var(--sub)]"> · version {p.version}</span>}
              </>
            ) : (
              <span className="text-[var(--sub)]">None yet. The first extension that connects is paired automatically.</span>
            )}
          </Row>
          {p && (
            <>
              <Row label="Last contact">{p.lastSeenAt ? timeAgo(p.lastSeenAt, now) : <span className="text-[var(--sub)]">Not since TypeLens started</span>}</Row>
              <Row label="Recorder">
                {p.recorderSeenAt ? (
                  <>Seen on Monkeytype {timeAgo(p.recorderSeenAt, now)}</>
                ) : (
                  <span className="text-[var(--sub)]">Not seen yet. Open monkeytype.com in Chrome.</span>
                )}
              </Row>
              {unhealthy && p.health && (
                <Row label="Warning">
                  <span className="inline-flex items-start gap-1.5 text-error">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                    The recorder could not read part of Monkeytype&rsquo;s page{p.health.missing.length ? ` (${p.health.missing.join(', ')})` : ''}. Tests may be recorded
                    incompletely until the extension is updated.
                  </span>
                </Row>
              )}
            </>
          )}
        </dl>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button variant="primary" size="md" disabled={!folder || !host.capabilities.openFolders} onClick={() => run(() => host.shell.openExtensionFolder())}>
          <FolderOpen className="h-3.5 w-3.5" /> Open extension folder
        </Button>
        {folder && (
          <Button variant="outline" size="md" onClick={() => run(() => navigator.clipboard.writeText(folder), 'Folder path copied.')}>
            <Clipboard className="h-3.5 w-3.5" /> Copy path
          </Button>
        )}
        {p &&
          (confirmReset ? (
            <span className="inline-flex items-center gap-1.5 text-xs">
              <span className="text-[var(--sub)]">Forget this extension?</span>
              <Button
                variant="danger"
                size="sm"
                onClick={() =>
                  run(async () => {
                    await host.extension.resetPairing();
                    setConfirmReset(false);
                    refresh();
                  }, 'Pairing reset. The next extension that connects will be paired.')
                }
              >
                Reset pairing
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmReset(false)}>
                Cancel
              </Button>
            </span>
          ) : (
            <Button variant="outline" size="md" onClick={() => setConfirmReset(true)}>
              <RotateCcw className="h-3.5 w-3.5" /> Reset pairing
            </Button>
          ))}
      </div>
      {note && (
        <p role="status" className={`mt-3 text-xs ${note.kind === 'ok' ? 'text-ok' : 'text-error'}`}>
          {note.text}
        </p>
      )}

      <div className="mt-4 rounded-md border border-[var(--sub-2)] bg-[var(--bg-dark)] p-3 text-xs text-[var(--sub)]">
        <p className="mb-1.5 flex items-center gap-1.5 font-semibold text-[var(--text)]">
          <Plug className="h-3.5 w-3.5" aria-hidden /> Install the extension (once)
        </p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            In Chrome, open <code className="text-[var(--text)]">chrome://extensions</code> and switch on <strong>Developer mode</strong>.
          </li>
          <li>
            Press <strong>Load unpacked</strong> and pick the extension folder{folder ? <> (<code className="break-all text-[var(--text)]">{folder}</code>)</> : ''}.
          </li>
          <li>Finish a test on monkeytype.com. It shows up here within a few seconds.</li>
        </ol>
        <p className="mt-2">
          Edge, Brave, Opera and Vivaldi work the same way. For Firefox, install the signed{' '}
          <code className="text-[var(--text)]">.xpi</code> from the releases page, or for a quick try open{' '}
          <code className="text-[var(--text)]">about:debugging</code> &gt; This Firefox &gt; Load Temporary Add-on and pick{' '}
          <code className="text-[var(--text)]">manifest.json</code> in the <code className="text-[var(--text)]">extension-firefox</code> folder next
          to the one above.
        </p>
      </div>
    </Card>
  );
}
