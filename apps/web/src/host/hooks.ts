import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AppInfo, ExtensionStatus, MenuAction, TypeLensHost, UpdateState } from '@typelens/host-contract';
import { getHost } from './current';

export function useHost(): TypeLensHost {
  return getHost();
}

export function useAppInfo(): AppInfo | null {
  const [info, setInfo] = useState<AppInfo | null>(null);
  useEffect(() => {
    let alive = true;
    getHost().app.info().then((i) => alive && setInfo(i), () => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return info;
}

/**
 * Live extension status. On desktop the host pushes a change event on every contact from the extension; the
 * interval only keeps "last contact 3 min ago" honest. `refresh` is for after a sync/pairing action.
 */
export function useExtensionStatus(deps: unknown[] = []): { status: ExtensionStatus | null; error: Error | null; loading: boolean; refresh: () => void } {
  const [status, setStatus] = useState<ExtensionStatus | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [nonce, setNonce] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const host = getHost();
    const load = (): void => {
      host.extension.status().then(
        (s) => {
          if (!alive) return;
          setStatus(s);
          setError(null);
          setLoading(false);
        },
        (e: unknown) => {
          if (!alive) return;
          setError(e instanceof Error ? e : new Error(String(e)));
          setLoading(false);
        },
      );
    };
    load();
    const off = host.extension.onChange(load);
    const timer = setInterval(load, host.capabilities.extensionPush ? 30_000 : 120_000);
    return () => {
      alive = false;
      off();
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce, ...deps]);

  return { status, error, loading, refresh: () => setNonce((n) => n + 1) };
}

export function useUpdateState(): UpdateState | null {
  const [state, setState] = useState<UpdateState | null>(null);
  useEffect(() => {
    const host = getHost();
    let alive = true;
    host.updates.state().then((s) => alive && setState((prev) => prev ?? s), () => undefined);
    const off = host.updates.onChange((s) => setState(s));
    return () => {
      alive = false;
      off();
    };
  }, []);
  return state;
}

/** Desktop menu / shortcuts: Ctrl+1..9 switch pages, Import/Export open the Data page and start the action. */
export function useHostNavigation(): void {
  const navigate = useNavigate();
  useEffect(() => {
    const host = getHost();
    const offNav = host.onNavigate((path) => navigate(path));
    const offMenu = host.onMenuAction((action: MenuAction) => navigate('/data', { state: { menuAction: action, nonce: Date.now() } }));
    return () => {
      offNav();
      offMenu();
    };
  }, [navigate]);
}
