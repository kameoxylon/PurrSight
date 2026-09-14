/**
 * Person A UI constants and helpers. This file is A-owned and never imports
 * from lib/assess. It only depends on the frozen contract types.
 */
import type { ActionUnitId, Band } from './contract';

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
    text: 'text-emerald-700',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    solid: '#059669',
  },
  possible: {
    label: 'Possible discomfort',
    text: 'text-amber-700',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    solid: '#d97706',
  },
  likely: {
    label: 'Likely pain',
    text: 'text-rose-700',
    bg: 'bg-rose-50',
    border: 'border-rose-200',
    solid: '#e11d48',
  },
};

/** Human label for an action-unit score. */
export function scoreLabel(score: 0 | 1 | 2 | null): string {
  if (score === null) return 'Not assessable';
  return { 0: 'Relaxed (0)', 1: 'Some tension (1)', 2: 'Marked tension (2)' }[score];
}
