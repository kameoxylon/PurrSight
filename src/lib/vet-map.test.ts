import { describe, expect, it } from 'vitest';
import { buildVetMapUrl, coarsen, VET_MAPS_URL } from './vet-map';

const montreal = { lat: 45.5018678, lng: -73.5673197 };

describe('coarsen', () => {
  it('rounds to three decimals', () => {
    expect(coarsen(montreal)).toEqual({ lat: 45.502, lng: -73.567 });
  });

  it('keeps the sign of southern and western coordinates', () => {
    expect(coarsen({ lat: -33.8688197, lng: 151.2092955 })).toEqual({
      lat: -33.869,
      lng: 151.209,
    });
  });

  it('leaves already-coarse coordinates alone', () => {
    expect(coarsen({ lat: 45.5, lng: -73.5 })).toEqual({ lat: 45.5, lng: -73.5 });
  });
});

describe('buildVetMapUrl', () => {
  it('returns null without a key, so the caller falls back to the link', () => {
    expect(buildVetMapUrl(undefined, montreal)).toBeNull();
    expect(buildVetMapUrl('', montreal)).toBeNull();
  });

  it('builds an embed URL centred on the supplied position', () => {
    const url = buildVetMapUrl('test-key', montreal);
    expect(url).not.toBeNull();

    const parsed = new URL(url as string);
    expect(parsed.origin + parsed.pathname).toBe('https://www.google.com/maps/embed/v1/search');
    expect(parsed.searchParams.get('key')).toBe('test-key');
    expect(parsed.searchParams.get('q')).toBe('veterinarian');
    expect(parsed.searchParams.get('center')).toBe('45.502,-73.567');
    expect(parsed.searchParams.get('zoom')).toBe('13');
  });

  it('never sends full-precision coordinates', () => {
    const url = buildVetMapUrl('test-key', montreal) as string;

    expect(url).not.toContain('45.5018678');
    expect(url).not.toContain('-73.5673197');
  });

  it('escapes a key containing URL-significant characters', () => {
    const url = buildVetMapUrl('a&b=c', montreal) as string;

    expect(new URL(url).searchParams.get('key')).toBe('a&b=c');
  });

  it('exposes a keyless fallback target', () => {
    expect(VET_MAPS_URL.startsWith('https://www.google.com/maps/search/')).toBe(true);
  });
});
