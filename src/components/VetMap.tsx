'use client';

import { useState } from 'react';
import VetLink from './VetLink';
import { buildVetMapUrl } from '@/lib/vet-map';

/**
 * An embedded map of nearby veterinary clinics.
 *
 * Location is requested only when the user taps the button — never on load.
 * An iframe cannot read the parent page's position, so "near me" genuinely
 * needs the geolocation prompt, and on a site whose whole pitch is trust that
 * prompt should be something the user asked for.
 *
 * Every failure path degrades to the plain maps link: no API key configured,
 * geolocation unsupported, permission denied, or lookup timed out.
 */
type State =
  | { kind: 'idle' }
  | { kind: 'locating' }
  | { kind: 'ready'; url: string }
  | { kind: 'unavailable' };

export default function VetMap() {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY;
  const [state, setState] = useState<State>({ kind: 'idle' });

  // Nothing to embed with. Behave exactly as the app did before the map existed.
  if (!apiKey) return <VetLink variant="plain" />;

  const locate = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setState({ kind: 'unavailable' });
      return;
    }

    setState({ kind: 'locating' });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const url = buildVetMapUrl(apiKey, {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
        setState(url ? { kind: 'ready', url } : { kind: 'unavailable' });
      },
      () => setState({ kind: 'unavailable' }),
      { timeout: 10_000, maximumAge: 300_000 },
    );
  };

  if (state.kind === 'ready') {
    return (
      <div className="space-y-2">
        <iframe
          title="Veterinary clinics near you"
          src={state.url}
          className="h-64 w-full rounded-xl border border-line"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allowFullScreen
        />
        <VetLink variant="plain" />
      </div>
    );
  }

  if (state.kind === 'unavailable') {
    return (
      <div className="space-y-1">
        <VetLink variant="plain" />
        <p className="text-xs text-faint">
          We couldn&apos;t get your location, so here&apos;s a map search instead.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={locate}
        disabled={state.kind === 'locating'}
        className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
      >
        <span aria-hidden>🏥</span>
        {state.kind === 'locating' ? 'Finding vets near you…' : 'Show vets near me'}
      </button>
      <p className="text-xs text-faint">
        Uses your location only when you tap this, and only to centre the map.
      </p>
    </div>
  );
}
