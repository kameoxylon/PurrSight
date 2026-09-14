/**
 * PurrSight — TOKEN COST ESTIMATION
 * ---------------------------------------------------------------------------
 * Turns reported token usage into a dollar figure so the cost of a demo, an
 * eval run, or a day of traffic is visible in the logs rather than discovered
 * on a bill.
 *
 * ⚠️ These are ESTIMATES against published list prices. Actual billing depends
 * on your region, deployment type, and any enterprise agreement. Treat the
 * numbers as an order-of-magnitude guide, and reconcile against Azure Cost
 * Management before quoting them to anyone.
 *
 * Prices are env-overridable because they change and this file should not have
 * to be edited (or redeployed) when they do.
 */

/** USD per 1,000,000 tokens. Defaults are gpt-4.1 Global Standard list price. */
export const DEFAULT_RATES = {
  input: 2.0,
  /** Prompt-cache reads bill at a 75% discount. */
  cachedInput: 0.5,
  output: 8.0,
} as const;

export interface TokenUsage {
  /** Total prompt tokens, INCLUDING any that were cache reads. */
  promptTokens: number;
  /** Subset of promptTokens served from the prompt cache, billed cheaper. */
  cachedTokens: number;
  completionTokens: number;
}

export const EMPTY_USAGE: TokenUsage = {
  promptTokens: 0,
  cachedTokens: 0,
  completionTokens: 0,
};

export function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    promptTokens: a.promptTokens + b.promptTokens,
    cachedTokens: a.cachedTokens + b.cachedTokens,
    completionTokens: a.completionTokens + b.completionTokens,
  };
}

function rate(envName: string, fallback: number): number {
  const parsed = Number(process.env[envName]);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function currentRates() {
  return {
    input: rate('ASSESS_PRICE_INPUT_PER_1M', DEFAULT_RATES.input),
    cachedInput: rate('ASSESS_PRICE_CACHED_INPUT_PER_1M', DEFAULT_RATES.cachedInput),
    output: rate('ASSESS_PRICE_OUTPUT_PER_1M', DEFAULT_RATES.output),
  };
}

/**
 * Estimated USD for one call. Cached tokens are billed at the cache rate and
 * the remainder at the full input rate — charging every prompt token at full
 * price would overstate the cost whenever caching kicks in.
 */
export function estimateCostUsd(usage: TokenUsage): number {
  const rates = currentRates();
  const cached = Math.min(usage.cachedTokens, usage.promptTokens);
  const uncached = usage.promptTokens - cached;

  return (
    (uncached * rates.input + cached * rates.cachedInput + usage.completionTokens * rates.output) /
    1_000_000
  );
}

/**
 * Per-assessment costs land around half a cent, where "$0.01" is uselessly
 * coarse. Show enough significant figures to see a change.
 */
export function formatUsd(usd: number): string {
  if (usd === 0) return '$0';
  return usd < 0.01 ? `$${usd.toFixed(6)}` : `$${usd.toFixed(4)}`;
}

/** Costs this small only become intuitive when scaled up. */
export function formatPerThousand(usd: number): string {
  return `$${(usd * 1000).toFixed(2)}/1k`;
}
