import { useEffect, useState } from 'react';
import { PREF_GOALS } from '@typelens/host-contract';
import { DEFAULT_GOALS, sanitizeGoals, type Goals } from '@typelens/core';
import { getHost } from '@/host';

/** Practice goals live in the host's preferences; every mounted hook hears about a change. */
const listeners = new Set<(g: Goals) => void>();
let cached: Goals | null = null;

async function load(): Promise<Goals> {
  if (cached) return cached;
  try {
    const raw = await getHost().prefs.get<unknown>(PREF_GOALS);
    cached = raw === null ? DEFAULT_GOALS : sanitizeGoals(raw);
  } catch {
    cached = DEFAULT_GOALS;
  }
  return cached;
}

export async function saveGoals(g: Goals): Promise<void> {
  cached = sanitizeGoals(g);
  for (const fn of listeners) fn(cached);
  await getHost().prefs.set(PREF_GOALS, cached);
}

export function useGoals(): Goals | null {
  const [goals, setGoals] = useState<Goals | null>(cached);
  useEffect(() => {
    let alive = true;
    void load().then((g) => alive && setGoals(g));
    listeners.add(setGoals);
    return () => {
      alive = false;
      listeners.delete(setGoals);
    };
  }, []);
  return goals;
}
