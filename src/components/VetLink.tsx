/**
 * "Find a vet near me" — opens a Google Maps search for nearby veterinary
 * hospitals in a new tab. Uses a plain maps URL with no API key and no cost.
 *
 * This is also the fallback for VetMap, which shows an embedded map when a
 * Maps Embed API key is configured and the user shares their location.
 */
import { VET_MAPS_URL } from '@/lib/vet-map';

export default function VetLink({ variant = 'button' }: { variant?: 'button' | 'plain' }) {
  const className =
    variant === 'button'
      ? 'inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90'
      : 'inline-flex items-center gap-1 text-sm font-semibold text-accent underline underline-offset-2 transition hover:opacity-80';

  return (
    <a href={VET_MAPS_URL} target="_blank" rel="noopener noreferrer" className={className}>
      <span aria-hidden>🏥</span> Find a vet near me
    </a>
  );
}
