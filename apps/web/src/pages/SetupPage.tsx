import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Check, Clipboard, ExternalLink, FolderOpen, PartyPopper } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { getHost, useExtensionStatus } from '@/host';
import { useSourceInfo } from '@/data';
import { cn } from '@/lib/utils';

const RELEASES_URL = 'https://github.com/HACKERHSB1453/Typelens/releases/latest';
const MONKEYTYPE_URL = 'https://monkeytype.com';

export type BrowserId = 'chrome' | 'edge' | 'brave' | 'opera' | 'vivaldi' | 'firefox';

const BROWSERS: Array<{ id: BrowserId; name: string }> = [
  { id: 'chrome', name: 'Chrome' },
  { id: 'edge', name: 'Edge' },
  { id: 'brave', name: 'Brave' },
  { id: 'opera', name: 'Opera' },
  { id: 'vivaldi', name: 'Vivaldi' },
  { id: 'firefox', name: 'Firefox' },
];

/** The browser this page runs in, as a starting tab (the desktop app's window reports Chrome). */
export function detectBrowser(ua: string, isBrave = false): BrowserId {
  if (/Firefox\//.test(ua)) return 'firefox';
  if (/Edg\//.test(ua)) return 'edge';
  if (/OPR\//.test(ua)) return 'opera';
  if (/Vivaldi\//.test(ua)) return 'vivaldi';
  if (isBrave) return 'brave';
  return 'chrome';
}

/** The Firefox build sits next to the Chromium one: extension -> extension-firefox, dist -> dist-firefox. */
export function firefoxFolder(folder: string | null): string | null {
  if (!folder) return null;
  const m = /^(.*?)(extension|dist)([\\/]?)$/.exec(folder);
  return m ? `${m[1]}${m[2]}-firefox${m[3]}` : null;
}

function useCopy(): [string | null, (text: string) => void] {
  const [copied, setCopied] = useState<string | null>(null);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(null), 1500);
    return () => clearTimeout(t);
  }, [copied]);
  return [copied, (text) => void navigator.clipboard?.writeText(text).then(() => setCopied(text), () => undefined)];
}

/** Something to type or paste, with a Copy button. */
function CopyBox({ text, copied, onCopy }: { text: string; copied: string | null; onCopy: (t: string) => void }) {
  return (
    <span className="mt-1 flex max-w-full items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded-md border border-[var(--sub-2)] bg-[var(--bg-dark)] px-2 py-1 text-[var(--text)]" title={text}>
        {text}
      </code>
      <Button size="sm" variant="outline" onClick={() => onCopy(text)} aria-label={`Copy ${text}`}>
        {copied === text ? <Check className="h-3 w-3" aria-hidden /> : <Clipboard className="h-3 w-3" aria-hidden />}
        {copied === text ? 'Copied' : 'Copy'}
      </Button>
    </span>
  );
}

function Step({ n, title, done, children, optional }: { n: number; title: string; done: boolean; children: ReactNode; optional?: boolean }) {
  return (
    <Card className={cn('relative', done && 'border-main/40')}>
      <div className="flex gap-4">
        <span
          className={cn(
            'grid h-8 w-8 shrink-0 place-items-center rounded-full border text-sm font-bold',
            done ? 'border-[var(--main)] bg-[var(--main)] text-[var(--bg)]' : 'border-[var(--sub)] text-[var(--text)]',
          )}
          aria-hidden
        >
          {done ? <Check className="h-4 w-4" /> : n}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[var(--text)]">
            {title}
            {done && <span className="rounded bg-main/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--main)]">Done</span>}
            {optional && !done && <span className="rounded bg-[var(--bg-elev)] px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-[var(--sub)]">Optional</span>}
          </h2>
          <div className="mt-2 space-y-3 text-xs leading-relaxed text-[var(--sub)]">{children}</div>
        </div>
      </div>
    </Card>
  );
}

function Ol({ children }: { children: ReactNode }) {
  return <ol className="list-decimal space-y-2 pl-5 text-[var(--text)] marker:text-[var(--sub)]">{children}</ol>;
}

/** Click-by-click instructions to load the extension from a folder, for one browser. */
function LoadSteps({
  browser,
  folder,
  firefox,
  fromZip,
  copied,
  onCopy,
}: {
  browser: BrowserId;
  folder: string | null;
  firefox: string | null;
  fromZip: boolean;
  copied: string | null;
  onCopy: (t: string) => void;
}) {
  const host = getHost();
  const openFolder = host.capabilities.openFolders && folder;
  const folderLine = (f: string | null, zipName: string) =>
    f ? (
      <CopyBox text={f} copied={copied} onCopy={onCopy} />
    ) : fromZip ? (
      <span className="block text-[var(--sub)]">
        the folder you unzipped <code className="text-[var(--text)]">{zipName}</code> into
      </span>
    ) : (
      <span className="block text-[var(--sub)]">the extension folder that came with TypeLens</span>
    );

  if (browser === 'firefox') {
    return (
      <>
        <p>
          <strong className="text-[var(--text)]">Permanent install (recommended):</strong> if the{' '}
          <a className="underline hover:text-[var(--text)]" href={RELEASES_URL} target="_blank" rel="noreferrer">
            latest release
          </a>{' '}
          has a file ending in <code className="text-[var(--text)]">.xpi</code>, open it with Firefox and click <strong className="text-[var(--text)]">Add</strong>. That&rsquo;s all.
        </p>
        <p>
          <strong className="text-[var(--text)]">Without an .xpi (stays until Firefox closes):</strong>
        </p>
        <Ol>
          <li>
            Click the address bar, paste this and press Enter:
            <CopyBox text="about:debugging#/runtime/this-firefox" copied={copied} onCopy={onCopy} />
          </li>
          <li>
            Click <strong>Load Temporary Add-on…</strong>
          </li>
          <li>
            Open this folder and pick the file <code>manifest.json</code> in it:
            {folderLine(firefox, 'TypeLens-extension-firefox-<version>.zip')}
          </li>
          <li>
            Click the TypeLens icon in the toolbar. If it shows <strong>Allow access</strong>, click it. Firefox needs your OK before the
            extension can read monkeytype.com.
          </li>
        </Ol>
      </>
    );
  }

  const page = { chrome: 'chrome://extensions', edge: 'edge://extensions', brave: 'brave://extensions', opera: 'opera://extensions', vivaldi: 'vivaldi://extensions' }[browser];
  const toggle =
    browser === 'edge' ? (
      <>
        Turn on <strong>Developer mode</strong> (a switch in the left sidebar; on a narrow window, open the ☰ menu first).
      </>
    ) : (
      <>
        Turn on <strong>Developer mode</strong> with the switch in the top-right corner.
      </>
    );
  return (
    <Ol>
      <li>
        Click the address bar, paste this and press Enter (browsers don&rsquo;t let web pages open it with a link):
        <CopyBox text={page} copied={copied} onCopy={onCopy} />
      </li>
      <li>{toggle}</li>
      <li>
        Click <strong>Load unpacked</strong> (it appears once Developer mode is on).
      </li>
      <li>
        Choose this folder and click <strong>Select Folder</strong>:
        {folderLine(folder, 'TypeLens-extension-<version>.zip')}
        {openFolder && (
          <Button size="sm" variant="outline" className="mt-2" onClick={() => void host.shell.openExtensionFolder()}>
            <FolderOpen className="h-3 w-3" aria-hidden /> Show it in the file manager
          </Button>
        )}
      </li>
      <li>
        Optional: click the puzzle-piece icon next to the address bar and pin <strong>TypeLens</strong>, so its button is always
        visible.
      </li>
    </Ol>
  );
}

/**
 * Get started: the three things a new user has to do, in order, with the exact clicks for their browser. Each step
 * ticks itself off: the extension is detected, then the first recorded test.
 */
export function SetupPage() {
  const host = getHost();
  const desktop = host.capabilities.extensionPush;
  const builtIn = host.capabilities.builtInRecorder;
  const { status, refresh } = useExtensionStatus();
  const src = useSourceInfo();
  const [browser, setBrowser] = useState<BrowserId>(() =>
    typeof navigator === 'undefined' ? 'chrome' : detectBrowser(navigator.userAgent, 'brave' in navigator),
  );
  const [copied, copy] = useCopy();

  const extensionDone = builtIn || (desktop ? !!status?.paired : !!status?.connected);
  const testDone = (src.realCount ?? 0) > 0;
  const allDone = extensionDone && testDone;

  // check often while waiting, so the step ticks off a few seconds after the user did it
  useEffect(() => {
    if (allDone) return;
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, [allDone, refresh]);

  const folder = status?.extensionFolder ?? null;
  const open = (url: string) => void host.shell.openExternal(url).catch(() => window.open(url, '_blank', 'noopener'));
  let n = 0;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        title="Get started"
        description={
          builtIn
            ? 'You are using the dashboard built into the TypeLens extension. One step left: take a test.'
            : desktop
              ? 'Three steps, about two minutes. Each step ticks itself off when TypeLens detects it.'
              : 'TypeLens needs its browser extension to record your tests. Each step ticks itself off when it is detected.'
        }
      />

      {allDone && (
        <Card className="border-main/40">
          <div className="flex flex-wrap items-center gap-3">
            <PartyPopper className="h-5 w-5 text-[var(--main)]" aria-hidden />
            <p className="flex-1 text-sm text-[var(--text)]">
              You&rsquo;re set up. TypeLens has {src.realCount} test{src.realCount === 1 ? '' : 's'} and records every new one automatically.
            </p>
            <Link to="/">
              <Button variant="primary">Open the Overview</Button>
            </Link>
          </div>
        </Card>
      )}

      {desktop && (
        <Step n={++n} title="Install the TypeLens app" done>
          <p>You are in it. Keep it running in the background while you type; tests arrive only while it runs (the extension keeps them until then).</p>
        </Step>
      )}

      {builtIn ? (
        <Step n={++n} title="Install the TypeLens extension" done>
          <p>This dashboard is part of the extension, so it is installed and recording.</p>
        </Step>
      ) : (
        <Step n={++n} title="Add the TypeLens extension to your browser" done={extensionDone}>
          <p>
            The extension is what records your typing on monkeytype.com. Browser stores don&rsquo;t have it yet, so you load it from a
            folder. Pick your browser:
          </p>
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Browser">
            {BROWSERS.map((b) => (
              <button
                key={b.id}
                role="tab"
                aria-selected={browser === b.id}
                onClick={() => setBrowser(b.id)}
                className={cn(
                  'h-7 rounded-full border px-3 text-xs transition-colors',
                  browser === b.id
                    ? 'border-[var(--main)] bg-main/10 text-[var(--main)]'
                    : 'border-[var(--sub-2)] text-[var(--sub)] hover:border-[var(--sub)] hover:text-[var(--text)]',
                )}
              >
                {b.name}
              </button>
            ))}
          </div>
          {!desktop && (
            <p>
              First download <code className="text-[var(--text)]">{browser === 'firefox' ? 'TypeLens-extension-firefox-<version>.zip' : 'TypeLens-extension-<version>.zip'}</code>{' '}
              from the{' '}
              <button className="underline hover:text-[var(--text)]" onClick={() => open(RELEASES_URL)}>
                latest release
              </button>{' '}
              and unzip it into a folder you will keep (the browser loads the extension from it every time it starts).
            </p>
          )}
          <LoadSteps browser={browser} folder={desktop ? folder : null} firefox={desktop ? firefoxFolder(folder) : null} fromZip={!desktop} copied={copied} onCopy={copy} />
          <p className={cn('flex items-center gap-2', extensionDone ? 'text-[var(--main)]' : '')}>
            {extensionDone ? (
              <>
                <Check className="h-3.5 w-3.5" aria-hidden /> Extension detected.
              </>
            ) : (
              <>
                <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--sub)]" aria-hidden />
                {desktop
                  ? 'Waiting for the extension… It connects within a minute of being loaded.'
                  : 'Waiting for the extension… Reload this page after loading it.'}
              </>
            )}
          </p>
        </Step>
      )}

      <Step n={++n} title="Take a typing test on monkeytype.com" done={testDone}>
        <Ol>
          <li>
            Open{' '}
            <button className="inline-flex items-center gap-1 underline hover:text-[var(--main)]" onClick={() => open(MONKEYTYPE_URL)}>
              monkeytype.com <ExternalLink className="h-3 w-3" aria-hidden />
            </button>{' '}
            in the browser where you added the extension. If it was already open, reload it.
          </li>
          <li>Type a test to the end, any mode. Tests you restart are kept too, but finished ones give the best statistics.</li>
          <li>
            {desktop || builtIn
              ? 'Come back here. The test appears within a few seconds and the demo data is replaced by yours.'
              : 'Come back to this page and open Data → Sync from extension.'}
          </li>
        </Ol>
        <p className={cn('flex items-center gap-2', testDone ? 'text-[var(--main)]' : '')}>
          {testDone ? (
            <>
              <Check className="h-3.5 w-3.5" aria-hidden /> {src.realCount} test{src.realCount === 1 ? '' : 's'} recorded.
            </>
          ) : (
            <>
              <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--sub)]" aria-hidden /> Waiting for your first test…
            </>
          )}
        </p>
      </Step>

      {builtIn && (
        <Step n={++n} title="Get the desktop app" optional done={false}>
          <p>
            Not needed: everything works here. The app adds automatic updates, start at login and notifications, and keeps your tests in
            files on your computer. If it runs, the extension sends every test to it as well.{' '}
            <button className="underline hover:text-[var(--text)]" onClick={() => open(RELEASES_URL)}>
              Download it
            </button>
            .
          </p>
        </Step>
      )}

      <p className="px-1 text-xs text-[var(--sub)]">
        Stuck? See <Link className="underline hover:text-[var(--text)]" to="/data">Data</Link> for the extension&rsquo;s status, or the{' '}
        <button className="underline hover:text-[var(--text)]" onClick={() => open('https://github.com/HACKERHSB1453/Typelens#troubleshooting')}>
          troubleshooting guide
        </button>
        .
      </p>
    </div>
  );
}
