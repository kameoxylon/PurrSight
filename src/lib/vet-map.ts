/**
 * The "find a vet" destination.
 *
 * A plain Google Maps search URL: no API key, no request from us, no cost, and
 * it works in every browser. Deliberately a bare constant with no dependencies
 * — the one control that sends a worried owner toward actual help must not be
 * able to fail.
 */

/** Plain maps search. No key, no cost — the universal fallback. */
export const VET_MAPS_URL = 'https://www.google.com/maps/search/veterinarian+near+me';

