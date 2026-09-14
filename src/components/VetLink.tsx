/**
 * "Find a vet near me" — opens Google Maps searching for nearby veterinary
 * hospitals. Uses a plain maps URL (the browser supplies the user's location),
 * so there is NO API key, no cost, and nothing to configure for deployment.
 */
const VET_MAPS_URL = 'https://www.google.com/maps/search/veterinarian+near+me';

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
