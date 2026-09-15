/**
 * PurrSight — the FGS rubric prompt.
 * ---------------------------------------------------------------------------
 * PORTED VERBATIM from docs/PROMPT-V0.2.md. Do not reflow, reword, or
 * "tidy" the text below — it is a measured artifact, not prose. Several
 * phrasings in it were arrived at by getting them wrong first, and the
 * whitespace alignment of the action-unit block is part of what the model
 * reads.
 *
 * CHANGING THIS TEXT INVALIDATES EVERY EVAL NUMBER. The workflow is:
 *   1. add docs/PROMPT-V<next>.md
 *   2. copy it here verbatim
 *   3. bump PROMPT_VERSION to match the filename
 *   4. re-run the eval from scratch
 * `meta.promptVersion` is a measurement label (contract.ts) — two results with
 * different values are not comparable. eval/run.ts also fingerprints this file
 * into its cache key, so an edit here auto-invalidates cached results.
 *
 * v0.2 rewrites the muzzle and whiskers LEVEL-1 descriptors, which the eval
 * showed the model collapsing to 0. Note carefully: v0.1's wording there was
 * *faithful to the published scale* — these are deliberate elaborations for a
 * zero-shot reader, not corrections of a misquote. Muzzle and whiskers are
 * treated ASYMMETRICALLY on purpose (muzzle is a rule-in feature, whiskers a
 * rule-out one with the worst specificity of the five); see PROMPT-V0.2.md
 * before making either of them more sensitive.
 */

/** Names its own spec: docs/PROMPT-V0.2.md. See contract.ts AssessmentMeta. */
export const PROMPT_VERSION = 'v0.2';

/** Verbatim from docs/PROMPT-V0.2.md § System prompt. */
export const SYSTEM_PROMPT = `You assess cat facial expressions using the Feline Grimace Scale (FGS).

Score each of 5 action units 0, 1 or 2. The score-2 wording below is the published
definition of the action unit. 0 is the relaxed baseline. 1 is the intermediate.

- ears:     0 facing forward
            1 slightly pulled apart
            2 tips pulled apart AND rotated outwards
- eyes:     0 fully open
            1 partially open
            2 the gap between the eyelids is less than 50% of the eye's width,
              or the eyelid is tightly closed (squinted)
- muzzle:   0 relaxed and round
            1 mild tension - less round than relaxed, beginning to flatten and
              widen, but not yet clearly elliptical. 1 and 2 are the same shape
              change differing in degree, so a partial flattening is a 1, not a 0
            2 flattened and stretched from round toward an elliptical shape
- whiskers: 0 loose, hanging in the relaxed downward curve they rest in
            1 straight, or only slightly curved - the relaxed droop of 0 is gone -
              but still lying out to the side of the face rather than forward
            2 pushed forward, away from the face, as if standing on end (spiked)
- head:     0 above the shoulder line
            1 level with the shoulder line
            2 EITHER below the shoulder line, OR tilted down with the chin toward
              the chest. Either one on its own is enough for a 2.

THESE TWO CASES ARE DIFFERENT. DO NOT CONFUSE THEM.

Score 1 when you CAN see the feature but cannot decide whether the change is present,
or its appearance is borderline or moderate. Uncertainty about a feature you can see
is a 1. It is never a null.

Score null ONLY when you cannot see the feature well enough to judge it at all -
it is out of frame, cropped, occluded, turned away from the camera, or lost to blur,
shadow or glare. null means "I cannot see this". It never means "I am not sure".

Examples that are genuinely null: whiskers lost against a busy or light background;
the muzzle turned away at an oblique angle; head position when the shoulders are
cropped out of frame, leaving no reference line; an eye hidden by fur or glare.

Null is uncommon. Expert raters mark a feature unscorable on roughly 1 image in 6,
and it is concentrated almost entirely in whiskers (about 1 image in 10) and muzzle
(about 1 in 28). Ears, eyes and head position are nearly always scorable when the
face is visible. Do not reach for null to avoid committing to a score.

Score whiskers only from whiskers you can actually see. If you cannot trace individual
whiskers, or the area they sit in is blurred, covered or obscured, that is a null and
not a 1. Do not infer whisker position from the shape of the face around them.

Set "confidence" to your genuine per-feature certainty. Do NOT emit the same value for
every unit - vary it to reflect how clearly each specific feature is actually visible.

If there is no cat, the face is not visible, there are multiple cats, or quality is
inadequate: status="rejected", set rejectionReason, and actionUnits=null.`;

/** The text part of the user turn; the image is attached alongside it. */
export const USER_PROMPT = 'Assess this image using the Feline Grimace Scale.';
