import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import {
  AlertTriangle,
  Check,
  FileJson,
  FileSpreadsheet,
  Plug,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react';
import { useDataSource } from '@/data';
import { useStoredSessions } from '@/hooks/useData';
import { getHost, useExtensionStatus } from '@/host';
import { ExtensionPanel } from '@/components/host/ExtensionPanel';
import type { ImportReport, SessionSummary } from '@/data/types';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { SortableTable } from '@/components/ui/SortableTable';
import type { Column } from '@/components/ui/SortableTable';
import { Spinner } from '@/components/ui/Spinner';
import { StateView } from '@/components/ui/StateView';
import { cn, formatDateTime, formatNumber } from '@/lib/utils';

/* ----------------------------------------------------------------------------
 * Local presentational helpers
 * ------------------------------------------------------------------------- */

/** Small panel summarising an ImportReport (imported / skipped / errors). */
function ImportReportView({ report }: { report: ImportReport }) {
  return (
    <div className="mt-3 rounded-md border border-[var(--sub-2)] bg-[var(--bg-dark)] p-3 text-xs">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="text-[var(--sub)]">
          Imported:{' '}
          <span className="font-semibold text-main">{formatNumber(report.imported)}</span>
        </span>
        <span className="text-[var(--sub)]">
          Skipped:{' '}
          <span className="font-semibold text-[var(--text)]">{formatNumber(report.skipped)}</span>
        </span>
      </div>
      {report.errors.length > 0 && (
        <ul className="mt-2 space-y-1">
          {report.errors.map((err, i) => (
            <li key={i} className="flex items-start gap-1.5 text-[var(--error)]">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
              <span className="leading-snug">{err}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Inline transient feedback — green check or red warning + message. */
function Feedback({ kind, children }: { kind: 'ok' | 'error'; children: ReactNode }) {
  return (
    <span
      className={cn(
        'mt-3 inline-flex items-center gap-1.5 text-xs',
        kind === 'ok' ? 'text-ok' : 'text-error',
      )}
      role="status"
    >
      {kind === 'ok' ? <Check className="h-3 w-3" aria-hidden /> : <AlertTriangle className="h-3 w-3" aria-hidden />}
      {children}
    </span>
  );
}

/* ----------------------------------------------------------------------------
 * DataPage
 * ------------------------------------------------------------------------- */

let lastMenuNonce: number | undefined;

type IoAction =
  | 'import'
  | 'export-json'
  | 'export-csv-sessions'
  | 'export-csv-keystrokes';

export function DataPage() {
  const ds = useDataSource();
  const host = getHost();
  const desktop = host.capabilities.extensionPush; // the extension pushes to the app: no manual sync
  const extension = useExtensionStatus();
  const location = useLocation();
  const sessions = useStoredSessions(); // always the real store: this page deletes/exports real data

  // Extension sync state.
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncReport, setSyncReport] = useState<ImportReport | null>(null);

  // Import / Export state.
  const [ioBusy, setIoBusy] = useState<IoAction | null>(null);
  const [importReport, setImportReport] = useState<ImportReport | null>(null);
  const [ioFeedback, setIoFeedback] = useState<{ kind: 'ok' | 'error'; msg: string } | null>(null);

  // Auto-clear the transient feedback after a short delay.
  useEffect(() => {
    if (!ioFeedback) return;
    const t = setTimeout(() => setIoFeedback(null), 3000);
    return () => clearTimeout(t);
  }, [ioFeedback]);

  // Per-row delete state (two-step inline confirm).
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // "Delete all" dialog state.

  /* ---- action handlers ------------------------------------------------- */

  const handleSync = async () => {
    setSyncBusy(true);
    try {
      const report = await ds.syncFromExtension();
      setSyncReport(report);
      // The extension may have produced new sessions — refresh the list.
      sessions.retry();
    } catch (e) {
      setSyncReport({
        imported: 0,
        skipped: 0,
        errors: [e instanceof Error ? e.message : 'Sync failed.'],
      });
    } finally {
      setSyncBusy(false);
    }
  };

  const handleImport = async () => {
    setIoBusy('import');
    setImportReport(null);
    setIoFeedback(null);
    try {
      const picked = await host.files.openImportFile(); // native dialog on desktop, <input type=file> in a browser
      if (!picked) return;
      const report = await ds.importJson(new File([picked.text], picked.name));
      setImportReport(report);
      if (report.imported > 0) {
        setIoFeedback({
          kind: 'ok',
          msg: `Imported ${report.imported} session${report.imported === 1 ? '' : 's'}.`,
        });
      } else if (report.errors.length > 0) {
        setIoFeedback({ kind: 'error', msg: report.errors[0] });
      } else {
        setIoFeedback({ kind: 'ok', msg: 'Nothing new to import.' });
      }
      sessions.retry();
    } catch (e) {
      setIoFeedback({ kind: 'error', msg: e instanceof Error ? e.message : 'Import failed.' });
    } finally {
      setIoBusy(null);
    }
  };

  const handleExportJson = async () => {
    setIoBusy('export-json');
    setIoFeedback(null);
    try {
      const saved = await host.files.saveExport('typelens-sessions.json', await (await ds.exportJson()).text(), [{ name: 'TypeLens export', extensions: ['json'] }]);
      if (saved) setIoFeedback({ kind: 'ok', msg: `Exported ${saved}` });
    } catch (e) {
      setIoFeedback({ kind: 'error', msg: e instanceof Error ? e.message : 'Export failed.' });
    } finally {
      setIoBusy(null);
    }
  };

  const handleExportCsv = async (kind: 'sessions' | 'keystrokes') => {
    const action: IoAction = kind === 'sessions' ? 'export-csv-sessions' : 'export-csv-keystrokes';
    setIoBusy(action);
    setIoFeedback(null);
    try {
      const text = await (await ds.exportCsv(kind)).text();
      const filename = kind === 'sessions' ? 'typelens-sessions.csv' : 'typelens-keystrokes.csv';
      const saved = await host.files.saveExport(filename, text, [{ name: 'CSV', extensions: ['csv'] }]);
      if (saved) setIoFeedback({ kind: 'ok', msg: `Exported ${saved}` });
    } catch (e) {
      setIoFeedback({ kind: 'error', msg: e instanceof Error ? e.message : 'Export failed.' });
    } finally {
      setIoBusy(null);
    }
  };

  const handleConfirmDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await ds.deleteSession(id);
      setConfirmDeleteId(null);
      sessions.retry();
    } catch (e) {
      setIoFeedback({ kind: 'error', msg: e instanceof Error ? e.message : 'Could not delete the session.' });
    } finally {
      setDeletingId(null);
    }
  };

  /* ---- derived view state --------------------------------------------- */

  const extensionConnected = extension.status?.connected === true;

  // Menu items (File > Import / Export JSON, Ctrl+I / Ctrl+E) arrive as router state, because this page may not have been open
  const menu = (location.state ?? null) as { menuAction?: string; nonce?: number } | null;
  useEffect(() => {
    // router state survives leaving the page and coming back (history), so remember across mounts which request was already run
    if (!menu?.menuAction || lastMenuNonce === menu.nonce) return;
    lastMenuNonce = menu.nonce;
    if (menu.menuAction === 'import') void handleImport();
    else if (menu.menuAction === 'export-json') void handleExportJson();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu?.nonce]);
  const sessionList = sessions.data ?? [];

  const columns: Column<SessionSummary>[] = [
    {
      key: 'date',
      header: 'Date',
      cell: (s) => formatDateTime(s.startedAt),
      sortValue: (s) => s.startedAt,
    },
    {
      key: 'mode',
      header: 'Mode',
      cell: (s) => (
        <>
          {s.config.mode}
          {s.config.mode2 && <span className="text-[var(--sub)]"> · {s.config.mode2}</span>}
          {!s.completed && (
            <Badge tone="sub" className="ml-2">
              restarted
            </Badge>
          )}
        </>
      ),
      sortValue: (s) => `${s.config.mode}:${s.config.mode2}`,
    },
    {
      key: 'lang',
      header: 'Lang',
      cell: (s) => s.config.language,
      sortValue: (s) => s.config.language,
    },
    {
      key: 'wpm',
      header: 'WPM',
      align: 'right',
      cell: (s) => formatNumber(s.wpm, 1),
      sortValue: (s) => s.wpm,
    },
    {
      key: 'keystrokes',
      header: 'Keystrokes',
      align: 'right',
      cell: (s) => formatNumber(s.keystrokes),
      sortValue: (s) => s.keystrokes,
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      cell: (s) => {
        if (confirmDeleteId === s.id) {
          return (
            <div className="inline-flex items-center gap-1">
              <Button
                size="sm"
                variant="danger"
                onClick={() => handleConfirmDelete(s.id)}
                disabled={deletingId === s.id}
                aria-label={`Confirm delete of session from ${formatDateTime(s.startedAt)}`}
              >
                {deletingId === s.id ? <Spinner size="sm" /> : <Check className="h-3 w-3" />}
                Confirm
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setConfirmDeleteId(null)}
                disabled={deletingId === s.id}
                aria-label="Cancel delete"
              >
                Cancel
              </Button>
            </div>
          );
        }
        return (
          <Button
            size="sm"
            variant="danger"
            onClick={() => setConfirmDeleteId(s.id)}
            aria-label={`Delete session from ${formatDateTime(s.startedAt)}`}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        );
      },
    },
  ];

  /* ---- render --------------------------------------------------------- */

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Data</h1>

      {/* 1. Extension: pushes to the desktop app by itself, or is pulled through the page bridge in a browser */}
      {desktop ? (
        <ExtensionPanel />
      ) : (
      <Card>
        <CardHeader
          title="Extension"
          subtitle="Sync data from the Monkeytype companion extension."
          right={
            extension.loading ? (
              <Badge tone="sub">Checking…</Badge>
            ) : extension.error ? (
              <Badge tone="error">Unknown</Badge>
            ) : (
              <Badge tone={extensionConnected ? 'ok' : 'error'}>
                {extensionConnected ? 'Connected' : 'Not connected'}
              </Badge>
            )
          }
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" size="md" onClick={handleSync} disabled={syncBusy}>
            {syncBusy ? <Spinner size="sm" /> : <Plug className="h-3.5 w-3.5" />}
            Sync from extension
          </Button>
          <p className="text-xs text-[var(--sub)]">
            Pulls new sessions from the extension&rsquo;s local capture buffer.
          </p>
        </div>
        {syncReport && <ImportReportView report={syncReport} />}
      </Card>
      )}

      {/* 2. Import / Export */}
      <Card>
        <CardHeader
          title="Import / Export"
          subtitle="Back up your data, or import Monkeytype's own results export (Account → export CSV) to add your full speed history."
        />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Button variant="outline" size="md" className="w-full" onClick={() => void handleImport()} disabled={ioBusy !== null}>
            {ioBusy === 'import' ? <Spinner size="sm" /> : <Upload className="h-3.5 w-3.5" />}
            Import JSON / Monkeytype CSV
          </Button>
          <Button
            variant="outline"
            size="md"
            className="w-full"
            onClick={handleExportJson}
            disabled={ioBusy !== null}
          >
            {ioBusy === 'export-json' ? <Spinner size="sm" /> : <FileJson className="h-3.5 w-3.5" />}
            Export JSON
          </Button>
          <Button
            variant="outline"
            size="md"
            className="w-full"
            onClick={() => handleExportCsv('sessions')}
            disabled={ioBusy !== null}
          >
            {ioBusy === 'export-csv-sessions' ? (
              <Spinner size="sm" />
            ) : (
              <FileSpreadsheet className="h-3.5 w-3.5" />
            )}
            Sessions CSV
          </Button>
          <Button
            variant="outline"
            size="md"
            className="w-full"
            onClick={() => handleExportCsv('keystrokes')}
            disabled={ioBusy !== null}
          >
            {ioBusy === 'export-csv-keystrokes' ? (
              <Spinner size="sm" />
            ) : (
              <FileSpreadsheet className="h-3.5 w-3.5" />
            )}
            Keystrokes CSV
          </Button>
        </div>
        {importReport && <ImportReportView report={importReport} />}
        {ioFeedback && <Feedback kind={ioFeedback.kind}>{ioFeedback.msg}</Feedback>}
      </Card>

      {/* 3. Sessions list with delete */}
      <Card>
        <CardHeader
          title="Sessions"
          subtitle="Delete individual sessions from the dataset."
          right={
            <Button
              variant="ghost"
              size="sm"
              onClick={sessions.retry}
              aria-label="Refresh sessions"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </Button>
          }
        />
        <StateView
          loading={sessions.loading}
          error={sessions.error}
          empty={sessionList.length === 0}
          onRetry={sessions.retry}
          emptyTitle="No sessions"
          emptyHint={desktop ? 'Finish a test on monkeytype.com with the extension installed, or import a JSON export.' : 'Import a JSON export or sync from the extension to populate the dataset.'}
        >
          <SortableTable
            columns={columns}
            rows={sessionList}
            rowKey={(s) => s.id}
            maxRowsVisible={8}
            initialSort={{ key: 'date', dir: 'desc' }}
            emptyHint="No sessions match the current filters."
          />
        </StateView>
        <p className="mt-3 text-xs text-[var(--sub)]">
          To delete everything at once, use <strong>Settings → Danger zone</strong>.
        </p>
      </Card>
    </div>
  );
}
