/**
 * Person A UI constants and helpers. This file is A-owned and never imports
 * from lib/assess. It only depends on the frozen contract types.
 */
import type { ActionUnitId, Band, Caveat } from './contract';

/**
 * Inter-rater reliability from the FGS validation study (Evangelista et al.
 * 2019). NOT decoration — the PLAN calls for weighting the visual hierarchy by
 * how trustworthy each feature is. muzzle (0.63) and whiskers (0.55) are
 * meaningfully softer signals than head/ears/eyes and are presented as such.
 */
export const AU_RELIABILITY: Record<ActionUnitId, number> = {
  head: 0.9,
  ears: 0.87,
  eyes: 0.86,
  muzzle: 0.63,
  whiskers: 0.55,
};

/** Features we visually de-emphasise because the scale itself is less sure of them. */
export function isLowerReliability(id: ActionUnitId): boolean {
  return AU_RELIABILITY[id] < 0.7;
}

export interface BandStyle {
  label: string;
  /** Tailwind text colour */
  text: string;
  /** Tailwind background tint */
  bg: string;
  /** Tailwind border colour */
  border: string;
  /** Solid colour for the dial fill / marker */
  solid: string;
}

export const BAND_STYLES: Record<Band, BandStyle> = {
  minimal: {
    label: 'Minimal signs',
    text: 'text-emerald-700 dark:text-emerald-300',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    solid: '#10b981',
  },
  possible: {
    label: 'Possible discomfort',
    text: 'text-amber-700 dark:text-amber-300',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    solid: '#f59e0b',
  },
  likely: {
    label: 'Likely pain',
    text: 'text-rose-700 dark:text-rose-300',
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/30',
    solid: '#f43f5e',
  },
};

/** Human label for an action-unit score. */
export function scoreLabel(score: 0 | 1 | 2 | null): string {
  if (score === null) return 'Not assessable';
  return { 0: 'Relaxed (0)', 1: 'Some tension (1)', 2: 'Marked tension (2)' }[score];
}

/**
 * Caveats arrive in one array but are two different kinds of statement, and
 * showing them together buries the one that matters.
 *
 * `acute_pain_only` is a property of the SCALE. scoring.ts emits it for every
 * assessment with identical wording, so it is boilerplate — it goes under the
 * gauge as a quiet scope note.
 *
 * Everything else describes THIS photo (`low_agreement` even names the features
 * the runs disagreed on), so it is a confidence signal and belongs beside the
 * feature cards it refers to. Unknown future kinds fall in with the
 * photo-specific ones: over-showing a caveat is the safe failure, silently
 * dropping one is not.
 */
export function splitCaveats(caveats: Caveat[]): { scope: Caveat[]; photo: Caveat[] } {
  const scope: Caveat[] = [];
  const photo: Caveat[] = [];
  for (const caveat of caveats) {
    if (caveat.kind === 'acute_pain_only') scope.push(caveat);
    else photo.push(caveat);
  }
  return { scope, photo };
}
