/**
 * URL building for the "vets near me" map.
 *
 * Kept out of the component so it can be unit tested — vitest runs in a node
 * environment, so there is no DOM to render a component into.
 *
 * The embedded map uses the Google Maps Embed API, which requires a key that
 * ships to the browser. That is by design for this API; the key is protected by
 * an HTTP referrer restriction, not by secrecy. When no key is configured the
 * UI falls back to a plain maps link, so local dev and the teammate's checkout
 * keep working with nothing to set up.
 */

/** Plain maps search. No key, no cost — the fallback and the PDF-free path. */
export const VET_MAPS_URL = 'https://www.google.com/maps/search/veterinarian+near+me';

const EMBED_ENDPOINT = 'https://www.google.com/maps/embed/v1/search';

export type LatLng = { lat: number; lng: number };

/**
 * Trim the precision we hand to Google. Three decimals is roughly 110 m, which
 * is far more than enough to centre a city-level map and avoids sending a
 * pinpoint fix for a feature that only needs "roughly where you are".
 */
export function coarsen({ lat, lng }: LatLng): LatLng {
  return { lat: Math.round(lat * 1000) / 1000, lng: Math.round(lng * 1000) / 1000 };
}

/**
 * Build the iframe src, or null when there is no key to build it with.
 * Position is required: an uncentred search drops the viewer somewhere
 * arbitrary, which is worse than showing the link.
 */
export function buildVetMapUrl(apiKey: string | undefined, position: LatLng): string | null {
  if (!apiKey) return null;

  const { lat, lng } = coarsen(position);
  const params = new URLSearchParams({
    key: apiKey,
    q: 'veterinarian',
    center: `${lat},${lng}`,
    zoom: '13',
  });
  return `${EMBED_ENDPOINT}?${params.toString()}`;
}
