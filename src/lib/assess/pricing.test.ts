/**
 * Tests for cost estimation. Pure arithmetic, no network.
 *
 * The cached-token discount is the part worth pinning: cachedTokens is a
 * SUBSET of promptTokens, not an addition to it, so billing both at full rate
 * (or double-counting them) silently inflates every reported figure.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_RATES,
  EMPTY_USAGE,
  addUsage,
  estimateCostUsd,
  formatPerThousand,
  formatUsd,
  type TokenUsage,
} from './pricing';

const PRICE_ENV = [
  'ASSESS_PRICE_INPUT_PER_1M',
  'ASSESS_PRICE_CACHED_INPUT_PER_1M',
  'ASSESS_PRICE_OUTPUT_PER_1M',
];

afterEach(() => {
  for (const key of PRICE_ENV) delete process.env[key];
});

function usage(promptTokens: number, completionTokens: number, cachedTokens = 0): TokenUsage {
  return { promptTokens, cachedTokens, completionTokens };
}

describe('estimateCostUsd', () => {
  it('bills input and output at their separate rates', () => {
    // 1,000,000 in + 1,000,000 out = one full unit of each rate.
    expect(estimateCostUsd(usage(1_000_000, 1_000_000))).toBeCloseTo(
      DEFAULT_RATES.input + DEFAULT_RATES.output,
      10,
    );
  });

  it('costs nothing when nothing was used', () => {
    expect(estimateCostUsd(EMPTY_USAGE)).toBe(0);
  });

  it('treats cachedTokens as a SUBSET of promptTokens, not an extra charge', () => {
    // All 1M prompt tokens were cache reads, so the whole prompt bills at the
    // cached rate and nothing bills at the full input rate.
    const allCached = estimateCostUsd(usage(1_000_000, 0, 1_000_000));
    expect(allCached).toBeCloseTo(DEFAULT_RATES.cachedInput, 10);

    // Half cached: half at the discount, half at full price.
    const halfCached = estimateCostUsd(usage(1_000_000, 0, 500_000));
    expect(halfCached).toBeCloseTo(
      (DEFAULT_RATES.input + DEFAULT_RATES.cachedInput) / 2,
      10,
    );
  });

  it('caching only ever reduces the bill', () => {
    const plain = estimateCostUsd(usage(1_000_000, 1000));
    const cached = estimateCostUsd(usage(1_000_000, 1000, 800_000));
    expect(cached).toBeLessThan(plain);
  });

  it('clamps a cachedTokens value that exceeds promptTokens', () => {
    // Defensive: a provider reporting more cache reads than prompt tokens must
    // not produce a negative uncached count and a nonsense refund.
    const weird = estimateCostUsd(usage(1000, 0, 5000));
    expect(weird).toBeGreaterThan(0);
    expect(weird).toBeCloseTo((1000 * DEFAULT_RATES.cachedInput) / 1_000_000, 10);
  });

  it('honours env rate overrides so prices change without a redeploy', () => {
    process.env.ASSESS_PRICE_INPUT_PER_1M = '10';
    process.env.ASSESS_PRICE_OUTPUT_PER_1M = '20';
    expect(estimateCostUsd(usage(1_000_000, 1_000_000))).toBeCloseTo(30, 10);
  });

  it('falls back to defaults when an override is not a usable number', () => {
    process.env.ASSESS_PRICE_INPUT_PER_1M = 'not-a-number';
    expect(estimateCostUsd(usage(1_000_000, 0))).toBeCloseTo(DEFAULT_RATES.input, 10);
  });

  it('matches a real assessment measured against the live deployment', () => {
    // Measured from an actual 3-sample run (see the [assess] server log):
    //   4593in 3840cached/568out ~$0.007970
    // This is the WARM case and it is the best case, not the expected one: the
    // cache had been primed by a smoke-test run minutes earlier. The three
    // samples fire in parallel and so cannot warm each other, and Azure evicts
    // prefix caches when idle — a low-traffic site usually pays the cold rate
    // pinned by the next test. Kept because it pins the cached arithmetic.
    const total = [
      usage(1531, 188, 1280),
      usage(1531, 189, 1280),
      usage(1531, 191, 1280),
    ].reduce(addUsage, EMPTY_USAGE);

    expect(total.promptTokens).toBe(4593);
    expect(total.cachedTokens).toBe(3840);
    expect(total.completionTokens).toBe(568);

    const uncachedInput = 4593 - 3840;
    const expected =
      (uncachedInput * DEFAULT_RATES.input +
        3840 * DEFAULT_RATES.cachedInput +
        568 * DEFAULT_RATES.output) /
      1_000_000;

    expect(estimateCostUsd(total)).toBeCloseTo(expected, 10);
    expect(formatPerThousand(estimateCostUsd(total))).toBe('$7.97/1k');
  });

  it('prices the same assessment higher with a cold cache', () => {
    // The budgeting number. Same token counts, nothing cached — what a parallel
    // 3-sample assessment pays when no recent assessment primed the prefix.
    const cold = [usage(1531, 188), usage(1531, 189), usage(1531, 191)].reduce(
      addUsage,
      EMPTY_USAGE,
    );
    const warm = [
      usage(1531, 188, 1280),
      usage(1531, 189, 1280),
      usage(1531, 191, 1280),
    ].reduce(addUsage, EMPTY_USAGE);

    expect(estimateCostUsd(cold)).toBeGreaterThan(estimateCostUsd(warm));
    expect(formatPerThousand(estimateCostUsd(cold))).toBe('$13.73/1k');
    // Guard the order of magnitude: cents per hundred assessments, not dollars.
    // If this ever trips, the model or the rates changed.
    expect(estimateCostUsd(cold)).toBeLessThan(0.02);
  });
});

describe('addUsage', () => {
  it('sums every field independently', () => {
    expect(addUsage(usage(10, 1, 2), usage(20, 3, 4))).toEqual({
      promptTokens: 30,
      cachedTokens: 6,
      completionTokens: 4,
    });
  });

  it('is identity against EMPTY_USAGE', () => {
    const u = usage(5, 6, 7);
    expect(addUsage(u, EMPTY_USAGE)).toEqual(u);
  });
});

describe('formatting', () => {
  it('keeps enough precision for sub-cent amounts to differ visibly', () => {
    expect(formatUsd(0.004862)).toBe('$0.004862');
    expect(formatUsd(0.004862)).not.toBe(formatUsd(0.004123));
  });

  it('uses coarser precision once the amount is legible', () => {
    expect(formatUsd(1.23456789)).toBe('$1.2346');
  });

  it('renders exact zero without decimal noise', () => {
    expect(formatUsd(0)).toBe('$0');
  });

  it('scales to a per-1000 figure a human can reason about', () => {
    expect(formatPerThousand(0.0146)).toBe('$14.60/1k');
  });
});
