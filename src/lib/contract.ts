/**
 * PurrSight — FROZEN CONTRACT
 * ---------------------------------------------------------------------------
 * This is the single boundary between Person A (app/UI/delivery) and Person B
 * (assessment quality). It is written together in Phase 0 and then FROZEN.
 *
 * Any change after Phase 0 requires BOTH people to agree, because it breaks the
 * other person's build. If you touch this file, tell the other person the same
 * minute you push.
 *
 * A imports the OUTPUT types (AssessResult) to render. B imports the same types
 * to produce them. A calls assessImage() with AssessInput; B implements it.
 * A never opens lib/assess/. B never opens components/.
 */

/* ===========================================================================
 * Action units (the five FGS facial regions)
 * =========================================================================== */

export const ACTION_UNITS = ['ears', 'eyes', 'muzzle', 'whiskers', 'head'] as const;
export type ActionUnitId = (typeof ACTION_UNITS)[number];

/** Validated rescue-analgesia cut-off from Evangelista et al. 2019. Do not tune. */
export const ANALGESIA_THRESHOLD = 0.39;

/**
 * Our own product decision, NOT from the paper. Normalizing over one or two
 * action units produces a number too noisy to show a user, so we refuse
 * instead. Tune freely (owned by B).
 */
export const MIN_SCORABLE_AUS = 3;

/**
 * The model is not deterministic even at temperature 0, and its decision to
 * abstain fires only ~1 run in 3 (see docs/MODEL-ACCESS.md findings #1 and #3).
 * So assessImage samples the model N times and aggregates. The calls run in
 * parallel, so this costs tokens, not wall-clock.
 *
 * VOTE RESOLUTION — scoring.ts must follow these rules exactly. They are here,
 * not in scoring.ts, because `agreement` below is meaningless unless A and B
 * agree on how it was computed.
 *
 *  1. DISCARD FAILED RUNS. A run that threw, timed out, or failed schema
 *     validation does not vote. It is not evidence of anything.
 *  2. STATUS FIRST. Take the modal top-level status across the surviving runs.
 *     If 'rejected' wins, use the modal rejectionReason and stop. If 'assessed'
 *     wins, aggregate action units over ONLY the runs that returned
 *     'assessed' — never mix a rejected run's (absent) AUs into the vote.
 *     On a STATUS TIE (e.g. 1 assessed / 1 rejected after one run failed),
 *     REJECT, using the rejecting run's reason. Asserting a score off a single
 *     run is exactly what sampling exists to prevent, and refusing is a
 *     designed outcome here rather than a failure.
 *  3. PER-AU MODE. For each action unit, the winning score is the mode across
 *     the contributing runs. An AU is unscorable (null) when it came back null
 *     in AT LEAST HALF of them.
 *  4. TIES GO HIGH. `1, 2, null` has no mode. On any tie, take the HIGHER
 *     score and attach a 'low_agreement' caveat. Under-calling pain is the
 *     worse error for a screening tool that tells someone to see a vet.
 *  5. EVIDENCE IS NOT MERGED. Keep the `evidence` (and `notScorableReason`)
 *     string from the FIRST contributing run that voted the winning score.
 *     Never concatenate or summarise prose across runs — it reads like the
 *     model hedging and it is not what any single run actually observed.
 */
export const SAMPLES_PER_ASSESSMENT = 3;

/**
 * Below this many CONTRIBUTING runs there is no ensemble, just an expensive
 * single call — the exact failure mode SAMPLES_PER_ASSESSMENT exists to avoid.
 * If fewer than this survive, return a retryable { status: 'error' } rather
 * than a confident-looking assessment built on one sample.
 */
export const MIN_CONTRIBUTING_SAMPLES = 2;

/**
 * Band cut-offs on the normalized 0..1 score. PRODUCT decision, not from the
 * paper — tune freely (owned by B, lives here only so A and B agree on the
 * label set the UI must render). Derivation lives in scoring.ts.
 *   normalized <  POSSIBLE           -> 'minimal'
 *   POSSIBLE <= normalized <= LIKELY  -> 'possible'
 *   normalized >  LIKELY              -> 'likely'
 *
 * LIKELY is aligned to the analgesia threshold on purpose, and the comparison
 * is STRICTLY greater-than to match the paper (">0.39"), so that
 * `band === 'likely'` and `aboveThreshold` can never disagree. They are the
 * same predicate and scoring.ts must derive both from one comparison.
 */
export const BAND_CUTOFFS = {
  possible: 0.25,
  likely: ANALGESIA_THRESHOLD,
} as const;

export type Band = 'minimal' | 'possible' | 'likely';

/* ===========================================================================
 * Per-action-unit assessment
 * =========================================================================== */

export interface ActionUnitAssessment {
  id: ActionUnitId;
  label: string; // "Ear position"
  score: 0 | 1 | 2 | null; // null = not possible to score (FGS-legitimate)
  notScorableReason?: string; // required when score === null
  evidence: string; // what was observed, in plain language

  /**
   * How many of the contributing runs backed the winning score.
   *
   * THE DENOMINATOR IS `Assessment.meta.samples`, NOT SAMPLES_PER_ASSESSMENT.
   * Those differ whenever a run fails or is dropped by the status vote, so A
   * must render "{agreement} of {meta.samples} runs agreed" and never hardcode
   * 3. Range is 1..meta.samples.
   *
   * This REPLACED the model's own `confidence` field, deliberately. The model
   * returns a number that is byte-identical across repeated runs of the same
   * photo and tracks WHICH FEATURE IT IS rather than how visible that feature
   * is — it roughly recites the paper's published inter-rater reliability,
   * which is in its training data (docs/MODEL-ACCESS.md #2). Rendering it
   * would manufacture exactly the false precision this project claims to
   * avoid.
   *
   * `agreement` is ours: we computed it by actually running the model N times.
   * "3 of 3 runs agreed" is both honest and a better explainability story.
   */
  agreement: number;
}

export type RejectionReason =
  | 'no_cat_detected'
  | 'face_not_visible'
  | 'image_quality'
  | 'multiple_cats'
  | 'too_few_scorable_aus';

export interface Caveat {
  kind: 'brachycephalic' | 'dark_coat' | 'acute_pain_only' | 'low_agreement';
  message: string;
}

/**
 * What produced this assessment. Finding #6 in docs/MODEL-ACCESS.md: gpt-4.1
 * and gpt-4o score the same photo differently, so the model ID is part of the
 * measurement, not an implementation detail. Without this, an eval result
 * cannot be tied to what generated it and the demo cannot be reproduced.
 */
export interface AssessmentMeta {
  model: string; // e.g. "gpt-4.1"
  /**
   * Which prompt produced this assessment. The value NAMES ITS OWN SPEC:
   * `docs/PROMPT-V*.md`, where `*` is this string without the leading "v" —
   * so "v0.1" documents itself in `docs/PROMPT-V0.1.md`, "v1" in
   * `docs/PROMPT-V1.md`. Revising the prompt therefore requires NO change to
   * this file: bump the value B emits and add the matching doc alongside it.
   *
   * Deliberately NOT a pointer to "the latest prompt". It is a measurement
   * label: it must name the prompt that actually generated THIS result, so any
   * eval number can be traced back to the exact wording behind it. Two results
   * carrying different promptVersion values are not comparable.
   */
  promptVersion: string;
  /**
   * Number of runs that actually CONTRIBUTED to the action unit vote — i.e.
   * survived, and returned 'assessed' after the status vote. NOT the number of
   * calls attempted (that is SAMPLES_PER_ASSESSMENT). This is the denominator
   * for every `agreement` value in this assessment, and is >= MIN_CONTRIBUTING_SAMPLES.
   */
  samples: number;
}

/**
 * INVARIANT: only ever constructed when scorableCount >= MIN_SCORABLE_AUS.
 * scoring.ts must return a 'rejected' result with reason 'too_few_scorable_aus'
 * before building one of these. That guard is what keeps `normalizedScore`
 * from dividing by zero — the type cannot express it, so don't remove it.
 */
export interface Assessment {
  actionUnits: ActionUnitAssessment[];
  scorableCount: number;
  rawScore: number; // sum of scored AUs
  maxPossible: number; // 2 * scorableCount
  normalizedScore: number; // rawScore / maxPossible
  aboveThreshold: boolean; // normalizedScore > 0.39
  band: Band;
  caveats: Caveat[];
  recommendation: string;
  meta: AssessmentMeta;
}

/* ===========================================================================
 * The A <-> B seam
 * ---------------------------------------------------------------------------
 * ADDITION (gap #1): the INPUT half of the contract. The route handler (A)
 * decodes the uploaded file to base64 and passes it here; assessImage (B)
 * consumes exactly this. Passing a base64 string — not a File/Buffer/Blob —
 * keeps assessImage runtime-agnostic (works from the route AND from eval/run.ts
 * with a file read) and dodges Web/Node Buffer type friction.
 * =========================================================================== */

export interface AssessInput {
  /** Raw image bytes as a base64 string (NO data-URL prefix). */
  imageBase64: string;
  /** e.g. "image/jpeg" | "image/png". Route validates MIME before calling. */
  mimeType: string;
}

/* ===========================================================================
 * The result the whole app is organised around
 * ---------------------------------------------------------------------------
 * Three variants, and they mean three DIFFERENT things — do not collapse them:
 *   'assessed' -> the model looked and produced a score.
 *   'rejected' -> the model looked and DELIBERATELY declined (bad photo, not a
 *                 cat, too few scorable AUs). This is a *successful*, designed
 *                 outcome and gets its own polished UI (RejectionCard).
 *   'error'    -> ADDITION (gap #2): the pipeline FAILED (timeout, rate limit,
 *                 malformed model output after one retry, network). This is NOT
 *                 a rejection. A renders an error/retry boundary, not the
 *                 RejectionCard. B guarantees assessImage NEVER throws — every
 *                 failure comes back as this variant so A has one shape to
 *                 handle. The route maps 'error' to HTTP 502/503/504; 'assessed'
 *                 and 'rejected' are both HTTP 200.
 * =========================================================================== */

export type AssessErrorKind =
  | 'timeout'
  | 'rate_limit'
  | 'bad_model_response'
  | 'upstream_unavailable'
  | 'internal';

export type AssessResult =
  | { status: 'assessed'; assessment: Assessment }
  | {
      status: 'rejected';
      reason: RejectionReason;
      message: string;
      retakeTips: string[];
    }
  | {
      status: 'error';
      kind: AssessErrorKind;
      /** Safe to show a user. Never leak provider/internal detail here. */
      message: string;
      /** True when hitting the button again might just work (timeout/rate limit). */
      retryable: boolean;
    };

/** The exact shape of B's entry point. A depends only on this signature. */
export type AssessImageFn = (input: AssessInput) => Promise<AssessResult>;
