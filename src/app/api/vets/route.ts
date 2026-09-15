import { NextResponse } from 'next/server';
import { parsePosition, type VetsResponse } from '@/lib/azure-maps';
import { isMapsConfigured, renderMap, searchVets } from '@/lib/azure-maps-server';

/** Uses Buffer and the Azure credential chain, so pin the Node runtime. */
export const runtime = 'nodejs';

/**
 * Nearby veterinary clinics plus a static map of them.
 *
 * This endpoint exists so that the Azure Maps credential stays on the server.
 * The browser sends only a coarse position and receives finished, inert
 * results — no key, no token, nothing it could replay against our subscription.
 */
export async function GET(req: Request): Promise<NextResponse<VetsResponse>> {
  // 503, not 500: "we never set this up" is an operator problem, and it lets
  // the UI fall back to the plain maps link instead of showing an error.
  if (!isMapsConfigured()) {
    return NextResponse.json<VetsResponse>({ status: 'unavailable' }, { status: 503 });
  }

  const { searchParams } = new URL(req.url);
  const position = parsePosition(searchParams.get('lat'), searchParams.get('lng'));
  if (!position) {
    return NextResponse.json<VetsResponse>({ status: 'unavailable' }, { status: 400 });
  }

  let vets;
  try {
    vets = await searchVets(position);
  } catch (error) {
    console.warn('[vets] clinic search failed:', (error as Error).message);
    return NextResponse.json<VetsResponse>({ status: 'unavailable' }, { status: 502 });
  }

  // The map is the garnish. If it fails, still serve the list.
  let mapPng: string | null = null;
  try {
    mapPng = await renderMap(
      position,
      vets.map((v) => v.position),
    );
  } catch (error) {
    console.warn('[vets] map render failed, serving list only:', (error as Error).message);
    mapPng = null;
  }

  console.log(`[vets] ${vets.length} clinic(s), map ${mapPng ? 'rendered' : 'omitted'}`);
  return NextResponse.json<VetsResponse>({ status: 'ok', vets, mapPng });
}
