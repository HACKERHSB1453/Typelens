import { sanitizeMonkeytypeTheme } from '../src/desktop';
import { describe, it, expect } from 'vitest'
import { wpm, rawWpm, accuracy, consistency, crossCheck } from '../src/monkeytype'
import type { Session } from '../src/schema'
import { makeSession as fixtureSession } from '../src/fixtures'

// A valid Session from the shared fixture builder, with the fields under test overridden.
const makeSession = (overrides: Partial<Session> = {}): Session => ({ ...fixtureSession({ text: 'hello world' }), ...overrides })
describe('monkeytype formulas', () => {
  describe('wpm', () => {
    it('computes standard WPM from correct chars and spaces', () => {
      // correctWordChars = 250, correctSpaces = 50, seconds = 60
      // ((250 + 50) * 60 / 60) / 5 = 300 / 5 = 60
      expect(wpm(250, 50, 60)).toBe(60)
    })

    it('handles zero seconds gracefully', () => {
      expect(wpm(100, 20, 0)).toBe(0)
    })

    it('handles fractional seconds', () => {
      // 30 seconds, 150 chars + 30 spaces = 180
      // ((180) * 60 / 30) / 5 = 360 / 5 = 72
      expect(wpm(150, 30, 30)).toBe(72)
    })
  })

  describe('rawWpm', () => {
    it('computes raw WPM including incorrect and extra chars', () => {
      // allCorrectChars = 200, spaces = 40, incorrect = 10, extra = 5, seconds = 60
      // sum = 255, ((255) * 60 / 60) / 5 = 255 / 5 = 51
      expect(rawWpm(200, 40, 10, 5, 60)).toBe(51)
    })

    it('handles zero seconds', () => {
      expect(rawWpm(100, 20, 5, 2, 0)).toBe(0)
    })

    it('equals wpm when no incorrect/extra', () => {
      expect(rawWpm(250, 50, 0, 0, 60)).toBe(wpm(250, 50, 60))
    })
  })

  describe('accuracy', () => {
    it('computes accuracy percentage', () => {
      // correct = 95, incorrect = 5 => 100 * 95 / 100 = 95%
      expect(accuracy(95, 5)).toBe(95)
    })

    it('returns 100 when nothing typed', () => {
      expect(accuracy(0, 0)).toBe(100)
    })

    it('returns 0 when all incorrect', () => {
      expect(accuracy(0, 10)).toBe(0)
    })

    it('handles fractional results', () => {
      // 2 correct, 1 incorrect => 100 * 2/3 = 66.666...
      expect(accuracy(2, 1)).toBeCloseTo(66.66666666666666)
    })
  })

  describe('consistency', () => {
    it('computes consistency from raw WPM per second samples', () => {
      // Samples: [50, 55, 45, 60, 50]
      // mean = 52, stdDev = sqrt((4+9+49+64+4)/5) = sqrt(130/5) = sqrt(26) ≈ 5.099
      // cov = 5.099/52 ≈ 0.09806
      // kogasa(cov) = 100*(1 - tanh(cov + cov^3/3 + cov^5/5))
      const samples = [50, 55, 45, 60, 50]
      const result = consistency(samples)
      expect(result).toBeGreaterThan(0)
      expect(result).toBeLessThanOrEqual(100)
    })

    it('returns 100 for single sample', () => {
      expect(consistency([60])).toBe(100)
    })

    it('returns 100 for empty array', () => {
      expect(consistency([])).toBe(100)
    })

    it('returns 100 when all samples identical', () => {
      expect(consistency([50, 50, 50, 50])).toBe(100)
    })
  })

  describe('crossCheck', () => {
    it('returns ok:true when session.result is missing', () => {
      const session = makeSession()
      const result = crossCheck(session, 60, 95)
      expect(result.ok).toBe(true)
      expect(result.wpmDiff).toBe(0)
      expect(result.accDiff).toBe(0)
    })

    it('returns ok:true when within tolerances', () => {
      // Monkeytype wpm = 60, acc = 95
      // Tolerance: wpm diff <= max(2, 3% of 60) = max(2, 1.8) = 2
      // acc diff <= 1.5
      const session = makeSession({
        result: { wpm: 60, rawWpm: 62, acc: 95, consistency: 90, testDurationSec: 30 }
      })
      const result = crossCheck(session, 61, 95.5) // wpm diff = 1, acc diff = 0.5
      expect(result.ok).toBe(true)
      expect(result.wpmDiff).toBe(1)
      expect(result.accDiff).toBe(0.5)
    })

    it('returns ok:false when wpm diff exceeds tolerance', () => {
      const session = makeSession({
        result: { wpm: 60, rawWpm: 62, acc: 95, consistency: 90, testDurationSec: 30 }
      })
      // wpm diff = 3, tolerance = max(2, 1.8) = 2
      const result = crossCheck(session, 63, 95)
      expect(result.ok).toBe(false)
      expect(result.wpmDiff).toBe(3)
    })

    it('returns ok:false when acc diff exceeds tolerance', () => {
      const session = makeSession({
        result: { wpm: 60, rawWpm: 62, acc: 95, consistency: 90, testDurationSec: 30 }
      })
      // acc diff = 2, tolerance = 1.5
      const result = crossCheck(session, 60, 97)
      expect(result.ok).toBe(false)
      expect(result.accDiff).toBe(2)
    })

    it('uses 3% tolerance for high WPM', () => {
      // Monkeytype wpm = 200, 3% = 6, max(2, 6) = 6
      const session = makeSession({
        result: { wpm: 200, rawWpm: 205, acc: 98, consistency: 95, testDurationSec: 30 }
      })
      // wpm diff = 5, within tolerance of 6
      const result = crossCheck(session, 205, 98)
      expect(result.ok).toBe(true)
      expect(result.wpmDiff).toBe(5)
    })

    it('uses 3% tolerance for very high WPM', () => {
      // Monkeytype wpm = 300, 3% = 9, max(2, 9) = 9
      const session = makeSession({
        result: { wpm: 300, rawWpm: 310, acc: 99, consistency: 98, testDurationSec: 30 }
      })
      // wpm diff = 10, exceeds tolerance of 9
      const result = crossCheck(session, 310, 99)
      expect(result.ok).toBe(false)
      expect(result.wpmDiff).toBe(10)
    })

    it('handles zero Monkeytype WPM', () => {
      const session = makeSession({
        result: { wpm: 0, rawWpm: 0, acc: 0, consistency: 0, testDurationSec: 30 }
      })
      // tolerance = max(2, 0) = 2
      const result = crossCheck(session, 1, 0)
      expect(result.ok).toBe(true)
      expect(result.wpmDiff).toBe(1)
    })

    it('handles zero Monkeytype accuracy', () => {
      const session = makeSession({
        result: { wpm: 50, rawWpm: 55, acc: 0, consistency: 50, testDurationSec: 30 }
      })
      const result = crossCheck(session, 50, 1)
      expect(result.ok).toBe(true) // acc diff = 1, and the tolerance is 1.5, so should be true
      expect(result.accDiff).toBe(1)
    })
  })
})

describe('sanitizeMonkeytypeTheme', () => {
  const ok = { name: 'serika_dark', bg: '#323437', main: '#E2B714', sub: '#646669', subAlt: '#2c2e31', text: '#d1d0c5', error: '#ca4754' };
  it('keeps a well-formed theme and lower-cases colours', () => {
    expect(sanitizeMonkeytypeTheme(ok)).toEqual({ ...ok, main: '#e2b714' });
  });
  it('rejects anything that is not six #rrggbb colours, and cleans the name', () => {
    expect(sanitizeMonkeytypeTheme(null)).toBeNull();
    expect(sanitizeMonkeytypeTheme({ ...ok, bg: 'url(x)' })).toBeNull();
    expect(sanitizeMonkeytypeTheme({ ...ok, subAlt: undefined })).toBeNull();
    expect(sanitizeMonkeytypeTheme({ ...ok, name: '<b>x</b>' })?.name).toBe('bxb');
    expect(sanitizeMonkeytypeTheme({ ...ok, name: undefined })?.name).toBe('custom');
  });
});
