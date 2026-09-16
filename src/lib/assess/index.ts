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
import { MIN_IMAGE_EDGE, readImageDimensions } from './image-dimensions';
import { activePrompt } from './prompt';
import {
  EMPTY_USAGE,
  addUsage,
  estimateCostUsd,
  formatPerThousand,
  formatUsd,
  type TokenUsage,
} from './pricing';
import { aggregate, rejectImageTooSmall } from './scoring';
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

  // Ties the three concurrent sample logs to one assessment. Without it,
  // interleaved output from parallel requests is unreadable.
  const id = Math.random().toString(36).slice(2, 8);
  const startedAt = Date.now();
  const bytes = Buffer.from(input.imageBase64, 'base64');
  const sizeKb = Math.round(bytes.length / 1024);

  // PRE-MODEL GATE. The eval found that a 96px image is not refused by the
  // model — all three tiny96 cases came back scored, 3/3 agreement, and one
  // returned 0.40 "likely", above the analgesia threshold, for a comfortable
  // cat. Resolution is a mechanical property of the input, so it is settled
  // here rather than asked of a model that demonstrably answers wrong.
  const dims = readImageDimensions(bytes);
  if (dims && Math.min(dims.width, dims.height) < MIN_IMAGE_EDGE) {
    console.info(
      `[assess] ${id} rejected before model | ${dims.width}x${dims.height} ` +
        `shortEdge=${Math.min(dims.width, dims.height)} < ${MIN_IMAGE_EDGE}`,
    );
    return rejectImageTooSmall(dims.width, dims.height);
  }
  if (!dims) {
    // Fail OPEN. The MIME type is already validated by the route, so an
    // unreadable header is far more likely to be a format quirk than an
    // attack, and refusing a real photo is the worse outcome.
    console.warn(`[assess] ${id} could not read dimensions from ${input.mimeType}; not gating on size`);
  }

  const size = dims ? `${dims.width}x${dims.height} ` : '';
  console.info(`[assess] ${id} start | ${input.mimeType} ~${sizeKb}KB ${size}| ${SAMPLES_PER_ASSESSMENT} samples`);

  try {
    // VOTE RULE 1: a run that failed does not get a vote. It is discarded
    // here and never reaches the scoring layer.
    const settled = await Promise.allSettled(
      Array.from({ length: SAMPLES_PER_ASSESSMENT }, (_, i) =>
        runSingleAssessment(input, `${id}.${i + 1}`),
      ),
    );

    const survivors: ValidatedResponse[] = [];
    const failures: AssessErrorKind[] = [];
    // Every call is billed, including ones whose result we discard.
    let billed: TokenUsage = EMPTY_USAGE;

    for (const [i, outcome] of settled.entries()) {
      if (outcome.status === 'rejected') {
        // runSingleAssessment returns failures as values, so a rejection here
        // means a genuine bug rather than a provider problem.
        console.error(`[assess] ${id}.${i + 1} threw unexpectedly:`, outcome.reason);
        failures.push('internal');
        continue;
      }
      const run: RunOutcome = outcome.value;
      billed = addUsage(billed, run.usage);
      if (run.ok) {
        survivors.push(run.value);
      } else {
        console.error(`[assess] ${id}.${i + 1} failed (${run.kind}):`, run.detail);
        failures.push(run.kind);
      }
    }

    // Report WHY the samples died rather than letting aggregate()'s generic
    // 'bad_model_response' mask a rate limit or a dead endpoint — A's route
    // turns these kinds into different HTTP statuses.
    const result =
      survivors.length < MIN_CONTRIBUTING_SAMPLES
        ? toError(dominantKind(failures))
        : aggregate(survivors, { model: getModelName(), promptVersion: activePrompt().version });

    logOutcome(id, startedAt, survivors.length, billed, result);
    return result;
  } catch (err) {
    // Last line of defence for the never-throws guarantee.
    console.error(`[assess] ${id} unexpected failure:`, err);
    return toError('internal');
  }
};

/**
 * The voted result, after the ensemble has been reconciled. Per-AU scores are
 * logged with their agreement counts, so a surprising number in the UI can be
 * traced back to whether the runs actually agreed on it.
 */
function logOutcome(
  id: string,
  startedAt: number,
  contributing: number,
  billed: TokenUsage,
  result: AssessResult,
): void {
  const usd = estimateCostUsd(billed);
  const cached = billed.cachedTokens > 0 ? ` ${billed.cachedTokens}cached` : '';
  const cost =
    `${billed.promptTokens}in${cached}/${billed.completionTokens}out ` +
    `~${formatUsd(usd)} (${formatPerThousand(usd)})`;

  const head =
    `[assess] ${id} ${result.status} in ${((Date.now() - startedAt) / 1000).toFixed(1)}s ` +
    `| ${contributing}/${SAMPLES_PER_ASSESSMENT} samples | ${cost}`;

  if (result.status === 'assessed') {
    const a = result.assessment;
    const units = a.actionUnits
      .map((u) => `${u.id}=${u.score ?? 'null'}(${u.agreement}/${a.meta.samples})`)
      .join(' ');
    const caveats = a.caveats.map((c) => c.kind).join(',') || 'none';
    console.info(
      `${head} | ${units} | ${a.rawScore}/${a.maxPossible} = ${a.normalizedScore.toFixed(2)} ` +
        `${a.band}${a.aboveThreshold ? ' ABOVE-THRESHOLD' : ''} | scorable ${a.scorableCount}/5 | caveats: ${caveats}`,
    );
    return;
  }

  if (result.status === 'rejected') {
    console.info(`${head} | reason=${result.reason}`);
    return;
  }

  console.error(`${head} | kind=${result.kind} retryable=${result.retryable}`);
}
