import { describe, expect, it } from 'vitest';
import {
  buildPoiSearchUrl,
  buildStaticMapUrl,
  coarsen,
  formatDistance,
  isValidLatLng,
  parsePosition,
  SEARCH_LIMIT,
  SEARCH_RADIUS_METRES,
  toVets,
} from './azure-maps';

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

describe('isValidLatLng', () => {
  it('accepts real points, including the extremes', () => {
    expect(isValidLatLng(montreal)).toBe(true);
    expect(isValidLatLng({ lat: 0, lng: 0 })).toBe(true);
    expect(isValidLatLng({ lat: -90, lng: -180 })).toBe(true);
    expect(isValidLatLng({ lat: 90, lng: 180 })).toBe(true);
  });

  it('rejects values outside the range of the planet', () => {
    expect(isValidLatLng({ lat: 91, lng: 0 })).toBe(false);
    expect(isValidLatLng({ lat: -90.1, lng: 0 })).toBe(false);
    expect(isValidLatLng({ lat: 0, lng: 180.5 })).toBe(false);
  });

  it('rejects the non-finite values a query string can smuggle in', () => {
    expect(isValidLatLng({ lat: Number.NaN, lng: 0 })).toBe(false);
    expect(isValidLatLng({ lat: Number.POSITIVE_INFINITY, lng: 0 })).toBe(false);
    expect(isValidLatLng({ lat: 0, lng: Number.NEGATIVE_INFINITY })).toBe(false);
  });

  it('rejects anything that is not a coordinate at all', () => {
    expect(isValidLatLng(null)).toBe(false);
    expect(isValidLatLng(undefined)).toBe(false);
    expect(isValidLatLng('45,-73')).toBe(false);
    expect(isValidLatLng({ lat: '45', lng: '-73' })).toBe(false);
    expect(isValidLatLng({})).toBe(false);
  });
});

describe('parsePosition', () => {
  it('parses a well-formed pair', () => {
    expect(parsePosition('45.502', '-73.567')).toEqual({ lat: 45.502, lng: -73.567 });
  });

  it('returns null for missing or blank params', () => {
    expect(parsePosition(null, '-73.567')).toBeNull();
    expect(parsePosition('45.502', null)).toBeNull();
    expect(parsePosition('', '-73.567')).toBeNull();
    expect(parsePosition('   ', '-73.567')).toBeNull();
  });

  it('returns null rather than letting junk reach a billed upstream call', () => {
    expect(parsePosition('abc', '-73.567')).toBeNull();
    expect(parsePosition('91', '0')).toBeNull();
    expect(parsePosition('Infinity', '0')).toBeNull();
  });
});

describe('buildPoiSearchUrl', () => {
  it('targets the Azure Maps POI search endpoint', () => {
    const url = new URL(buildPoiSearchUrl(montreal));

    expect(url.origin + url.pathname).toBe('https://atlas.microsoft.com/search/poi/json');
    expect(url.searchParams.get('query')).toBe('veterinarian');
  });

  it('sends lat and lon as SEPARATE params — search is not longitude-first', () => {
    const url = new URL(buildPoiSearchUrl(montreal));

    expect(url.searchParams.get('lat')).toBe('45.502');
    expect(url.searchParams.get('lon')).toBe('-73.567');
  });

  it('pins radius and limit server-side so a caller cannot widen the search', () => {
    const url = new URL(buildPoiSearchUrl(montreal));

    expect(url.searchParams.get('radius')).toBe(String(SEARCH_RADIUS_METRES));
    expect(url.searchParams.get('limit')).toBe(String(SEARCH_LIMIT));
  });

  it('never sends full-precision coordinates', () => {
    const url = buildPoiSearchUrl(montreal);

    expect(url).not.toContain('45.5018678');
    expect(url).not.toContain('-73.5673197');
  });

  it('carries no credential — auth is applied later, by the server module', () => {
    expect(buildPoiSearchUrl(montreal)).not.toMatch(/subscription-key/);
  });
});

describe('buildStaticMapUrl', () => {
  it('orders centre as LONGITUDE,LATITUDE — the Render API is longitude-first', () => {
    const url = new URL(buildStaticMapUrl(montreal, []));

    expect(url.searchParams.get('center')).toBe('-73.567,45.502');
  });

  it('orders every pin longitude-first too', () => {
    const url = new URL(
      buildStaticMapUrl(montreal, [
        { lat: 45.51, lng: -73.56 },
        { lat: 45.52, lng: -73.55 },
      ]),
    );

    expect(url.searchParams.get('pins')).toBe('default|co2563EB||-73.56 45.51|-73.55 45.52');
  });

  it('omits the pins param entirely when there is nothing to pin', () => {
    const url = new URL(buildStaticMapUrl(montreal, []));

    expect(url.searchParams.has('pins')).toBe(false);
  });

  it('requests a sized image from the render endpoint', () => {
    const url = new URL(buildStaticMapUrl(montreal, []));

    expect(url.origin + url.pathname).toBe('https://atlas.microsoft.com/map/static');
    expect(Number(url.searchParams.get('width'))).toBeGreaterThan(0);
    expect(Number(url.searchParams.get('height'))).toBeGreaterThan(0);
  });
});

describe('toVets', () => {
  const entry = (over: Record<string, unknown> = {}) => ({
    poi: { name: 'City Cat Vet Clinic' },
    address: { freeformAddress: '207 Harvard Ave E, Seattle' },
    position: { lat: 47.62, lon: -122.32 },
    dist: 1717.4,
    ...over,
  });

  it('maps the fields the UI actually renders', () => {
    expect(toVets({ results: [entry()] })).toEqual([
      {
        name: 'City Cat Vet Clinic',
        address: '207 Harvard Ave E, Seattle',
        distanceMetres: 1717,
        position: { lat: 47.62, lng: -122.32 },
      },
    ]);
  });

  it('survives a response that is not shaped like a response', () => {
    expect(toVets(undefined)).toEqual([]);
    expect(toVets({})).toEqual([]);
    expect(toVets({ results: 'nope' })).toEqual([]);
    expect(toVets({ results: [] })).toEqual([]);
  });

  it('drops entries that would render as "undefined"', () => {
    expect(toVets({ results: [entry({ poi: {} })] })).toEqual([]);
    expect(toVets({ results: [entry({ poi: { name: '   ' } })] })).toEqual([]);
  });

  it('drops entries without a usable position, since they cannot be pinned', () => {
    expect(toVets({ results: [entry({ position: undefined })] })).toEqual([]);
    expect(toVets({ results: [entry({ position: { lat: 'x', lon: 'y' } })] })).toEqual([]);
  });

  it('tolerates a missing address and a missing distance', () => {
    const [vet] = toVets({ results: [entry({ address: undefined, dist: undefined })] });

    expect(vet.address).toBe('');
    expect(vet.distanceMetres).toBe(0);
  });

  it('never returns more than the limit, whatever upstream sends', () => {
    const many = Array.from({ length: 20 }, () => entry());

    expect(toVets({ results: many })).toHaveLength(SEARCH_LIMIT);
  });
});

describe('formatDistance', () => {
  it('uses metres below a kilometre', () => {
    expect(formatDistance(348)).toBe('348 m');
    expect(formatDistance(999)).toBe('999 m');
  });

  it('switches to kilometres at a kilometre', () => {
    expect(formatDistance(1000)).toBe('1.0 km');
    expect(formatDistance(1717)).toBe('1.7 km');
  });

  it('renders nothing for a distance we do not have', () => {
    expect(formatDistance(0)).toBe('');
    expect(formatDistance(Number.NaN)).toBe('');
  });
});
