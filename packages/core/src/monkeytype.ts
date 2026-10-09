import type { Session } from './schema';
import { kogasa, mean, stdDev } from './stats-util';

/**
 * Monkeytype WPM formula: ((correctWordChars + correctSpaces) * 60 / seconds) / 5
 */
export function wpm(
  correctWordChars: number,
  correctSpaces: number,
  seconds: number
): number {
  if (seconds <= 0) return 0;
  return ((correctWordChars + correctSpaces) * 60 / seconds) / 5;
}

/**
 * Monkeytype raw WPM formula: ((allCorrectChars + spaces + incorrect + extra) * 60 / seconds) / 5
 */
export function rawWpm(
  allCorrectChars: number,
  spaces: number,
  incorrect: number,
  extra: number,
  seconds: number
): number {
  if (seconds <= 0) return 0;
  const sum = allCorrectChars + spaces + incorrect + extra;
  return (sum * 60 / seconds) / 5;
}

/**
 * Monkeytype accuracy: 100 * correct / (correct + incorrect), 100 when nothing typed.
 * Counted PER KEYSTROKE (a corrected mistake still counts as incorrect).
 */
export function accuracy(correct: number, incorrect: number): number {
  const total = correct + incorrect;
  if (total === 0) return 100;
  return 100 * correct / total;
}

/**
 * Consistency = kogasa(stdDev(x) / mean(x)) where x is raw WPM per second.
 */
export function consistency(rawPerSecond: number[]): number {
  if (rawPerSecond.length === 0) return 100;
  const m = mean(rawPerSecond);
  if (m === 0) return 100;
  const sd = stdDev(rawPerSecond);
  const cov = sd / m;
  return kogasa(cov);
}

/**
 * Cross-check derived metrics against session.result (Monkeytype's numbers).
 * ok when |wpm diff| <= max(2, 3% of MT wpm) and |acc diff| <= 1.5 points.
 * Returns ok:true when session.result is missing.
 */
export function crossCheck(
  session: Session,
  derivedWpm: number,
  derivedAcc: number
): { ok: boolean; wpmDiff: number; accDiff: number } {
  const result = session.result;
  if (!result) {
    return { ok: true, wpmDiff: 0, accDiff: 0 };
  }

  const wpmDiff = Math.abs(derivedWpm - result.wpm);
  const accDiff = Math.abs(derivedAcc - result.acc);

  const wpmTolerance = Math.max(2, result.wpm * 0.03);
  const accTolerance = 1.5;

  const ok = wpmDiff <= wpmTolerance && accDiff <= accTolerance;

  return { ok, wpmDiff, accDiff };
}
