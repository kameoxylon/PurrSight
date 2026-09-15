# FGS Prompt v0.2

The prompt PurrSight uses to score a cat photo against the Feline Grimace Scale (FGS).

This file is self-contained: it specifies the prompt, explains why it is worded the way it is,
and reports what it measured. It does not reference other prompt versions. Differences between
versions are recorded in [`PROMPT-CHANGE-HISTORY.md`](./PROMPT-CHANGE-HISTORY.md).

Set `meta.promptVersion = "v0.2"` on every result produced by this prompt. That field is a
measurement label (see `src/lib/contract.ts`) — two results carrying different values were
produced by different instruments and are not comparable.

> **Status: measured, and its central hypothesis did not hold.** v0.2 set out to stop the model
> collapsing FGS level 1 to 0 by writing the level-1 descriptors more operationally. It did not
> work. The prompt is kept because it is non-inferior everywhere and better in one place, not
> because it succeeded. **Do not describe v0.2 as having fixed under-scoring.** Numbers in
> [Results](#results).

---

## Request envelope

```
POST {endpoint}/openai/deployments/{deployment}/chat/completions?api-version={version}
Authorization: Bearer <Entra token>
Content-Type: application/json
```

```jsonc
{
  "messages": [
    { "role": "system", "content": "<the system prompt below>" },
    { "role": "user", "content": [
      { "type": "text", "text": "Assess this image using the Feline Grimace Scale." },
      { "type": "image_url", "image_url": { "url": "data:image/jpeg;base64,<...>" } }
    ]}
  ],
  "max_tokens": 1000,
  "temperature": 0,
  "response_format": {
    "type": "json_schema",
    "json_schema": { "name": "fgs_assessment", "strict": true, "schema": { /* see contract.ts */ } }
  }
}
```

Downscale to **1024 px on the long edge** before encoding: it halves token count, cuts latency
roughly 30%, and avoids an intermittent `500 server_error` on multi-megabyte payloads. Images
whose short edge is under 200 px are rejected in code before reaching the model — see
`src/lib/assess/image-dimensions.ts` and the resolution ladder in
[`../eval/README.md`](../eval/README.md).

Each assessment makes **three** calls and aggregates them; `temperature: 0` is documented
non-deterministic, so the spread across samples is used as an agreement signal.

---

## System prompt

```text
You assess cat facial expressions using the Feline Grimace Scale (FGS).

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
inadequate: status="rejected", set rejectionReason, and actionUnits=null.
```

---

## JSON Schema

Sent as `response_format.json_schema` with `strict: true`. Reproduced here so this file is
self-contained; the executable copy is `FGS_JSON_SCHEMA` in `src/lib/assess/schema.ts`.

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["status", "rejectionReason", "actionUnits"],
  "properties": {
    "status": { "type": "string", "enum": ["assessed", "rejected"] },
    "rejectionReason": {
      "type": ["string", "null"],
      "enum": ["no_cat_detected", "face_not_visible", "image_quality", "multiple_cats", null]
    },
    "actionUnits": {
      "type": ["array", "null"],
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["id", "score", "notScorableReason", "evidence", "confidence"],
        "properties": {
          "id": { "type": "string", "enum": ["ears", "eyes", "muzzle", "whiskers", "head"] },
          "score": { "type": ["integer", "null"], "enum": [0, 1, 2, null] },
          "notScorableReason": { "type": ["string", "null"] },
          "evidence": { "type": "string" },
          "confidence": { "type": "number" }
        }
      }
    }
  }
}
```

Three things here are load-bearing, each arrived at by getting it wrong first:

1. **`strict: true`, not `{"type":"json_object"}`.** `json_object` guarantees valid JSON, not
   *your* JSON — without strict mode the model returned a paragraph of prose inside the
   `rejectionReason` enum field. Strict mode enforces the schema as a decoding grammar
   server-side, making that failure structurally impossible rather than merely unlikely.
2. **Every property must appear in `required`.** Strict mode forbids optional properties;
   express "may be absent" as **nullable** instead.
3. **Mixed-type nullable enums are how abstention is expressed** —
   `{"type": ["integer","null"], "enum": [0,1,2,null]}`, with no separate boolean flag.

Note that `too_few_scorable_aus` is deliberately absent from `rejectionReason`: that reason is
**ours**, derived after aggregation because only we know how many action units survived the
vote. The model never emits it.

---

## Why the rubric reads the way it does

### Muzzle and whiskers are treated asymmetrically, on purpose

Both are hard AUs that the model tends to score 0. The obvious move is to make both more
sensitive. **That would be a mistake**, because the two fail in opposite directions (F16):

| AU | Sensitivity | Specificity | What that makes it |
|---|---|---|---|
| Muzzle tension | 0.63 | **0.95** | a **rule-in** feature — present is strong evidence, absent means little |
| Whiskers change | **0.93** | 0.65 | a **rule-out** feature — and the scale's main false-positive source |

Muzzle's level-1 descriptor is therefore written to be *reachable*: it places level 1 on the
same shape axis as level 2 and says explicitly that a partial flattening is a 1, not a 0. When
this model calls muzzle tension the call is trustworthy, and F17 ranks muzzle the
worst-predicted AU (MSE 0.3134), so it has the most headroom.

Whiskers gets the opposite treatment. It is the weak AU in **six** independent studies (F20):
worst specificity (0.65), worst inter-rater ICC (0.55), highest expert-unscorable rate (10.2%,
46× the ear rate), and P6's ablation showed that dropping every whisker-derived feature costs
1.46 points of accuracy and **zero** AUROC. Its levels are worded to be *unambiguous* — level 0
anchored on the relaxed droop, level 1 on its absence — without lowering the bar, and the
visibility paragraph pushes unresolvable whiskers toward `null` rather than 1.

### The level-1 wording is ours, not the published scale's

The published FGS gives short intermediate descriptors (`mild tension` for muzzle,
`slightly curved or straight` for whiskers) and teaches the rest through a reference *image*
manual. A zero-shot model only ever sees the words. The elaborations here add the operational
detail that the manual would otherwise supply.

Precedent for doing this: F13 found that a training intervention more than **doubled** human
muzzle agreement (ICC 0.30 → 0.76) without altering the scale itself.

**The cost:** if anyone validates PurrSight against the official manual, the level-1 wording is
the first place the two will differ.

---

## Things that are load-bearing

Do not "tidy" any of the following. Each was arrived at by getting it wrong first.

- **The whitespace alignment of the action-unit block is part of what the model reads.**
  Continuation lines in `muzzle` and `whiskers` align to the score text above them, not to the
  hyphen.
- **`THESE TWO CASES ARE DIFFERENT`** separates the 1-vs-null distinction (F1), which is the
  single most consequential rule in the prompt. Abstention is drawn on **visibility**, never on
  certainty: a visible-but-ambiguous feature is a `1`. Drawing it on certainty instead lets an
  ambiguous AU drop out of the denominator and flip the recommendation — ears 2, eyes 1, muzzle
  0, head 0, whiskers ambiguous gives `3/8 = 0.375` (below the analgesia threshold) as a null
  but `4/10 = 0.400` (above it) as a 1.
- **The whiskers visibility paragraph sits *after* "Null is uncommon"**, which ends on "do not
  reach for null to avoid committing to a score". Whiskers is the one documented exception to
  that instruction, so it has to follow it to read as a carve-out rather than a contradiction.
- **The null base rates are measured, not invented** — expert raters, roughly 1 image in 6
  overall, concentrated in whiskers and muzzle (F3). A blanket "expect one null" invites the
  model to abstain on `eyes`, which experts never do.
- **`"confidence"` stays in the schema but is never rendered**, as a canary: F6 showed the
  model reciting published inter-rater ICCs when asked for confidence. The value actually shown
  to users is the measured cross-sample agreement.

---

## Scope — what this prompt does not address

| Not addressed | Why |
|---|---|
| `head` level 1/2 wording | Head position is scored against the **shoulder line**, and our head reference images are tight face crops with the shoulders out of frame. Head scoring is therefore unmeasurable on current data, and any change would be unfalsifiable. Needs uncropped images first. |
| Upward score drift on degraded images | Underexposed and low-contrast photos drift up rather than down. Measured by a separate case group and plausibly a preprocessing problem rather than a rubric one. |
| Few-shot reference images | Would confound a text-only measurement, and the FGS reference images are licence-restricted. |

---

## Success criteria — written before the run

Four criteria, fixed in advance so the outcome could not be reinterpreted afterwards:

1. `muzzle` scores **1** on the labelled `muzzle=1` reference.
2. `whiskers` scores **1** on the labelled `whiskers=1` reference.
3. **`comfortable` stays 5/5.** The regression canary — the only group that proves the prompt
   does not invent pain in a relaxed cat. A prompt that finds muzzle tension by making
   everything slightly tense has failed, not succeeded.
4. `ears` and `eyes` unchanged on every reference they already passed.

**Honest limit:** the reference probe carries **one labelled AU per image and no ground-truth
total**, several severe-level images are the same animal photographed in one session, and n is
small. These criteria test whether specific known misreads improve. They do **not** establish
accuracy, a threshold, or a false-negative rate, and nothing here validates the scale.

---

## Results

Run: 55 cases, `--concurrency 1`, `gpt-4.1` (`2025-04-14`). **34/35 asserted case-runs passed,
20 observed, 0 errored.** That ratio is not the story — the criteria are:

| # | Criterion | Result |
|---|---|---|
| 1 | `muzzle` scores 1 on the labelled `muzzle=1` reference | 🔴 **failed** — scored `0` |
| 2 | `whiskers` scores 1 on the labelled `whiskers=1` reference | 🔴 **failed** — scored `0` |
| 3 | `comfortable` stays 5/5 | ✅ held |
| 4 | `ears` / `eyes` unchanged | ✅ held (`ears=1`, `eyes=1`) |

Across the 31 assessed cases the muzzle histogram is **`0` ×17, `1` ×8, `2` ×3, `null` ×3** —
level 1 remains very much the minority call.

### What this establishes

**Rewriting the level-1 descriptors in prose does not make the model detect level-1 features.**
The model reads the elaborated wording and still returns 0. That is a real result: the
bottleneck was not vague words. The cheap hypothesis has been tested and ruled out, which is
what makes visual reference anchors the evidence-backed next step — human raters learn the
intermediate level from reference *photographs*, and F13's training gain came from images, not
better prose.

### What worked

- `fgs-muzzle-2`, the labelled **severe** muzzle reference, scores `1`. Right direction,
  magnitude still short; it passes on a tolerance band, not an exact match.
- `tabby-occl-muzzle` and `calico-occl-muzzle` return `muzzle=null, whiskers=null` rather than
  inventing a score — the whiskers visibility rule doing its job.
- The `comfortable` canary held at 5/5. The prompt does not manufacture pain in relaxed cats.

### What did not

`grey-occl-muzzle` **scores `whiskers = 1` on a painted-over region** — the single remaining
assertion failure. The explicit "do not infer whisker position from the shape of the face
around them" instruction is followed on two of three sources and ignored on the third. **An
instruction that holds 2/3 of the time is not a control**, and whiskers remains the
lowest-trust AU, exactly as F20 predicts. Fixing this probably needs a mechanism outside the
prompt.

---

## Attribution

The Feline Grimace Scale is © Université de Montréal. Scale definitions are used here under
personal, clinical and educational terms; **no FGS reference image is redistributed in this
repository.** The level-1 elaborations in this file are **ours**, derived from the findings in
[`FGS-RESEARCH.md`](./FGS-RESEARCH.md), and are not part of the published scale.
