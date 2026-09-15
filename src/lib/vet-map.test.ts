import { describe, expect, it } from 'vitest';
import { VET_MAPS_URL } from './vet-map';

describe('VET_MAPS_URL', () => {
  it('is a keyless maps search, so the fallback can never fail to build', () => {
    expect(VET_MAPS_URL.startsWith('https://www.google.com/maps/search/')).toBe(true);
    expect(VET_MAPS_URL).toContain('veterinarian');
  });

  it('carries no credential', () => {
    expect(VET_MAPS_URL).not.toMatch(/[?&](key|subscription-key|token)=/);
  });
});
