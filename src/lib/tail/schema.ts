/**
 * Tail pipeline — the model's output contract (strict schema + zod).
 * Mirrors the belt-and-braces approach in the FGS pipeline: a strict JSON
 * schema the provider grammar-enforces during decoding, plus a zod parse of
 * what actually came back so a provider change can't silently become a bug.
 */
import { z } from 'zod';
import { TAIL_MODEL_REJECTIONS, TAIL_MOTIONS, TAIL_STATES } from '../tail-contract';

/** Sent to the API as response_format.json_schema (strict: true). */
export const TAIL_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['status', 'rejectionReason', 'state', 'motion', 'cues', 'interpretation', 'confidence'],
  properties: {
    status: { type: 'string', enum: ['read', 'rejected'] },
    rejectionReason: {
      type: ['string', 'null'],
      enum: [...TAIL_MODEL_REJECTIONS, null],
    },
    state: {
      type: ['string', 'null'],
      enum: [...TAIL_STATES, null],
    },
    motion: {
      type: ['string', 'null'],
      enum: [...TAIL_MOTIONS, null],
    },
    cues: {
      type: ['array', 'null'],
      items: { type: 'string' },
    },
    interpretation: { type: ['string', 'null'] },
    // 0..1 genuine certainty; the pipeline buckets it into low/medium/high.
    confidence: { type: ['number', 'null'] },
  },
} as const;

const tailResponseSchema = z.object({
  status: z.enum(['read', 'rejected']),
  rejectionReason: z.enum(TAIL_MODEL_REJECTIONS).nullable(),
  state: z.enum(TAIL_STATES).nullable(),
  motion: z.enum(TAIL_MOTIONS).nullable(),
  cues: z.array(z.string()).nullable(),
  interpretation: z.string().nullable(),
  confidence: z.number().nullable(),
});

export type ValidatedTail =
  | {
      status: 'read';
      state: (typeof TAIL_STATES)[number];
      motion: (typeof TAIL_MOTIONS)[number];
      cues: string[];
      interpretation: string;
      confidence: number;
    }
  | { status: 'rejected'; rejectionReason: (typeof TAIL_MODEL_REJECTIONS)[number] };

export type TailParseOutcome =
  | { ok: true; value: ValidatedTail }
  | { ok: false; error: string };

/** Validate raw JSON. Semantic rules the JSON schema can't express live here. */
export function parseTailResponse(raw: unknown): TailParseOutcome {
  const structural = tailResponseSchema.safeParse(raw);
  if (!structural.success) {
    return { ok: false, error: `schema validation failed: ${structural.error.message}` };
  }

  const { status, rejectionReason, state, motion, cues, interpretation, confidence } =
    structural.data;

  if (status === 'rejected') {
    if (!rejectionReason) {
      return { ok: false, error: "status was 'rejected' but rejectionReason was null" };
    }
    return { ok: true, value: { status: 'rejected', rejectionReason } };
  }

  if (!state) return { ok: false, error: "status was 'read' but state was null" };
  if (!motion) return { ok: false, error: "status was 'read' but motion was null" };
  if (interpretation === null) {
    return { ok: false, error: "status was 'read' but interpretation was null" };
  }

  return {
    ok: true,
    value: {
      status: 'read',
      state,
      motion,
      cues: cues ?? [],
      interpretation,
      confidence: confidence ?? 0.5,
    },
  };
}
