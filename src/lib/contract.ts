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
 * Band cut-offs on the normalized 0..1 score. PRODUCT decision, not from the
 * paper — tune freely (owned by B, lives here only so A and B agree on the
 * label set the UI must render). Derivation lives in scoring.ts.
 *   normalized <  POSSIBLE            -> 'minimal'
 *   POSSIBLE  <= normalized < LIKELY  -> 'possible'
 *   normalized >= LIKELY              -> 'likely'
 * LIKELY is aligned to the analgesia threshold on purpose.
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
  confidence: number; // 0..1
}

export type RejectionReason =
  | 'no_cat_detected'
  | 'face_not_visible'
  | 'image_quality'
  | 'multiple_cats'
  | 'too_few_scorable_aus';

export interface Caveat {
  kind: 'brachycephalic' | 'dark_coat' | 'acute_pain_only' | 'low_confidence';
  message: string;
}

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
