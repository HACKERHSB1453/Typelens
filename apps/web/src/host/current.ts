/**
 * The one place the UI obtains its host. In the desktop app the preload has already put the real thing on
 * window.typelensHost; in a browser we build the web implementation. Components never look at `window` or
 * "which platform am I on" themselves: they use getHost()/useHost() and read `capabilities`.
 */
import type { TypeLensHost } from '@typelens/host-contract';
import { createWebHost } from './webHost';



let cached: TypeLensHost | null = null;

export function getHost(): TypeLensHost {
  if (cached) return cached;
  const injected = typeof window !== 'undefined' ? window.typelensHost : undefined;
  cached = injected ?? createWebHost({ version: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : undefined });
  return cached;
}

/** Tests install their own host before anything calls getHost(). */
export function setHostForTests(host: TypeLensHost | null): void {
  cached = host;
}

