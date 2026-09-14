/**
 * PurrSight — assessImage() ENTRY POINT
 * ---------------------------------------------------------------------------
 * The ONLY thing A imports from lib/assess/. The signature is frozen in
 * contract.ts (AssessImageFn) and must not change.
 *
 * The pipeline, end to end:
 *
 *   image -> SAMPLES_PER_ASSESSMENT parallel model calls   (client.ts)
 *         -> per-call schema + semantic validation         (schema.ts)
 *         -> discard failed runs                           (VOTE RULE 1)
 *         -> vote, score, gate, caveat                     (scoring.ts)
 *         -> AssessResult
 *
 * The samples run in PARALLEL, so three calls cost about one call of latency
 * (5-8s) rather than three.
 *
 * CONTRACT GUARANTEE: this function NEVER throws. Every failure — bad env, a
 * dead endpoint, nonsense from the model, a bug in here — comes back as
 * { status: 'error' } so A has exactly one shape to handle.
 */
import {
  MIN_CONTRIBUTING_SAMPLES,
  SAMPLES_PER_ASSESSMENT,
  type AssessErrorKind,
  type AssessImageFn,
  type AssessResult,
} from '../contract';
import { getModelName, runSingleAssessment, type RunOutcome } from './client';
import { PROMPT_VERSION } from './prompt';
import { aggregate } from './scoring';
import type { ValidatedResponse } from './schema';

/**
 * User-facing copy per failure kind. Deliberately free of provider detail:
 * contract.ts requires `message` be safe to render verbatim.
 */
const ERROR_COPY: Record<AssessErrorKind, { message: string; retryable: boolean }> = {
  timeout: {
    message: 'The assessment took too long to complete. Please try again.',
    retryable: true,
  },
  rate_limit: {
    message: 'We are handling a lot of photos right now. Please wait a moment and try again.',
    retryable: true,
  },
  upstream_unavailable: {
    message: 'The assessment service is temporarily unavailable. Please try again shortly.',
    retryable: true,
  },
  bad_model_response: {
    message: 'We could not get a reliable reading on that photo. Please try again.',
    retryable: true,
  },
  internal: {
    message: 'Something went wrong on our end. Please try again.',
    retryable: false,
  },
};

/**
 * When too few samples survive, the failures are all we have to explain why.
 * Report the most common kind; on a tie prefer the most specific and
 * actionable one, so "you are rate limited" beats a vague "internal".
 */
const KIND_PRECEDENCE: AssessErrorKind[] = [
  'rate_limit',
  'timeout',
  'upstream_unavailable',
  'bad_model_response',
  'internal',
];

function dominantKind(failures: AssessErrorKind[]): AssessErrorKind {
  if (failures.length === 0) return 'bad_model_response';

  const counts = new Map<AssessErrorKind, number>();
  for (const kind of failures) counts.set(kind, (counts.get(kind) ?? 0) + 1);

  return [...counts.entries()].sort(
    ([aKind, aCount], [bKind, bCount]) =>
      bCount - aCount || KIND_PRECEDENCE.indexOf(aKind) - KIND_PRECEDENCE.indexOf(bKind),
  )[0][0];
}

function toError(kind: AssessErrorKind): AssessResult {
  return { status: 'error', kind, ...ERROR_COPY[kind] };
}

export const assessImage: AssessImageFn = async (input): Promise<AssessResult> => {
  if (!input?.imageBase64 || !input?.mimeType) {
    return {
      status: 'error',
      kind: 'internal',
      message: 'No image was provided.',
      retryable: false,
    };
  }

  try {
    // VOTE RULE 1: a run that failed does not get a vote. It is discarded
    // here and never reaches the scoring layer.
    const settled = await Promise.allSettled(
      Array.from({ length: SAMPLES_PER_ASSESSMENT }, () => runSingleAssessment(input)),
    );

    const survivors: ValidatedResponse[] = [];
    const failures: AssessErrorKind[] = [];

    for (const outcome of settled) {
      if (outcome.status === 'rejected') {
        // runSingleAssessment returns failures as values, so a rejection here
        // means a genuine bug rather than a provider problem.
        console.error('[assess] sample threw unexpectedly:', outcome.reason);
        failures.push('internal');
        continue;
      }
      const run: RunOutcome = outcome.value;
      if (run.ok) {
        survivors.push(run.value);
      } else {
        console.error(`[assess] sample failed (${run.kind}):`, run.detail);
        failures.push(run.kind);
      }
    }

    // Report WHY the samples died rather than letting aggregate()'s generic
    // 'bad_model_response' mask a rate limit or a dead endpoint — A's route
    // turns these kinds into different HTTP statuses.
    if (survivors.length < MIN_CONTRIBUTING_SAMPLES) {
      return toError(dominantKind(failures));
    }

    return aggregate(survivors, { model: getModelName(), promptVersion: PROMPT_VERSION });
  } catch (err) {
    // Last line of defence for the never-throws guarantee.
    console.error('[assess] unexpected failure:', err);
    return toError('internal');
  }
};
