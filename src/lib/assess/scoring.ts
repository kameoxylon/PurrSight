/**
 * PurrSight — vote aggregation and scoring. PURE FUNCTIONS, NO NETWORK.
 * ---------------------------------------------------------------------------
 * This file implements the five VOTE RESOLUTION rules written down in
 * contract.ts. Read them there first; they are the contract, this is only the
 * implementation. `agreement` is meaningless unless A and B compute it the
 * same way, which is why the rules live in the shared file.
 *
 * PLAN.md calls this "the one place a silent bug produces a confidently wrong
 * medical-ish number". It is pure arithmetic over parsed model output, so it
 * is exhaustively unit-testable with zero API calls. See scoring.test.ts.
 */
import {
  ACTION_UNITS,
  BAND_CUTOFFS,
  MIN_CONTRIBUTING_SAMPLES,
  MIN_SCORABLE_AUS,
  type ActionUnitAssessment,
  type ActionUnitId,
  type AssessResult,
  type AssessmentMeta,
  type Band,
  type Caveat,
  type RejectionReason,
} from '../contract';
import type { ModelActionUnit, ModelRejectionReason, ValidatedResponse } from './schema';

/**
 * Human labels for the five action units. These match src/lib/fixtures.ts
 * exactly — A styled the UI against those strings, so changing one here
 * silently changes the interface.
 */
export const AU_LABELS: Record<ActionUnitId, string> = {
  ears: 'Ear position',
  eyes: 'Orbital tightening',
  muzzle: 'Muzzle tension',
  whiskers: 'Whisker position',
  head: 'Head position',
};

const FALLBACK_NOT_SCORABLE = 'This feature was not clearly visible in the photo.';

/* ===========================================================================
 * Per-action-unit vote
 * =========================================================================== */

interface AuVote {
  assessment: ActionUnitAssessment;
  /** True when the winning score was reached by RULE 4 (tie broken upward). */
  wasTie: boolean;
}

/**
 * RULES 3, 4 and 5 for a single action unit.
 *
 * PRECEDENCE MATTERS AND IS NOT COMMUTATIVE: the null gate (rule 3) is
 * evaluated BEFORE the tie-break (rule 4). Both can be live on the same unit,
 * and swapping them changes the answer:
 *
 *   [1, 2, null]     -> 1 null of 3 is NOT at least half, so the unit scores.
 *                       1 and 2 tie, ties go high => 2, agreement 1.
 *   [null, null, 1]  -> 2 nulls of 3 IS at least half => null wins outright.
 *                       The lone 1 never reaches the tie-break.
 */
function voteActionUnit(id: ActionUnitId, runs: ModelActionUnit[][]): AuVote {
  const n = runs.length;
  const votes = runs.map((run) => run.find((au) => au.id === id)!);

  // --- RULE 3, null gate: unscorable when null in AT LEAST HALF the runs.
  // Integer form of `nullCount >= n / 2` to keep it exact.
  const nullVotes = votes.filter((v) => v.score === null);
  if (nullVotes.length * 2 >= n) {
    const first = nullVotes[0]; // RULE 5: first contributing run that voted the winner
    return {
      wasTie: false,
      assessment: {
        id,
        label: AU_LABELS[id],
        score: null,
        notScorableReason: first.notScorableReason ?? FALLBACK_NOT_SCORABLE,
        evidence: first.evidence,
        agreement: nullVotes.length,
      },
    };
  }

  // --- RULE 3, mode: most common score among the runs that did score it.
  const counts = new Map<0 | 1 | 2, number>();
  for (const v of votes) {
    if (v.score !== null) counts.set(v.score, (counts.get(v.score) ?? 0) + 1);
  }

  const topCount = Math.max(...counts.values());
  const tiedScores = [...counts.entries()]
    .filter(([, count]) => count === topCount)
    .map(([score]) => score);

  // --- RULE 4: TIES GO HIGH. Under-calling pain is the worse error for a
  // screening tool whose output is "consider seeing a vet".
  const wasTie = tiedScores.length > 1;
  const winning = Math.max(...tiedScores) as 0 | 1 | 2;

  // --- RULE 5: evidence is never merged across runs. Take the prose from the
  // first run that actually voted the winning score.
  const first = votes.find((v) => v.score === winning)!;

  return {
    wasTie,
    assessment: {
      id,
      label: AU_LABELS[id],
      score: winning,
      evidence: first.evidence,
      agreement: topCount,
    },
  };
}

/* ===========================================================================
 * Scoring arithmetic
 * =========================================================================== */

export interface ScoreBreakdown {
  scorableCount: number;
  rawScore: number;
  maxPossible: number;
  normalizedScore: number;
  aboveThreshold: boolean;
  band: Band;
}

/**
 * normalized = sum(scored) / (2 x count(scored)), per Evangelista et al. 2019.
 * Action units that came back null are excluded from BOTH numerator and
 * denominator — that is what makes abstention legitimate rather than a
 * silent zero.
 *
 * CALLER MUST GUARD scorableCount >= MIN_SCORABLE_AUS first (contract.ts
 * invariant on `Assessment`). This function would divide by zero on an
 * all-null input, which is exactly why the guard is not expressible in the
 * type and must not be removed from aggregate().
 */
export function computeScore(units: ActionUnitAssessment[]): ScoreBreakdown {
  const scored = units.filter((u) => u.score !== null);
  const scorableCount = scored.length;
  const rawScore = scored.reduce((sum, u) => sum + (u.score as number), 0);
  const maxPossible = 2 * scorableCount;
  const normalizedScore = rawScore / maxPossible;

  // ONE comparison drives both, so `band === 'likely'` and `aboveThreshold`
  // can never disagree. Strictly greater-than matches the paper's ">0.39".
  const aboveThreshold = normalizedScore > BAND_CUTOFFS.likely;
  const band: Band = aboveThreshold
    ? 'likely'
    : normalizedScore < BAND_CUTOFFS.possible
      ? 'minimal'
      : 'possible';

  return { scorableCount, rawScore, maxPossible, normalizedScore, aboveThreshold, band };
}

/* ===========================================================================
 * Presentation strings
 * =========================================================================== */

const RECOMMENDATIONS: Record<Band, string> = {
  minimal:
    'No obvious signs of acute discomfort in this photo. Keep monitoring, and see a vet if behaviour changes.',
  possible:
    'Some mild facial indicators are present, but not enough to clearly suggest pain. Watch your cat closely and contact a vet if anything changes or you are worried.',
  likely:
    'Several facial indicators associated with pain are present. Contact a veterinarian promptly to have your cat evaluated.',
};

const REJECTION_COPY: Record<RejectionReason, { message: string; retakeTips: string[] }> = {
  no_cat_detected: {
    message: "We couldn't find a cat in that photo.",
    retakeTips: [
      'Make sure the photo is of a cat, taken close enough to fill the frame.',
      'Avoid heavy filters, drawings, or screenshots.',
    ],
  },
  face_not_visible: {
    message: "We couldn't get a clear enough view of your cat's face to assess it.",
    retakeTips: [
      'Take the photo from the front, roughly at eye level.',
      'Make sure the ears, eyes and muzzle are all visible.',
      'Use good lighting and hold the camera steady to avoid blur.',
    ],
  },
  image_quality: {
    message: 'That photo was too blurry or too dark to assess reliably.',
    retakeTips: [
      'Move somewhere brighter, or turn on a light.',
      'Hold still until the camera focuses before taking the shot.',
      'Get a little closer so the face fills more of the frame.',
    ],
  },
  multiple_cats: {
    message: 'We found more than one cat in that photo.',
    retakeTips: [
      'Photograph one cat at a time.',
      'Crop the photo so only the cat you want assessed is in frame.',
    ],
  },
  too_few_scorable_aus: {
    message:
      "We could only make out part of your cat's face, which isn't enough for a reliable score.",
    retakeTips: [
      'Take the photo straight on, so both ears, both eyes, the muzzle and the whiskers are visible.',
      'Include the shoulders in the frame — head position is scored relative to them.',
      'Make sure the whiskers stand out against the background rather than blending into it.',
    ],
  },
};

function reject(reason: RejectionReason): AssessResult {
  return { status: 'rejected', reason, ...REJECTION_COPY[reason] };
}

/* ===========================================================================
 * Aggregation — the entry point scoring-wise
 * =========================================================================== */

/** Modal value; on a tie the FIRST-seen candidate wins (caller decides order). */
function modal<T>(values: T[]): T {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = values[0];
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Turn N independently-sampled model responses into one AssessResult.
 *
 * RULE 1 (discard failed runs) is the CALLER's job: only responses that
 * survived parsing appear in `runs`. A run that threw, timed out, or failed
 * validation is not evidence of anything and must never reach this function.
 *
 * Three distinct exits, and they mean different things:
 *   - fewer than MIN_CONTRIBUTING_SAMPLES survivors  -> retryable 'error'
 *     (no ensemble, just an expensive single call)
 *   - status vote says rejected, or ties             -> 'rejected'
 *   - scorableCount < MIN_SCORABLE_AUS               -> 'rejected'
 */
export function aggregate(
  runs: ValidatedResponse[],
  meta: Omit<AssessmentMeta, 'samples'>,
): AssessResult {
  if (runs.length < MIN_CONTRIBUTING_SAMPLES) {
    return {
      status: 'error',
      kind: 'bad_model_response',
      message: 'We could not get a reliable reading on that photo. Please try again.',
      retryable: true,
    };
  }

  // --- RULE 2: STATUS FIRST.
  const assessedRuns = runs.filter((r) => r.status === 'assessed');
  const rejectedRuns = runs.filter((r) => r.status === 'rejected');

  // A STATUS TIE REJECTS. Asserting a score off a single run is exactly what
  // sampling exists to prevent, so refusing here is a designed outcome rather
  // than a failure.
  if (rejectedRuns.length >= assessedRuns.length) {
    const reasons = rejectedRuns.map((r) => r.rejectionReason);
    return reject(modal<ModelRejectionReason>(reasons));
  }

  // Defensive: with >= 2 survivors a strict 'assessed' win always leaves >= 2
  // contributors, but the invariant is load-bearing enough to assert.
  if (assessedRuns.length < MIN_CONTRIBUTING_SAMPLES) {
    return {
      status: 'error',
      kind: 'bad_model_response',
      message: 'We could not get a reliable reading on that photo. Please try again.',
      retryable: true,
    };
  }

  const auRuns = assessedRuns.map((r) => r.actionUnits);
  const votes = ACTION_UNITS.map((id) => voteActionUnit(id, auRuns));
  const actionUnits = votes.map((v) => v.assessment);

  // Our own product guard, NOT from the paper: normalizing over one or two
  // action units produces a number too noisy to show a user, so we refuse.
  const scorableCount = actionUnits.filter((u) => u.score !== null).length;
  if (scorableCount < MIN_SCORABLE_AUS) {
    return reject('too_few_scorable_aus');
  }

  const breakdown = computeScore(actionUnits);

  return {
    status: 'assessed',
    assessment: {
      actionUnits,
      ...breakdown,
      caveats: buildCaveats(votes),
      recommendation: RECOMMENDATIONS[breakdown.band],
      // meta.samples is CONTRIBUTING runs, not attempted. It is the
      // denominator for every `agreement` above, so it must not be
      // SAMPLES_PER_ASSESSMENT.
      meta: { ...meta, samples: assessedRuns.length },
    },
  };
}

/**
 * RULE 4's other half: a tie-broken unit gets a 'low_agreement' caveat.
 *
 * `acute_pain_only` is unconditional — the scale is validated for acute pain,
 * so a low score never rules out chronic pain or illness and the UI must
 * always say so.
 *
 * The `brachycephalic` and `dark_coat` kinds declared in contract.ts stay
 * unpopulated for now: nothing in the current schema reports the cat's breed
 * or coat. PROMPT-V0.1.md proposes an `imageContext` extension for them, but
 * it is unverified and testing it alongside the v0.1 changes would confound
 * the two. Phase 2.
 */
function buildCaveats(votes: AuVote[]): Caveat[] {
  const caveats: Caveat[] = [];

  const tied = votes.filter((v) => v.wasTie).map((v) => v.assessment.label.toLowerCase());
  if (tied.length > 0) {
    const list =
      tied.length === 1
        ? tied[0]
        : `${tied.slice(0, -1).join(', ')} and ${tied[tied.length - 1]}`;
    caveats.push({
      kind: 'low_agreement',
      message: `Repeated readings disagreed about ${list}. We used the higher score, because under-calling pain is the riskier mistake — treat ${tied.length === 1 ? 'that feature' : 'those features'} as uncertain.`,
    });
  }

  caveats.push({
    kind: 'acute_pain_only',
    message:
      'The Feline Grimace Scale was validated for acute (short-term) pain. A low score does not rule out chronic pain or illness.',
  });

  return caveats;
}
