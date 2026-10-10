import { useState, type ReactNode } from 'react';
import { Check, Database, RefreshCw, Trash2 } from 'lucide-react';
import { useDataSource } from '@/data';
import { SettingsPanel } from '@/components/host/SettingsPanel';
import { DeleteAllModal } from '@/components/DeleteAllModal';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { cn } from '@/lib/utils';
import { PALETTE_KEYS, PALETTE_LABELS, isHexColor, paletteFromMonkeytype, presetById, THEME_PRESETS, type ThemePalette } from '@/lib/themes';
import { updateThemeSettings, useThemeSettings } from '@/lib/themeStore';

/* ----------------------------------------------------------------------------
 * Appearance
 * ------------------------------------------------------------------------- */

/** A small preview of a palette: its background, a text line, an accent bar and an error dot. */
function Swatch({ palette }: { palette: ThemePalette }) {
  return (
    <span
      aria-hidden
      className="flex h-12 w-full flex-col justify-center gap-1.5 rounded-md border px-3"
      style={{ background: palette.bg, borderColor: palette.subAlt }}
    >
      <span className="flex items-center gap-1.5">
        <span className="h-1.5 w-8 rounded-full" style={{ background: palette.main }} />
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: palette.error }} />
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-1.5 w-10 rounded-full" style={{ background: palette.text }} />
        <span className="h-1.5 w-6 rounded-full" style={{ background: palette.sub }} />
      </span>
    </span>
  );
}

function ThemeTile({
  name,
  hint,
  palette,
  selected,
  onSelect,
  icon,
}: {
  name: string;
  hint?: string;
  palette: ThemePalette;
  selected: boolean;
  onSelect: () => void;
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'flex flex-col gap-2 rounded-lg border p-2 text-left transition',
        selected ? 'border-[var(--main)]' : 'border-[var(--sub-2)] hover:border-[var(--sub)]',
      )}
    >
      <Swatch palette={palette} />
      <span className="flex items-center gap-1.5 px-1 text-xs">
        {icon}
        <span className={cn('truncate', selected ? 'font-semibold text-[var(--text)]' : 'text-[var(--sub)]')}>{name}</span>
        {selected && <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-[var(--main)]" aria-hidden />}
      </span>
      {hint && <span className="px-1 text-[10px] leading-snug text-[var(--sub)]">{hint}</span>}
    </button>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (hex: string) => void }) {
  const [text, setText] = useState(value);
  const [focused, setFocused] = useState(false);
  const shown = focused ? text : value;
  return (
    <label className="flex items-center gap-2 text-xs">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value.toLowerCase())}
        className="h-8 w-10 shrink-0 cursor-pointer rounded border border-[var(--sub-2)] bg-transparent p-0.5"
        aria-label={`${label} colour`}
      />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[var(--sub)]">{label}</span>
        <input
          value={shown}
          spellCheck={false}
          onFocus={() => (setText(value), setFocused(true))}
          onBlur={() => setFocused(false)}
          onChange={(e) => {
            const v = e.target.value.trim().toLowerCase();
            setText(v);
            const hex = v.startsWith('#') ? v : `#${v}`;
            if (isHexColor(hex)) onChange(hex);
          }}
          className="w-full bg-transparent font-mono text-[var(--text)] outline-none"
          aria-label={`${label} hex value`}
        />
      </span>
    </label>
  );
}

function AppearanceCard() {
  const s = useThemeSettings();
  const mt = s.monkeytype;

  return (
    <Card>
      <CardHeader title="Appearance" subtitle="Pick a theme, follow your Monkeytype theme, or make your own." />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        <ThemeTile
          name="Sync from Monkeytype"
          icon={<RefreshCw className="h-3 w-3 shrink-0 text-[var(--sub)]" aria-hidden />}
          hint={mt ? `Following "${mt.name.replace(/_/g, ' ')}"` : 'Open monkeytype.com once with the extension installed.'}
          palette={mt ? paletteFromMonkeytype(mt) : presetById(s.preset).palette}
          selected={s.mode === 'monkeytype'}
          onSelect={() => updateThemeSettings({ mode: 'monkeytype' })}
        />
        {THEME_PRESETS.map((p) => (
          <ThemeTile
            key={p.id}
            name={p.name}
            palette={p.palette}
            selected={s.mode === 'preset' && s.preset === p.id}
            onSelect={() => updateThemeSettings({ mode: 'preset', preset: p.id })}
          />
        ))}
        <ThemeTile name="Custom" palette={s.custom} selected={s.mode === 'custom'} onSelect={() => updateThemeSettings({ mode: 'custom' })} />
      </div>

      {s.mode === 'monkeytype' && (
        <p className="mt-4 text-xs text-[var(--sub)]">
          {mt
            ? 'TypeLens uses the theme you have on monkeytype.com, including custom themes. Change it there and TypeLens follows within a few seconds while the extension is running.'
            : 'Waiting for your Monkeytype theme. Open monkeytype.com in the browser with the TypeLens extension; until then the selected built-in theme is shown.'}
        </p>
      )}

      {s.mode === 'custom' && (
        <div className="mt-4 space-y-3 border-t border-[var(--sub-2)] pt-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {PALETTE_KEYS.map((k) => (
              <ColorField key={k} label={PALETTE_LABELS[k]} value={s.custom[k]} onChange={(hex) => updateThemeSettings({ custom: { ...s.custom, [k]: hex } })} />
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="self-center text-xs text-[var(--sub)]">Start from:</span>
            {mt && (
              <Button variant="ghost" size="sm" onClick={() => updateThemeSettings({ custom: paletteFromMonkeytype(mt) })}>
                my Monkeytype theme
              </Button>
            )}
            {THEME_PRESETS.map((p) => (
              <Button key={p.id} variant="ghost" size="sm" onClick={() => updateThemeSettings({ custom: { ...p.palette } })}>
                {p.name}
              </Button>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

/* ----------------------------------------------------------------------------
 * Danger zone
 * ------------------------------------------------------------------------- */

function DangerZoneCard() {
  const ds = useDataSource();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ kind: 'ok' | 'error'; msg: string } | null>(null);

  const deleteAll = async () => {
    setBusy(true);
    try {
      await ds.deleteAll();
      setResult({ kind: 'ok', msg: 'All data was deleted.' });
    } catch (e) {
      setResult({ kind: 'error', msg: e instanceof Error ? e.message : 'Could not delete the data.' });
    } finally {
      setOpen(false);
      setBusy(false);
    }
  };

  return (
    <Card className="border-error/60">
      <CardHeader title="Danger zone" subtitle="Irreversible bulk actions." right={<Database className="h-4 w-4 text-[var(--error)]" aria-hidden />} />
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="danger" size="md" onClick={() => (setResult(null), setOpen(true))}>
          <Trash2 className="h-3.5 w-3.5" />
          Delete all data
        </Button>
        <p className="text-xs text-[var(--sub)]">
          Removes every recorded and imported test from this computer. Requires typing{' '}
          <code className="rounded bg-[var(--bg-dark)] px-1.5 py-0.5 text-[var(--text)]">DELETE</code> to confirm. Export your data first
          on the Data page if you may want it back.
        </p>
      </div>
      {result && (
        <p role="status" className={cn('mt-3 text-xs', result.kind === 'ok' ? 'text-ok' : 'text-error')}>
          {result.msg}
        </p>
      )}
      <DeleteAllModal open={open} busy={busy} onClose={() => setOpen(false)} onConfirm={deleteAll} />
    </Card>
  );
}

/* ----------------------------------------------------------------------------
 * Page
 * ------------------------------------------------------------------------- */

export function SettingsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Settings</h1>
      <AppearanceCard />
      <SettingsPanel />
      <DangerZoneCard />
    </div>
  );
}
