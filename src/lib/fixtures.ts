/**
 * PurrSight — FIXTURES
 * ---------------------------------------------------------------------------
 * Hardcoded AssessResult values. B "owns" this file and writes it FIRST in
 * Phase 0; A consumes it immediately so the entire UI can be built and styled
 * against real-shaped data long before the model works.
 *
 * These are also the safety net for the live demo (Person A caches these +
 * their photos in public/demo/). Keep them realistic.
 *
 * NOTE: fixtures are illustrative data, not medical output. The evidence text
 * is written to look like what the model should produce.
 */
import type { AssessResult, ActionUnitAssessment } from './contract';

const au = (
  id: ActionUnitAssessment['id'],
  label: string,
  score: 0 | 1 | 2 | null,
  evidence: string,
  confidence: number,
  notScorableReason?: string,
): ActionUnitAssessment => ({ id, label, score, evidence, confidence, notScorableReason });

/** 1. Comfortable, relaxed cat — scores near zero. */
export const fixtureHealthy: AssessResult = {
  status: 'assessed',
  assessment: {
    actionUnits: [
      au('ears', 'Ear position', 0, 'Ears upright and facing forward, no flattening or rotation.', 0.9),
      au('eyes', 'Orbital tightening', 0, 'Eyes open and round with no squinting or tightening around the orbit.', 0.88),
      au('muzzle', 'Muzzle tension', 0, 'Muzzle appears relaxed and rounded, no tension lines.', 0.6),
      au('whiskers', 'Whisker position', 0, 'Whiskers loose and gently curved in a natural resting position.', 0.55),
      au('head', 'Head position', 0, 'Head held level and above the shoulder line.', 0.9),
    ],
    scorableCount: 5,
    rawScore: 0,
    maxPossible: 10,
    normalizedScore: 0,
    aboveThreshold: false,
    band: 'minimal',
    caveats: [
      { kind: 'acute_pain_only', message: 'The Feline Grimace Scale was validated for acute pain. A low score does not rule out chronic pain or illness.' },
    ],
    recommendation: 'No obvious signs of acute discomfort in this photo. Keep monitoring, and see a vet if behaviour changes.',
  },
};

/** 2. Painful cat — clearly above the analgesia threshold. */
export const fixturePainful: AssessResult = {
  status: 'assessed',
  assessment: {
    actionUnits: [
      au('ears', 'Ear position', 2, 'Ears markedly flattened and rotated outward.', 0.87),
      au('eyes', 'Orbital tightening', 2, 'Pronounced squinting with visible tightening around the eyes.', 0.86),
      au('muzzle', 'Muzzle tension', 1, 'Muzzle appears somewhat tense and elliptical.', 0.6),
      au('whiskers', 'Whisker position', 1, 'Whiskers pulled slightly forward and stiff.', 0.55),
      au('head', 'Head position', 2, 'Head held low, at or below the shoulder line.', 0.9),
    ],
    scorableCount: 5,
    rawScore: 8,
    maxPossible: 10,
    normalizedScore: 0.8,
    aboveThreshold: true,
    band: 'likely',
    caveats: [
      { kind: 'acute_pain_only', message: 'The Feline Grimace Scale was validated for acute pain. This is an awareness aid, not a diagnosis.' },
    ],
    recommendation: 'Several facial indicators associated with pain are present. Contact a veterinarian promptly to have your cat evaluated.',
  },
};

/** 3. Rejected image — refuse to score rather than guess. */
export const fixtureRejected: AssessResult = {
  status: 'rejected',
  reason: 'face_not_visible',
  message: "We couldn't get a clear enough view of your cat's face to assess it.",
  retakeTips: [
    'Take the photo from the front, roughly at eye level.',
    'Make sure the ears, eyes and muzzle are all visible.',
    'Use good lighting and hold the camera steady to avoid blur.',
  ],
};

/** 4. Partial-scorable — whiskers not visible, still enough AUs to score. */
export const fixturePartial: AssessResult = {
  status: 'assessed',
  assessment: {
    actionUnits: [
      au('ears', 'Ear position', 1, 'Ears slightly rotated outward.', 0.85),
      au('eyes', 'Orbital tightening', 1, 'Mild tightening around the eyes.', 0.84),
      au('muzzle', 'Muzzle tension', 0, 'Muzzle looks relaxed.', 0.6),
      au('whiskers', 'Whisker position', null, 'Whiskers are out of frame / not clearly visible in this photo.', 0.3, 'Whiskers not clearly visible in the image.'),
      au('head', 'Head position', 1, 'Head held roughly level with the shoulders.', 0.88),
    ],
    scorableCount: 4,
    rawScore: 3,
    maxPossible: 8,
    normalizedScore: 0.375,
    aboveThreshold: false,
    band: 'possible',
    caveats: [
      { kind: 'low_confidence', message: 'One feature (whiskers) could not be assessed and was excluded from the score.' },
      { kind: 'acute_pain_only', message: 'The Feline Grimace Scale was validated for acute pain only.' },
    ],
    recommendation: 'Some mild indicators are present but the picture is incomplete. Consider retaking with the whiskers in frame, and watch for changes.',
  },
};

/** 5. Pipeline error (gap #2) — so A can build the error/retry boundary. */
export const fixtureError: AssessResult = {
  status: 'error',
  kind: 'timeout',
  message: 'The assessment took too long to complete. Please try again.',
  retryable: true,
};

export const allFixtures = {
  healthy: fixtureHealthy,
  painful: fixturePainful,
  rejected: fixtureRejected,
  partial: fixturePartial,
  error: fixtureError,
} as const;
