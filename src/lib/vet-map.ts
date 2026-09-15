/**
 * The keyless "find a vet" fallback.
 *
 * A plain Google Maps search URL: no API key, no request, no cost, and it
 * works in every browser. This is what the UI shows whenever the richer Azure
 * Maps lookup in `azure-maps.ts` cannot run — Maps not configured, location
 * declined, upstream error, or no clinics found.
 *
 * Keeping it separate from the Azure module is deliberate: this link must
 * never acquire a dependency that could itself fail.
 */

/** Plain maps search. No key, no cost — the universal fallback. */
export const VET_MAPS_URL = 'https://www.google.com/maps/search/veterinarian+near+me';

