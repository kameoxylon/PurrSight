/**
 * PurrSight — the model's output contract.
 * ---------------------------------------------------------------------------
 * Two representations of the same shape, and they must stay in lockstep:
 *
 *   FGS_JSON_SCHEMA  goes to the API as `response_format.json_schema` with
 *                    `strict: true`. This is grammar-enforced server-side
 *                    during decoding, so the model CANNOT emit an out-of-enum
 *                    value (docs/MODEL-ACCESS.md #4).
 *   modelResponseSchema  validates what actually came back. Belt and braces:
 *                    strict mode is enforced by the provider, and we do not
 *                    want a provider change to silently become a scoring bug.
 *
 * FGS_JSON_SCHEMA is byte-for-byte the schema in docs/PROMPT-V0.1.md, which is
 * itself unchanged from v0 — deliberately, so that any behaviour change on
 * re-run is attributable to prompt wording rather than a new decoding grammar.
 *
 * Three things here are load-bearing (each was arrived at by getting it wrong):
 *   1. `strict: true`, not `{"type":"json_object"}`. json_object guarantees
 *      valid JSON, not YOUR JSON — without strict the model returned a
 *      paragraph of prose inside the `rejectionReason` enum field.
 *   2. EVERY property must appear in `required`. Strict mode forbids optional
 *      properties; express "may be absent" as nullable instead.
 *   3. Mixed-type nullable enums are how abstention is expressed:
 *      {"type": ["integer","null"], "enum": [0,1,2,null]} — no separate flag.
 */
import { z } from 'zod';
import { ACTION_UNITS } from '../contract';

/**
 * The rejection reasons the MODEL can emit — a strict subset of the contract's
 * RejectionReason. `too_few_scorable_aus` is deliberately absent: that one is
 * OURS, derived in scoring.ts after the vote, because only we know how many
 * action units survived aggregation. The model never sees it.
 */
export const MODEL_REJECTION_REASONS = [
  'no_cat_detected',
  'face_not_visible',
  'image_quality',
  'multiple_cats',
] as const;

export type ModelRejectionReason = (typeof MODEL_REJECTION_REASONS)[number];

/** Sent to the API. Do not edit without bumping the prompt version. */
export const FGS_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['status', 'rejectionReason', 'actionUnits'],
  properties: {
    status: { type: 'string', enum: ['assessed', 'rejected'] },
    rejectionReason: {
      type: ['string', 'null'],
      enum: [...MODEL_REJECTION_REASONS, null],
    },
    actionUnits: {
      type: ['array', 'null'],
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'score', 'notScorableReason', 'evidence', 'confidence'],
        properties: {
          id: { type: 'string', enum: [...ACTION_UNITS] },
          score: { type: ['integer', 'null'], enum: [0, 1, 2, null] },
          notScorableReason: { type: ['string', 'null'] },
          evidence: { type: 'string' },
          confidence: { type: 'number' },
        },
      },
    },
  },
} as const;

/** One action unit as the model reports it. */
export const modelActionUnitSchema = z.object({
  id: z.enum(ACTION_UNITS),
  score: z.union([z.literal(0), z.literal(1), z.literal(2), z.null()]),
  notScorableReason: z.string().nullable(),
  evidence: z.string(),
  /**
   * Parsed but NEVER rendered and NEVER scored. The value is a fixed
   * per-feature prior, not a per-photo judgement: it is byte-identical across
   * repeated runs of the same image and roughly recites the FGS's published
   * inter-rater reliability, which is in the model's training data
   * (docs/MODEL-ACCESS.md #2). `ActionUnitAssessment.agreement` — which we
   * compute by actually running the model N times — is the honest replacement.
   * Kept as a canary in case a future model genuinely calibrates it.
   */
  confidence: z.number(),
});

/** Structural validation only; cross-field rules live in parseModelResponse. */
export const modelResponseSchema = z.object({
  status: z.enum(['assessed', 'rejected']),
  rejectionReason: z.enum(MODEL_REJECTION_REASONS).nullable(),
  actionUnits: z.array(modelActionUnitSchema).nullable(),
});

export type ModelActionUnit = z.infer<typeof modelActionUnitSchema>;
export type ModelResponse = z.infer<typeof modelResponseSchema>;

/**
 * A response that passed BOTH structural and semantic validation. The two
 * variants are separated at the type level so scoring.ts cannot accidentally
 * read `actionUnits` off a rejection.
 */
export type ValidatedResponse =
  | { status: 'assessed'; actionUnits: ModelActionUnit[] }
  | { status: 'rejected'; rejectionReason: ModelRejectionReason };

export type ParseOutcome =
  | { ok: true; value: ValidatedResponse }
  | { ok: false; error: string };

/**
 * Validate raw JSON from the model.
 *
 * Semantic rules the JSON Schema cannot express (it has no conditional
 * subschemas under strict mode, and enums cannot be correlated across fields):
 *   - 'assessed'  => actionUnits present, exactly the five AUs, no duplicates
 *   - 'rejected'  => rejectionReason present
 * A failure here is a `bad_model_response`, which the client retries ONCE
 * before giving up (contract.ts AssessErrorKind).
 */
export function parseModelResponse(raw: unknown): ParseOutcome {
  const structural = modelResponseSchema.safeParse(raw);
  if (!structural.success) {
    return { ok: false, error: `schema validation failed: ${structural.error.message}` };
  }

  const { status, rejectionReason, actionUnits } = structural.data;

  if (status === 'rejected') {
    if (!rejectionReason) {
      return { ok: false, error: "status was 'rejected' but rejectionReason was null" };
    }
    return { ok: true, value: { status: 'rejected', rejectionReason } };
  }

  if (!actionUnits) {
    return { ok: false, error: "status was 'assessed' but actionUnits was null" };
  }

  const seen = new Set(actionUnits.map((au) => au.id));
  if (seen.size !== actionUnits.length) {
    return { ok: false, error: 'actionUnits contained duplicate ids' };
  }
  const missing = ACTION_UNITS.filter((id) => !seen.has(id));
  if (missing.length > 0) {
    return { ok: false, error: `actionUnits missing: ${missing.join(', ')}` };
  }

  return { ok: true, value: { status: 'assessed', actionUnits } };
}
