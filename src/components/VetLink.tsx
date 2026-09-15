/**
 * "Find a vet" — opens a Google Maps search for nearby veterinary hospitals in
 * a new tab. A plain maps URL: no API key, no request from us, no cost, and
 * nothing to fail at runtime.
 *
 * Kept as an <a> rather than a button that calls window.open, so middle-click,
 * ctrl-click and "copy link address" all behave the way the user expects.
 *
 * The `button` variant matches the size of the action-row controls in page.tsx
 * (rounded-full px-6 py-2.5) so it reads as a peer of them, while keeping the
 * accent fill that marks it as the one control that leaves the site.
 */
import { VET_MAPS_URL } from '@/lib/vet-map';

export default function VetLink({ variant = 'button' }: { variant?: 'button' | 'plain' }) {
  const className =
    variant === 'button'
      ? 'inline-flex items-center gap-1.5 rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-white transition hover:opacity-90'
      : 'inline-flex items-center gap-1 text-sm font-semibold text-accent underline underline-offset-2 transition hover:opacity-80';

  return (
    <a href={VET_MAPS_URL} target="_blank" rel="noopener noreferrer" className={className}>
      <span aria-hidden>🏥</span> Find a vet
    </a>
  );
}
