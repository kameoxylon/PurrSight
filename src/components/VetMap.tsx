'use client';

import { useState } from 'react';
import VetLink from './VetLink';
import { coarsen, formatDistance, type VetsResponse, type Vet } from '@/lib/azure-maps';

/**
 * Nearby veterinary clinics, from Azure Maps by way of our own API route.
 *
 * Location is requested only when the user taps the button — never on load. On
 * a site whose whole pitch is trust, a geolocation prompt should be something
 * the user asked for.
 *
 * The position is coarsened HERE, before it leaves the device, so full GPS
 * precision never reaches our server or Azure. Every failure path — no
 * geolocation, permission denied, Maps not configured, upstream error, or no
 * results — degrades to the plain maps link the app has always had.
 */
type State =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'ready'; vets: Vet[]; mapPng: string | null }
  | { kind: 'unavailable' };

export default function VetMap() {
  const [state, setState] = useState<State>({ kind: 'idle' });

  const locate = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setState({ kind: 'unavailable' });
      return;
    }

    setState({ kind: 'busy' });
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { lat, lng } = coarsen({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        try {
          const res = await fetch(`/api/vets?lat=${lat}&lng=${lng}`);
          const body = (await res.json()) as VetsResponse;
          if (!res.ok || body.status !== 'ok' || body.vets.length === 0) {
            setState({ kind: 'unavailable' });
            return;
          }
          setState({ kind: 'ready', vets: body.vets, mapPng: body.mapPng });
        } catch {
          setState({ kind: 'unavailable' });
        }
      },
      () => setState({ kind: 'unavailable' }),
      { timeout: 10_000, maximumAge: 300_000 },
    );
  };

  if (state.kind === 'ready') {
    return (
      <div className="space-y-3">
        {state.mapPng && (
          // A data URL built by our own route: there is no remote host for the
          // image optimiser to fetch from, so <Image /> would add nothing here.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={state.mapPng}
            alt="Map showing veterinary clinics near your location"
            width={640}
            height={360}
            className="h-auto w-full rounded-xl border border-line"
          />
        )}
        <ul className="space-y-1.5">
          {state.vets.map((vet) => (
            <li key={`${vet.name}-${vet.position.lat}-${vet.position.lng}`} className="text-sm">
              <span className="font-semibold">{vet.name}</span>
              {vet.distanceMetres > 0 && (
                <span className="text-faint"> · {formatDistance(vet.distanceMetres)}</span>
              )}
              {vet.address && <div className="text-xs text-faint">{vet.address}</div>}
            </li>
          ))}
        </ul>
        <VetLink variant="plain" />
      </div>
    );
  }

  if (state.kind === 'unavailable') {
    return (
      <div className="space-y-1">
        <VetLink variant="plain" />
        <p className="text-xs text-faint">
          We couldn&apos;t look up clinics near you, so here&apos;s a map search instead.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={locate}
        disabled={state.kind === 'busy'}
        className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
      >
        <span aria-hidden>🏥</span>
        {state.kind === 'busy' ? 'Finding vets near you…' : 'Show vets near me'}
      </button>
      <p className="text-xs text-faint">
        Uses your location only when you tap this, and only to find nearby clinics.
      </p>
    </div>
  );
}
