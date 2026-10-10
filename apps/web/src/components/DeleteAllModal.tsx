import { useEffect, useState } from 'react';
import { Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';

/** Modal overlay for the "delete all" typed confirmation. */
export function DeleteAllModal({
  open,
  busy,
  onClose,
  onConfirm,
}: {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [typed, setTyped] = useState('');

  // Reset the typed value whenever the dialog opens/closes.
  useEffect(() => {
    if (!open) setTyped('');
  }, [open]);

  // Escape closes the dialog (when not busy). Rendered as a window-level
  // listener so it works even if focus has moved out of the Card.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onClose]);

  if (!open) return null;
  const canConfirm = typed === 'DELETE' && !busy;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Delete all data"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <Card className="w-full max-w-md border-error/60">
        <CardHeader
          title="Delete all data"
          subtitle="Permanently removes every session, keystroke, and cached analysis."
          right={
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={busy}
              aria-label="Close dialog"
            >
              <X className="h-4 w-4" />
            </Button>
          }
        />
        <p className="text-sm text-[var(--sub)]">
          Type{' '}
          <code className="rounded bg-[var(--bg-dark)] px-1.5 py-0.5 text-[var(--text)]">DELETE</code>{' '}
          to confirm.
        </p>
        <Input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="DELETE"
          autoComplete="off"
          spellCheck={false}
          autoFocus
          disabled={busy}
          aria-label="Type DELETE to confirm"
          className="mt-3"
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="md" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" size="md" onClick={onConfirm} disabled={!canConfirm}>
            {busy ? <Spinner size="sm" /> : <Trash2 className="h-3.5 w-3.5" />}
            Delete all
          </Button>
        </div>
      </Card>
    </div>
  );
}
