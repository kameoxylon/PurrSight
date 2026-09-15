/**
 * Pure URL building and response mapping for the "vets near me" feature,
 * backed by Azure Maps.
 *
 * Kept free of credentials, `fetch`, and Node APIs so it can be unit tested —
 * vitest runs in a node environment, so there is no DOM and no server context.
 * Everything that needs a token lives in `azure-maps-server.ts`.
 *
 * WHY AZURE MAPS AND NOT AN EMBEDDED THIRD-PARTY MAP: an Azure Maps
 * subscription key cannot be restricted by HTTP referrer, so it must never
 * reach the browser. Both calls below are therefore made server-side and the
 * browser only ever sees the finished result.
 */

/**
 * COORDINATE ORDER IS A TRAP. Azure Maps is inconsistent on purpose-built
 * endpoints: the Search API takes separate `lat` and `lon` query parameters,
 * while the Render API takes a single `center`/`pins` value ordered
 * LONGITUDE FIRST. Getting this backwards silently returns a map of the wrong
 * hemisphere rather than an error, so the builders below are the only place
 * allowed to serialise a coordinate.
 */
export type LatLng = { lat: number; lng: number };

const SEARCH_ENDPOINT = 'https://atlas.microsoft.com/search/poi/json';
const RENDER_ENDPOINT = 'https://atlas.microsoft.com/map/static';

/** Verified working against the live service; see docs/LOCAL-SETUP.md. */
const SEARCH_API_VERSION = '1.0';
const RENDER_API_VERSION = '2024-04-01';

/** Fixed server-side so a caller cannot widen the search and run up cost. */
export const SEARCH_RADIUS_METRES = 8000;
export const SEARCH_LIMIT = 5;

const MAP_WIDTH = 640;
const MAP_HEIGHT = 360;
const MAP_ZOOM = 12;

/**
 * Trim the precision we send to Azure. Three decimals is roughly 110 m, which
 * is far more than enough to centre a city-level map and avoids handing a
 * pinpoint fix to a third party for a feature that only needs "roughly where
 * you are".
 */
export function coarsen({ lat, lng }: LatLng): LatLng {
  return { lat: Math.round(lat * 1000) / 1000, lng: Math.round(lng * 1000) / 1000 };
}

/**
 * Reject anything that is not a real point on Earth. The values arrive from a
 * query string, so they are attacker-controlled: NaN, Infinity and out-of-range
 * numbers all have to die here rather than inside a billed upstream call.
 */
export function isValidLatLng(value: unknown): value is LatLng {
  if (typeof value !== 'object' || value === null) return false;
  const { lat, lng } = value as Partial<LatLng>;
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/** Parse the two query params into a validated position, or null. */
export function parsePosition(lat: string | null, lng: string | null): LatLng | null {
  if (lat === null || lng === null || lat.trim() === '' || lng.trim() === '') return null;
  const candidate = { lat: Number(lat), lng: Number(lng) };
  return isValidLatLng(candidate) ? candidate : null;
}

/** Search API: separate `lat` / `lon` params. */
export function buildPoiSearchUrl(position: LatLng): string {
  const { lat, lng } = coarsen(position);
  const params = new URLSearchParams({
    'api-version': SEARCH_API_VERSION,
    query: 'veterinarian',
    lat: String(lat),
    lon: String(lng),
    radius: String(SEARCH_RADIUS_METRES),
    limit: String(SEARCH_LIMIT),
  });
  return `${SEARCH_ENDPOINT}?${params.toString()}`;
}

/**
 * Render API: `center` and every pin are "LONGITUDE LATITUDE". The pins value
 * is `<style>||<lon lat>|<lon lat>…` — the double pipe separates styling from
 * the coordinate list and is not a typo.
 */
export function buildStaticMapUrl(centre: LatLng, pins: LatLng[]): string {
  const { lat, lng } = coarsen(centre);
  const params = new URLSearchParams({
    'api-version': RENDER_API_VERSION,
    center: `${lng},${lat}`,
    zoom: String(MAP_ZOOM),
    width: String(MAP_WIDTH),
    height: String(MAP_HEIGHT),
  });

  let url = `${RENDER_ENDPOINT}?${params.toString()}`;
  if (pins.length > 0) {
    const coords = pins.map((p) => `${p.lng} ${p.lat}`).join('|');
    url += `&pins=${encodeURIComponent(`default|co2563EB||${coords}`)}`;
  }
  return url;
}

/** What the UI renders. Deliberately smaller than the Azure response. */
export type Vet = {
  name: string;
  address: string;
  distanceMetres: number;
  position: LatLng;
};

/**
 * Narrow the Azure Search response to the handful of fields we show.
 *
 * Written defensively because this is third-party data: any entry missing a
 * name or a usable position is dropped rather than rendered as "undefined".
 */
export function toVets(payload: unknown): Vet[] {
  const results = (payload as { results?: unknown })?.results;
  if (!Array.isArray(results)) return [];

  const vets: Vet[] = [];
  for (const entry of results) {
    const row = entry as {
      poi?: { name?: unknown };
      address?: { freeformAddress?: unknown };
      position?: { lat?: unknown; lon?: unknown };
      dist?: unknown;
    };

    const name = typeof row.poi?.name === 'string' ? row.poi.name.trim() : '';
    if (name === '') continue;

    const position = { lat: Number(row.position?.lat), lng: Number(row.position?.lon) };
    if (!isValidLatLng(position)) continue;

    vets.push({
      name,
      address:
        typeof row.address?.freeformAddress === 'string' ? row.address.freeformAddress.trim() : '',
      distanceMetres: Number.isFinite(Number(row.dist)) ? Math.round(Number(row.dist)) : 0,
      position,
    });
  }
  return vets.slice(0, SEARCH_LIMIT);
}

/**
 * The contract between `app/api/vets` and the `VetMap` component.
 *
 * `mapPng` is nullable on purpose: a failed map render must not cost the user
 * the clinic list, which is the genuinely useful half of the response.
 */
export type VetsResponse =
  | { status: 'ok'; vets: Vet[]; mapPng: string | null }
  | { status: 'unavailable' };

/** "348 m" / "1.2 km" — distances are approximate, so never show decimals of a metre. */
export function formatDistance(metres: number): string {
  if (!Number.isFinite(metres) || metres <= 0) return '';
  return metres < 1000 ? `${Math.round(metres)} m` : `${(metres / 1000).toFixed(1)} km`;
}
