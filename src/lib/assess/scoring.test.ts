/**
 * Tests for the vote rules and scoring arithmetic.
 *
 * PLAN.md: "This is the one place a silent bug produces a confidently wrong
 * medical-ish number. It is pure arithmetic and trivially testable. Test it."
 *
 * Every test here runs offline. Nothing in this file touches the network.
 */
import { describe, expect, it } from 'vitest';
import {
  ACTION_UNITS,
  ANALGESIA_THRESHOLD,
  MIN_CONTRIBUTING_SAMPLES,
  MIN_SCORABLE_AUS,
  SAMPLES_PER_ASSESSMENT,
  type ActionUnitAssessment,
  type ActionUnitId,
} from '../contract';
import type { ModelActionUnit, ValidatedResponse } from './schema';
import { AU_LABELS, aggregate, computeScore } from './scoring';

/* --- helpers -------------------------------------------------------------- */

const meta = { model: 'gpt-4.1', promptVersion: 'v0.1' };

/** One model run. `scores` maps AU id -> score; `evidence` tags the source run. */
function run(
  scores: Partial<Record<ActionUnitId, 0 | 1 | 2 | null>>,
  evidenceTag = 'r',
): ValidatedResponse {
  // `??` would collapse an explicit null into 0, so key out on presence.
  const actionUnits: ModelActionUnit[] = ACTION_UNITS.map((id) => {
    const score = id in scores ? (scores[id] as 0 | 1 | 2 | null) : 0;
    return {
      id,
      score,
      notScorableReason: score === null ? `${evidenceTag}:${id} not visible` : null,
      evidence: `${evidenceTag}:${id}`,
      confidence: 0.8,
    };
  });
  return { status: 'assessed', actionUnits };
}

function rejectedRun(
  rejectionReason: Extract<ValidatedResponse, { status: 'rejected' }>['rejectionReason'],
): ValidatedResponse {
  return { status: 'rejected', rejectionReason };
}

/** All five AUs scored the same. */
function uniform(score: 0 | 1 | 2 | null): ValidatedResponse {
  return run(Object.fromEntries(ACTION_UNITS.map((id) => [id, score])));
}

function au(id: ActionUnitId, score: 0 | 1 | 2 | null): ActionUnitAssessment {
  return { id, label: AU_LABELS[id], score, evidence: '', agreement: 3 };
}

function assessed(result: ReturnType<typeof aggregate>) {
  if (result.status !== 'assessed') {
    throw new Error(`expected 'assessed', got '${result.status}'`);
  }
  return result.assessment;
}

function unit(result: ReturnType<typeof aggregate>, id: ActionUnitId) {
  return assessed(result).actionUnits.find((u) => u.id === id)!;
}

/* --- computeScore --------------------------------------------------------- */

describe('computeScore', () => {
  it('all zeros scores 0 and lands in the minimal band', () => {
    const r = computeScore(ACTION_UNITS.map((id) => au(id, 0)));
    expect(r).toMatchObject({
      scorableCount: 5,
      rawScore: 0,
      maxPossible: 10,
      normalizedScore: 0,
      aboveThreshold: false,
      band: 'minimal',
    });
  });

  it('all twos scores 1.0 and is above the threshold', () => {
    const r = computeScore(ACTION_UNITS.map((id) => au(id, 2)));
    expect(r).toMatchObject({
      rawScore: 10,
      maxPossible: 10,
      normalizedScore: 1,
      aboveThreshold: true,
      band: 'likely',
    });
  });

  it('excludes a null AU from BOTH numerator and denominator', () => {
    // This is what makes abstention legitimate rather than a silent zero.
    const r = computeScore([
      au('ears', 1),
      au('eyes', 1),
      au('muzzle', 1),
      au('whiskers', null),
      au('head', 1),
    ]);
    expect(r.scorableCount).toBe(4);
    expect(r.maxPossible).toBe(8);
    expect(r.rawScore).toBe(4);
    expect(r.normalizedScore).toBe(0.5);
  });

  it('a nulled AU LOWERS the ratio near the threshold (research finding F1)', () => {
    // The exact pair from docs/PROMPT-V0.1.md: nulling an uncertain AU drops
    // it from the denominator, so the same cat crosses the analgesia
    // threshold in one case and not the other.
    const nulled = computeScore([
      au('ears', 1),
      au('eyes', 1),
      au('muzzle', 1),
      au('whiskers', null),
      au('head', 0),
    ]);
    const scoredAsOne = computeScore([
      au('ears', 1),
      au('eyes', 1),
      au('muzzle', 1),
      au('whiskers', 1),
      au('head', 0),
    ]);

    expect(nulled.normalizedScore).toBeCloseTo(0.375, 10);
    expect(nulled.aboveThreshold).toBe(false);
    expect(nulled.band).toBe('possible');

    expect(scoredAsOne.normalizedScore).toBeCloseTo(0.4, 10);
    expect(scoredAsOne.aboveThreshold).toBe(true);
    expect(scoredAsOne.band).toBe('likely');
  });

  it('uses STRICTLY greater-than, so exactly the threshold is not above it', () => {
    const at = computeScore([
      { ...au('ears', 0), score: ANALGESIA_THRESHOLD * 2 } as ActionUnitAssessment,
    ]);
    // 0.78 / 2 = 0.39 exactly -> must NOT be above threshold.
    expect(at.normalizedScore).toBeCloseTo(ANALGESIA_THRESHOLD, 10);
    expect(at.aboveThreshold).toBe(false);
  });

  it('band and aboveThreshold are the same predicate and never disagree', () => {
    for (let raw = 0; raw <= 10; raw++) {
      const units = ACTION_UNITS.map((id, i) => au(id, (Math.min(2, Math.max(0, raw - i * 2)) as 0 | 1 | 2)));
      const r = computeScore(units);
      expect(r.band === 'likely').toBe(r.aboveThreshold);
    }
  });
});

/* --- RULE 3: null gate ---------------------------------------------------- */

describe('rule 3 — an AU is unscorable when null in at least half the runs', () => {
  it('2 nulls out of 3 wins outright', () => {
    const result = aggregate(
      [run({ whiskers: null }, 'a'), run({ whiskers: null }, 'b'), run({ whiskers: 1 }, 'c')],
      meta,
    );
    const whiskers = unit(result, 'whiskers');
    expect(whiskers.score).toBeNull();
    expect(whiskers.agreement).toBe(2);
    expect(whiskers.notScorableReason).toBe('a:whiskers not visible');
  });

  it('1 null out of 3 does NOT abstain — the unit still scores', () => {
    const result = aggregate(
      [run({ whiskers: null }, 'a'), run({ whiskers: 1 }, 'b'), run({ whiskers: 1 }, 'c')],
      meta,
    );
    expect(unit(result, 'whiskers').score).toBe(1);
  });

  it('1 null out of 2 IS at least half, so it abstains', () => {
    const result = aggregate([run({ muzzle: null }, 'a'), run({ muzzle: 2 }, 'b')], meta);
    expect(unit(result, 'muzzle').score).toBeNull();
    expect(unit(result, 'muzzle').agreement).toBe(1);
  });

  it('supplies a fallback reason when the model nulls without explaining', () => {
    const bare: ValidatedResponse = {
      status: 'assessed',
      actionUnits: ACTION_UNITS.map((id) => ({
        id,
        score: id === 'whiskers' ? null : 0,
        notScorableReason: null, // model abstained but gave no reason
        evidence: 'e',
        confidence: 0.5,
      })),
    };
    const result = aggregate([bare, bare], meta);
    expect(unit(result, 'whiskers').notScorableReason).toBeTruthy();
  });
});

/* --- RULE 4: ties go high ------------------------------------------------- */

describe('rule 4 — ties go high', () => {
  it('breaks a 1-vs-2 tie upward and flags low agreement', () => {
    const result = aggregate([run({ ears: 1 }, 'a'), run({ ears: 2 }, 'b')], meta);
    expect(unit(result, 'ears').score).toBe(2);
    expect(unit(result, 'ears').agreement).toBe(1);
    expect(assessed(result).caveats.some((c) => c.kind === 'low_agreement')).toBe(true);
  });

  it('breaks a 0-vs-1 tie upward', () => {
    const result = aggregate([run({ eyes: 0 }, 'a'), run({ eyes: 1 }, 'b')], meta);
    expect(unit(result, 'eyes').score).toBe(1);
  });

  it('does not flag low agreement when every run agrees', () => {
    const result = aggregate([uniform(0), uniform(0), uniform(0)], meta);
    expect(assessed(result).caveats.some((c) => c.kind === 'low_agreement')).toBe(false);
  });

  it('RULE 3 GATES RULE 4: [1, 2, null] scores 2, [null, null, 1] abstains', () => {
    // The precedence trap. Both rules are live on these inputs; swapping the
    // order changes the answer, so pin both directions.
    const scores = aggregate(
      [run({ head: 1 }, 'a'), run({ head: 2 }, 'b'), run({ head: null }, 'c')],
      meta,
    );
    expect(unit(scores, 'head').score).toBe(2); // null gate not met -> tie -> high

    const abstains = aggregate(
      [run({ head: null }, 'a'), run({ head: null }, 'b'), run({ head: 1 }, 'c')],
      meta,
    );
    expect(unit(abstains, 'head').score).toBeNull(); // null gate met -> never reaches tie-break
  });
});

/* --- RULE 5: evidence is not merged --------------------------------------- */

describe('rule 5 — evidence comes from the first run that voted the winner', () => {
  it('takes prose from the winning run, not the first run overall', () => {
    // Run 'a' voted 0; runs 'b' and 'c' voted 2 and win the mode. Evidence
    // must come from 'b' — the FIRST run backing the WINNING score.
    const result = aggregate(
      [run({ ears: 0 }, 'a'), run({ ears: 2 }, 'b'), run({ ears: 2 }, 'c')],
      meta,
    );
    expect(unit(result, 'ears').score).toBe(2);
    expect(unit(result, 'ears').evidence).toBe('b:ears');
  });

  it('never concatenates prose across runs', () => {
    const result = aggregate([run({ eyes: 1 }, 'a'), run({ eyes: 1 }, 'b')], meta);
    expect(unit(result, 'eyes').evidence).toBe('a:eyes');
    expect(unit(result, 'eyes').evidence).not.toContain('b:');
  });
});

/* --- RULE 2: status vote -------------------------------------------------- */

describe('rule 2 — status is voted before action units', () => {
  it('rejects when rejections outnumber assessments', () => {
    const result = aggregate(
      [rejectedRun('no_cat_detected'), rejectedRun('no_cat_detected'), uniform(0)],
      meta,
    );
    expect(result.status).toBe('rejected');
    if (result.status === 'rejected') expect(result.reason).toBe('no_cat_detected');
  });

  it('A STATUS TIE REJECTS rather than scoring off one run', () => {
    const result = aggregate([uniform(0), rejectedRun('face_not_visible')], meta);
    expect(result.status).toBe('rejected');
    if (result.status === 'rejected') expect(result.reason).toBe('face_not_visible');
  });

  it('never mixes a rejected run into the action unit vote', () => {
    // Two assessed runs say ears=2; one rejection must not dilute that.
    const result = aggregate(
      [run({ ears: 2 }, 'a'), run({ ears: 2 }, 'b'), rejectedRun('image_quality')],
      meta,
    );
    expect(unit(result, 'ears').score).toBe(2);
    expect(assessed(result).meta.samples).toBe(2);
    expect(unit(result, 'ears').agreement).toBe(2);
  });

  it('uses the modal rejection reason', () => {
    const result = aggregate(
      [rejectedRun('multiple_cats'), rejectedRun('multiple_cats'), rejectedRun('image_quality')],
      meta,
    );
    if (result.status === 'rejected') expect(result.reason).toBe('multiple_cats');
  });

  it('every rejection carries a message and retake tips', () => {
    const result = aggregate([rejectedRun('image_quality'), rejectedRun('image_quality')], meta);
    if (result.status !== 'rejected') throw new Error('expected rejection');
    expect(result.message.length).toBeGreaterThan(0);
    expect(result.retakeTips.length).toBeGreaterThan(0);
  });
});

/* --- MIN_CONTRIBUTING_SAMPLES --------------------------------------------- */

describe('too few contributing runs', () => {
  it('returns a retryable error rather than scoring off a single run', () => {
    const result = aggregate([uniform(0)], meta);
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.retryable).toBe(true);
      expect(result.kind).toBe('bad_model_response');
    }
  });

  it('returns a retryable error when every run failed', () => {
    const result = aggregate([], meta);
    expect(result.status).toBe('error');
  });

  it('accepts exactly MIN_CONTRIBUTING_SAMPLES', () => {
    const runs = Array.from({ length: MIN_CONTRIBUTING_SAMPLES }, () => uniform(0));
    expect(aggregate(runs, meta).status).toBe('assessed');
  });
});

/* --- MIN_SCORABLE_AUS ----------------------------------------------------- */

describe('too few scorable action units', () => {
  it('refuses to report a score when 3 of 5 AUs abstain', () => {
    const r = run({ ears: null, eyes: null, muzzle: null, whiskers: 1, head: 1 });
    const result = aggregate([r, r, r], meta);
    expect(result.status).toBe('rejected');
    if (result.status === 'rejected') expect(result.reason).toBe('too_few_scorable_aus');
  });

  it('still scores at exactly MIN_SCORABLE_AUS', () => {
    const r = run({ ears: null, eyes: null, muzzle: 1, whiskers: 1, head: 1 });
    const result = aggregate([r, r, r], meta);
    expect(result.status).toBe('assessed');
    expect(assessed(result).scorableCount).toBe(MIN_SCORABLE_AUS);
  });

  it('never divides by zero when everything abstains', () => {
    const r = uniform(null);
    const result = aggregate([r, r, r], meta);
    expect(result.status).toBe('rejected');
    if (result.status === 'rejected') expect(result.reason).toBe('too_few_scorable_aus');
  });
});

/* --- meta and agreement --------------------------------------------------- */

describe('meta and agreement bookkeeping', () => {
  it('meta.samples counts CONTRIBUTING runs, not attempted calls', () => {
    const result = aggregate([uniform(0), uniform(0), rejectedRun('image_quality')], meta);
    // Three calls were made and SAMPLES_PER_ASSESSMENT is 3, but only two
    // runs contributed to the AU vote.
    expect(SAMPLES_PER_ASSESSMENT).toBe(3);
    expect(assessed(result).meta.samples).toBe(2);
  });

  it('agreement never exceeds meta.samples', () => {
    const result = aggregate(
      [run({ ears: 1 }, 'a'), run({ ears: 2 }, 'b'), run({ ears: 2 }, 'c')],
      meta,
    );
    const a = assessed(result);
    for (const u of a.actionUnits) {
      expect(u.agreement).toBeGreaterThanOrEqual(1);
      expect(u.agreement).toBeLessThanOrEqual(a.meta.samples);
    }
  });

  it('carries model and promptVersion through untouched', () => {
    const result = aggregate([uniform(0), uniform(0)], meta);
    expect(assessed(result).meta).toMatchObject(meta);
  });

  it('labels every action unit and returns all five in contract order', () => {
    const a = assessed(aggregate([uniform(0), uniform(0)], meta));
    expect(a.actionUnits.map((u) => u.id)).toEqual([...ACTION_UNITS]);
    for (const u of a.actionUnits) expect(u.label).toBe(AU_LABELS[u.id]);
  });

  it('always attaches the acute-pain-only caveat', () => {
    const a = assessed(aggregate([uniform(0), uniform(0)], meta));
    expect(a.caveats.some((c) => c.kind === 'acute_pain_only')).toBe(true);
  });

  it('produces a recommendation for every band', () => {
    const minimal = assessed(aggregate([uniform(0), uniform(0)], meta));
    const likely = assessed(aggregate([uniform(2), uniform(2)], meta));
    expect(minimal.recommendation).toBeTruthy();
    expect(likely.recommendation).toBeTruthy();
    expect(minimal.recommendation).not.toBe(likely.recommendation);
  });
});
