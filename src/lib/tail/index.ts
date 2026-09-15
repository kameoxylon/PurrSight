/**
 * PurrSight — readTail() ENTRY POINT
 * ---------------------------------------------------------------------------
 * The only thing the app imports from lib/tail/. Signature is frozen in
 * tail-contract.ts (TailReadFn). Like the FGS entry point, this NEVER throws —
 * every failure comes back as { status: 'error' } so the route has one shape
 * to handle.
 */
import {
  MAX_TAIL_FRAMES,
  TAIL_STATE_META,
  type TailConfidence,
  type TailReadFn,
  type TailRejectionReason,
  type TailResult,
} from '../tail-contract';
import { getTailModelName, runTailRead } from './client';
import { TAIL_PROMPT_VERSION } from './prompt';

/** User-facing copy for each rejection reason, with retake tips. */
const REJECTION_COPY: Record<TailRejectionReason, { message: string; tips: string[] }> = {
  no_cat_detected: {
    message: 'We couldn’t find a cat in this one.',
    tips: ['Make sure your cat is clearly in frame', 'Try better lighting', 'Get a little closer'],
  },
  tail_not_visible: {
    message: 'We couldn’t see the tail clearly enough to read it.',
    tips: [
      'Include the whole tail in the shot',
      'A side-on angle shows the tail best',
      'A short video captures tail movement',
    ],
  },
  image_quality: {
    message: 'This one was a little too blurry or dark to read.',
    tips: ['Hold steady or use a video', 'Add more light', 'Avoid strong backlight'],
  },
  multiple_cats: {
    message: 'We spotted more than one cat — we read one tail at a time.',
    tips: ['Frame a single cat', 'Crop to just one cat and try again'],
  },
};

function bucketConfidence(value: number): TailConfidence {
  if (value >= 0.8) return 'high';
  if (value >= 0.5) return 'medium';
  return 'low';
}

export const readTail: TailReadFn = async (input): Promise<TailResult> => {
  if (!input?.frames?.length) {
    return { status: 'error', kind: 'internal', message: 'No frames were provided.', retryable: false };
  }

  // Backstop the contract's frame cap even if the client sent more.
  const frames = input.frames.slice(0, MAX_TAIL_FRAMES);
  const id = Math.random().toString(36).slice(2, 8);
  const startedAt = Date.now();
  console.info(`[tail] ${id} start | ${input.source} | ${frames.length} frame(s)`);

  try {
    const outcome = await runTailRead({ ...input, frames });

    if (!outcome.ok) {
      console.error(`[tail] ${id} failed (${outcome.kind}): ${outcome.detail}`);
      const retryable = outcome.kind === 'timeout' || outcome.kind === 'rate_limit';
      const message =
        outcome.kind === 'rate_limit'
          ? 'We’re handling a lot of tails right now. Please wait a moment and try again.'
          : outcome.kind === 'timeout'
            ? 'That took too long to read. Please try again.'
            : outcome.kind === 'upstream_unavailable'
              ? 'The tail reader is temporarily unavailable. Please try again shortly.'
              : outcome.kind === 'bad_model_response'
                ? 'We couldn’t get a clear read on that one. Please try again.'
                : 'Something went wrong on our end. Please try again.';
      return { status: 'error', kind: outcome.kind, message, retryable };
    }

    if (outcome.value.status === 'rejected') {
      const copy = REJECTION_COPY[outcome.value.rejectionReason];
      console.info(`[tail] ${id} rejected: ${outcome.value.rejectionReason}`);
      return { status: 'rejected', reason: outcome.value.rejectionReason, ...copy };
    }

    const v = outcome.value;
    const meta = TAIL_STATE_META[v.state];
    console.info(
      `[tail] ${id} read in ${((Date.now() - startedAt) / 1000).toFixed(1)}s | ` +
        `${v.state} motion=${v.motion} conf=${v.confidence.toFixed(2)}`,
    );

    return {
      status: 'read',
      reading: {
        state: v.state,
        label: meta.label,
        mood: meta.mood,
        blurb: meta.blurb,
        motion: v.motion,
        cues: v.cues,
        interpretation: v.interpretation,
        confidence: bucketConfidence(v.confidence),
      },
      meta: {
        model: getTailModelName(),
        promptVersion: TAIL_PROMPT_VERSION,
        frames: frames.length,
        source: input.source,
      },
    };
  } catch (err) {
    console.error(`[tail] ${id} unexpected failure:`, err);
    return { status: 'error', kind: 'internal', message: 'Something went wrong on our end. Please try again.', retryable: false };
  }
};
