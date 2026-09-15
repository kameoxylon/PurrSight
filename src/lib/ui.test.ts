import { describe, it, expect } from 'vitest';
import type { Caveat } from './contract';
import { splitCaveats } from './ui';

const scopeCaveat: Caveat = {
  kind: 'acute_pain_only',
  message: 'The Feline Grimace Scale was validated for acute (short-term) pain.',
};
const agreementCaveat: Caveat = {
  kind: 'low_agreement',
  message: 'Repeated readings disagreed about the ears.',
};

describe('splitCaveats', () => {
  it('routes the scale-scope caveat away from the photo-specific ones', () => {
    const { scope, photo } = splitCaveats([scopeCaveat, agreementCaveat]);
    expect(scope).toEqual([scopeCaveat]);
    expect(photo).toEqual([agreementCaveat]);
  });

  it('treats coat and face-shape caveats as photo-specific', () => {
    const coat: Caveat = { kind: 'dark_coat', message: 'Dark coat.' };
    const face: Caveat = { kind: 'brachycephalic', message: 'Flat-faced breed.' };
    const { scope, photo } = splitCaveats([coat, face]);
    expect(scope).toEqual([]);
    expect(photo).toEqual([coat, face]);
  });

  it('keeps an unrecognised kind rather than dropping it silently', () => {
    // A kind added server-side that this build predates. Over-showing a caveat
    // is the safe failure; losing one is not.
    const future = { kind: 'motion_blur', message: 'The photo is blurred.' } as unknown as Caveat;
    const { scope, photo } = splitCaveats([future]);
    expect(scope).toEqual([]);
    expect(photo).toEqual([future]);
  });

  it('preserves the original order within each group', () => {
    const first: Caveat = { kind: 'low_agreement', message: 'first' };
    const second: Caveat = { kind: 'dark_coat', message: 'second' };
    const { photo } = splitCaveats([first, scopeCaveat, second]);
    expect(photo.map((c) => c.message)).toEqual(['first', 'second']);
  });

  it('handles an empty list', () => {
    expect(splitCaveats([])).toEqual({ scope: [], photo: [] });
  });
});
