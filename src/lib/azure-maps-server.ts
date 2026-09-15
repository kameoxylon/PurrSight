/**
 * Server-only Azure Maps access.
 *
 * NOTHING HERE MAY EVER BE IMPORTED INTO A CLIENT COMPONENT. It resolves a
 * credential, and an Azure Maps subscription key cannot be restricted by HTTP
 * referrer the way an embedded third-party map key can — so a key that reaches
 * the browser is a key that bills this subscription for whoever copies it.
 * The route in `app/api/vets` is the only caller.
 */
import { DefaultAzureCredential, getBearerTokenProvider } from '@azure/identity';
import { buildPoiSearchUrl, buildStaticMapUrl, toVets, type LatLng, type Vet } from './azure-maps';

const SCOPE = 'https://atlas.microsoft.com/.default';
const TIMEOUT_MS = 8000;

/**
 * Managed identity is preferred and a subscription key is the documented
 * fallback — the same shape as the model client in `lib/assess/client.ts`, so
 * there is one story for Azure auth in this codebase rather than two.
 */
type MapsAuth =
  | { kind: 'key'; key: string }
  | { kind: 'entra'; clientId: string; token: () => Promise<string> };

/**
 * Resolved once. DefaultAzureCredential caches and refreshes its own token, so
 * holding the provider across requests is correct — building a new credential
 * per request would re-run the whole discovery chain every time.
 */
let cached: MapsAuth | null | undefined;

function resolveAuth(): MapsAuth | null {
  if (cached !== undefined) return cached;

  const key = process.env.AZURE_MAPS_SUBSCRIPTION_KEY?.trim();
  if (key) {
    cached = { kind: 'key', key };
    return cached;
  }

  // Entra needs the account's unique client id; without it the data plane
  // cannot tell which Maps account to bill and returns an opaque 401.
  const clientId = process.env.AZURE_MAPS_CLIENT_ID?.trim();
  cached = clientId
    ? { kind: 'entra', clientId, token: getBearerTokenProvider(new DefaultAzureCredential(), SCOPE) }
    : null;
  return cached;
}

/** True when the feature can run at all. Lets the route answer 503 rather than 500. */
export function isMapsConfigured(): boolean {
  return resolveAuth() !== null;
}

/**
 * Apply whichever credential is configured. The key goes in the query string
 * because that is the only form the Render API accepts, and `x-ms-client-id`
 * is meaningful ONLY for Entra — sending it alongside a key produces a
 * confusing 401.
 */
async function authorize(url: string): Promise<{ url: string; headers: HeadersInit }> {
  const auth = resolveAuth();
  if (!auth) throw new Error('Azure Maps is not configured.');

  if (auth.kind === 'key') {
    const joiner = url.includes('?') ? '&' : '?';
    return { url: `${url}${joiner}subscription-key=${encodeURIComponent(auth.key)}`, headers: {} };
  }

  return {
    url,
    headers: {
      Authorization: `Bearer ${await auth.token()}`,
      'x-ms-client-id': auth.clientId,
    },
  };
}

async function call(rawUrl: string): Promise<Response> {
  const { url, headers } = await authorize(rawUrl);
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) {
    throw new Error(`Azure Maps returned ${res.status}.`);
  }
  return res;
}

/** Nearby veterinary clinics. Radius and limit are fixed in the URL builder. */
export async function searchVets(position: LatLng): Promise<Vet[]> {
  const res = await call(buildPoiSearchUrl(position));
  return toVets(await res.json());
}

/**
 * A static map centred on the user with a pin per clinic, returned as a data
 * URL so the browser never needs a credential and we never need a second
 * public endpoint that could be used to proxy arbitrary map renders.
 */
export async function renderMap(centre: LatLng, pins: LatLng[]): Promise<string> {
  const res = await call(buildStaticMapUrl(centre, pins));
  const bytes = Buffer.from(await res.arrayBuffer());
  return `data:image/png;base64,${bytes.toString('base64')}`;
}
