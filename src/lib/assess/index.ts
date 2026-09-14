/**
 * PurrSight — assessImage() ENTRY POINT (Phase 0 STUB)
 * ---------------------------------------------------------------------------
 * This is the ONLY thing A imports from lib/assess/. B replaces the body in
 * Phase 2 with the real prompt -> model -> schema -> gating -> scoring
 * pipeline. The SIGNATURE (AssessImageFn) is frozen in contract.ts and must
 * not change.
 *
 * Contract guarantee (see contract.ts): this function NEVER throws. Every
 * failure returns a { status: 'error' } result so A has exactly one shape to
 * handle.
 *
 * Until Phase 2, it returns a fixture after a short delay so A can build the
 * whole app against realistic timing. Flip STUB_RESULT to exercise each UI
 * state (healthy / painful / rejected / partial / error).
 */
import type { AssessImageFn } from '../contract';
import { allFixtures } from '../fixtures';

const STUB_DELAY_MS = 1500; // real calls are 3–8s; A designs the loading state for ~8s.
const STUB_RESULT: keyof typeof allFixtures = 'healthy';

export const assessImage: AssessImageFn = async (input) => {
  // Cheap sanity checks so the stub behaves plausibly for A's route wiring.
  if (!input?.imageBase64 || !input?.mimeType) {
    return {
      status: 'error',
      kind: 'internal',
      message: 'No image was provided.',
      retryable: false,
    };
  }

  await new Promise((r) => setTimeout(r, STUB_DELAY_MS));
  return allFixtures[STUB_RESULT];
};
