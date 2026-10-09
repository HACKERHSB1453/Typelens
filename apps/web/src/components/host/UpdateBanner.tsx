import { useState } from 'react';
import { Download, X } from 'lucide-react';
import { getHost, useUpdateState } from '@/host';

/** Slim bar shown only once an update has been downloaded; the user decides when to restart. */
export function UpdateBanner() {
  const update = useUpdateState();
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (update?.status !== 'ready' || dismissed === update.version) return null;
  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-2 border-b border-main/40 bg-main/10 px-4 py-2 text-xs md:px-6">
      <span>
        <strong className="text-[var(--main)]">Update ready.</strong> TypeLens {update.version} has been downloaded.
        {error && <span className="ml-2 text-error">{error}</span>}
      </span>
      <span className="flex items-center gap-3">
        <button
          className="inline-flex items-center gap-1 font-semibold underline hover:text-[var(--main)]"
          onClick={() => getHost().updates.installAndRestart().catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not restart.'))}
        >
          <Download className="h-3 w-3" aria-hidden /> Restart to update
        </button>
        <button className="text-[var(--sub)] hover:text-[var(--text)]" aria-label="Dismiss until next launch" onClick={() => setDismissed(update.version)}>
          <X className="h-3.5 w-3.5" />
        </button>
      </span>
    </div>
  );
}
