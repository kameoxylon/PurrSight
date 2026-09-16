# FGS Prompt v0.3

The FGS rubric preceded by the published reference drawings, attached as images.

This file is self-contained: it specifies the prompt, the schema, why each part is worded the
way it is, and what it measured. It does not reference other prompt versions. Differences
between versions are recorded in [`PROMPT-CHANGE-HISTORY.md`](./PROMPT-CHANGE-HISTORY.md).

Set `meta.promptVersion = "v0.3"` on every result produced by this prompt. That field is a
measurement label, and results carrying different values are not comparable.

> **Status: measured. Two of four success criteria failed, one of them safety-critical.**
> Visual anchors did **not** fix the muzzle level-1 problem, did fix the whiskers one, and made
> the model less willing to reject an unscorable photo. Few-shot is enabled by `FGS_FEWSHOT=1`
> and **remains off by default**. Numbers in [Results](#results).

---

## The idea, and why it is worth a version

Human raters are not taught the Feline Grimace Scale with prose. They are taught with a
reference image manual: three pictures per action unit, showing absent, moderate and marked.
A zero-shot model only ever receives the words, and the words demonstrably underspecify the
**intermediate** level — the model collapses level 1 into 0.

v0.3 gives the model the pictures.

Precedent: F13 found that a training intervention more than **doubled** human muzzle agreement
(ICC 0.30 → 0.76) without changing the scale itself. The intervention was images.

---

## Which images, and the split that must not be broken

**The 15 `_guide` line drawings are attached. The 15 `_sample1` photographs are NOT.**

This is load-bearing. The photographs are the eval's only sensitivity probe
([`../eval/cases-fgs.json`](../eval/cases-fgs.json)) — each carries a known per-AU label and is
used as a *test subject*. Attaching them as anchors would mean scoring the model on examples it
had just been shown, and would silently destroy the only measurement that can tell us whether
visual anchoring works at all.

Line drawings go in as context. Photographs stay held out as tests. If you are tempted to add
the photographs "for better coverage", you are proposing to delete the experiment.

### Ordering

Anchors are sent as a single user turn before the photo, ordered by action unit and then
ascending severity:

```
ears 0, 1, 2 · eyes 0, 1, 2 · muzzle 0, 1, 2 · whiskers 0, 1, 2 · head 0, 1, 2
```

Each drawing is preceded by a short text label (`ears = 0`) so the mapping is explicit rather
than positional. The system prompt states the same ordering; `prompt.test.ts` asserts the two
agree, because a silent drift between what the model is told and what it is shown would be
close to undetectable.

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
      { "type": "text", "text": "Reference drawings from the published Feline Grimace Scale. These are not the cat to assess." },
      { "type": "text", "text": "ears = 0" },
      { "type": "image_url", "image_url": { "url": "data:image/png;base64,<...>", "detail": "high" } }
      /* ... 14 more label/image pairs ... */
    ]},
    { "role": "user", "content": [
      { "type": "text", "text": "Assess this image using the Feline Grimace Scale." },
      { "type": "image_url", "image_url": { "url": "data:image/jpeg;base64,<...>", "detail": "high" } }
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

**Everything before the final photo is constant**, which is deliberate: Azure prompt caching
keys on an identical leading prefix, and `gpt-4.1` supports extended cache retention. Each
assessment makes three calls, so samples 2 and 3 should read the cache. If `cached_tokens`
stays at 0, the prefix is not actually stable and the cost model is wrong.

`detail: "high"` on every image, anchors included. Mixing detail levels changes the cache key,
and `low` downsamples to 512 px — destroying exactly the level-1 distinctions the drawings are
there to teach.

Images whose short edge is under 200 px are rejected in code before any of this happens; see
`src/lib/assess/image-dimensions.ts`.

---

## System prompt

```text
You assess cat facial expressions using the Feline Grimace Scale (FGS).

You are shown 15 reference drawings, then ONE photograph.

The drawings are the published FGS reference illustrations. They come in a fixed
order - ears 0, 1, 2, then eyes 0, 1, 2, then muzzle 0, 1, 2, then whiskers 0, 1, 2,
then head 0, 1, 2 - and they show what each score looks like. THE DRAWINGS ARE NOT
THE ANIMAL YOU ARE ASSESSING. Never score them, never describe them, and never let
one of them be your answer.

Assess ONLY the final photograph.

Use the drawings as your calibration, and pay particular attention to the middle
drawing of each group of three. That middle drawing is the intermediate level, and
it is the one most often missed - a face that looks like it belongs between the
first and third drawings is a 1, not a 0.

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

If the final photograph has no cat, the face is not visible, there are multiple cats,
or quality is inadequate: status="rejected", set rejectionReason, and actionUnits=null.
The reference drawings never affect this decision.
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
   `rejectionReason` enum field.
2. **Every property must appear in `required`.** Strict mode forbids optional properties;
   express "may be absent" as **nullable** instead.
3. **Mixed-type nullable enums are how abstention is expressed** —
   `{"type": ["integer","null"], "enum": [0,1,2,null]}`, with no separate boolean flag.

`too_few_scorable_aus` is deliberately absent from `rejectionReason`: that reason is **ours**,
derived after aggregation because only we know how many action units survived the vote.

---

## Things that are load-bearing

- **The drawings must be disclaimed in the system prompt, not just ordered.** With 16 cats in
  context and one to score, "which animal am I assessing?" is a real failure mode and a silent
  one. The `THE DRAWINGS ARE NOT THE ANIMAL YOU ARE ASSESSING` line and
  `Assess ONLY the final photograph` are both asserted by `prompt.test.ts`.
- **The rubric below the anchor preamble is identical to the no-anchor prompt**, and a test
  enforces that. If the wording drifted at the same time as the anchors were added, an observed
  change could not be attributed to either.
- **Few-shot fails open.** If the reference directory is missing, the pipeline sends the
  no-anchor request and records the other version label rather than refusing to assess. An
  operator misconfiguration must not stop someone getting an answer about their cat.
- **The whitespace alignment of the action-unit block is part of what the model reads.**
- **`"confidence"` stays in the schema but is never rendered**, as a canary: the model was
  observed reciting published inter-rater ICCs when asked for confidence. Users see measured
  cross-sample agreement instead.

---

## Scope — what this prompt does not address

| Not addressed | Why |
|---|---|
| `head` level 1/2 | Head position is scored against the **shoulder line**, and our head reference photographs are tight face crops with the shoulders out of frame. Unmeasurable on current data. |
| Upward score drift on degraded images | Measured by a separate case group, plausibly a preprocessing rather than a rubric problem. |
| Whether the anchors help *real* photographs | The drawings are line art. Whether calibration transfers from drawings to photographs is precisely what the eval must establish, not something to assume. |

---

## Success criteria — written before the run

1. `fgs-muzzle-1` scores **1**. This is the hypothesis. Prose did not fix it and neither did a
   newer model; if visual anchors do not either, the level-1 problem needs a different approach.
2. `fgs-whiskers-1` scores **1** — *and* the whiskers distribution across all 15 references
   stays varied. A model that answers `1` for every image would satisfy criterion 2 while
   having no discriminative power at all; that exact failure was observed on another model, so
   check the distribution, not the single case.
3. **`comfortable` stays 5/5.** The regression canary. Showing the model fifteen examples of
   pain and then asking about a relaxed cat is an obvious way to induce over-scoring.
4. **Gating and abstention do not regress.** Rejection behaviour is safety-critical and there
   is now a great deal more in context to get confused by.

Watch, but do not gate on: `cached_tokens` above 0 on samples 2 and 3 (prefix caching working),
and total `prompt_tokens` versus the no-anchor request (the real cost multiple, which should be
measured rather than estimated).

**Honest limit:** the reference photographs carry one labelled AU each and no ground-truth
total, several severe-level images are the same animal in one session, and n is small. These
criteria test whether specific known misreads improve. They do not establish accuracy, a
threshold, or a false-negative rate.

---

## Results

Run: 55 cases, `--concurrency 1`, `gpt-4.1` (`2025-04-14`). **33/35 asserted case-runs passed,
20 observed, 0 errored.**

| # | Criterion | Result |
|---|---|---|
| 1 | `fgs-muzzle-1` scores 1 | 🔴 **failed** — still `0` |
| 2 | `fgs-whiskers-1` scores 1, distribution stays varied | ✅ **passed** — `0` → `1`, spread `0`×9 `1`×3 `2`×3 |
| 3 | `comfortable` stays 5/5 | ✅ held |
| 4 | gating and abstention do not regress | 🔴 **failed** — see below |

### What worked: whiskers, genuinely

`fgs-whiskers-1` moved `0` → `1`, and **this is not the degenerate always-1 failure**. Across
the 15 references the whiskers distribution stayed varied (`0`×9, `1`×3, `2`×3), so the model
is discriminating rather than answering `1` reflexively. That is a real gain on an action unit
that prose could not move.

### What did not: muzzle, again

`fgs-muzzle-1` still scores `0`. The muzzle level-1 problem has now survived a prose rewrite,
two newer models, and visual reference anchors. Whatever is wrong there is not a matter of the
model failing to know what level 1 looks like.

### The regression, and it is the safety-critical one

| Case | no anchors | with anchors |
|---|---|---|
| `tabby-occl-ears` (ears blacked out) | `rejected/face_not_visible` | **0.30 possible** |
| `grey-occl-muzzle` (muzzle painted over) | whiskers `null` ✅ | whiskers `0` ❌ |

Abstention drops 3/3 → 2/3 and gating 13/13 → 12/13. **A cat whose ears are painted out now
gets a pain score instead of being refused.** This is the exact failure mode criterion 4 was
written to catch, and it is the same one that disqualified `gpt-5.1` and `gpt-5.4` in
[`MODEL-COMPARISON.md`](./MODEL-COMPARISON.md).

The system prompt already says `The reference drawings never affect this decision`. Evidently
not strongly enough. The plausible mechanism is that fifteen scorable examples bias the model
toward "this is a scoring task" and away from "is this photo scorable at all?".

### Everything that moved, moved up

Of the eight reference cases whose score changed, **all eight increased**:

| | no anchors | with anchors |
|---|---|---|
| `fgs-eyes-1` | 0.10 | **0.40 likely** |
| `fgs-head-2` | 0.30 | 0.50 |
| `fgs-eyes-2` | 0.70 | 0.90 |
| `fgs-ears-2` | 0.90 | 1.00 |
| `fgs-whiskers-2` | 0.80 | 0.90 |
| `fgs-whiskers-1` | 0.40 | 0.50 |
| `fgs-muzzle-2` | 0.30 | 0.40 |
| `fgs-muzzle-1` | 0.00 | 0.10 |

A uniform upward shift is not the same thing as better discrimination. On the severe
references it looks like improved sensitivity; on `tabby-occl-ears` the same shift is what
turns a refusal into a score. The four relaxed level-0 references all stayed at `0.00`, and the
`comfortable` group was unchanged case for case — so the shift is not indiscriminate, but it is
broad.

### Cost

| | no anchors | with anchors |
|---|---|---|
| Input tokens per call | 1,678 | **5,291** (3.15×) |
| Cost per assessment | $0.0156 | **$0.0302** (1.94×) |
| Latency per assessment | ~7 s | ~11 s |

Prompt caching works as designed: samples 2 and 3 of an assessment report ~4,480 cached tokens
and cost less than half of sample 1. Without that the multiple would be closer to 3×.

⚠️ The anchor payload also **breaks throughput assumptions**. At 50K TPM the first full run
errored on 45 of 47 assessments; the deployment needed raising to 500K TPM. Anything that
triples the request size needs a quota review before it is switched on.

### Verdict: keep the flag, leave it off

By the bar written before the run, v0.3 is not an improvement — it fails two of four criteria,
and one failure is a safety regression rather than a quality one. A genuine gain on whiskers
does not pay for a model that scores a cat it cannot see, at twice the price.

It is kept, opt-in and off, because the whiskers result is real and worth building on. The
obvious next experiment is whether the gating regression can be separated from the sensitivity
gain — a stronger, more prominent rejection instruction, measured the same way.

---

## Attribution

The Feline Grimace Scale is © Université de Montréal. Scale definitions are used here under
personal, clinical and educational terms.

⚠️ **No FGS image is committed to this repository**, which is public. The reference drawings
this prompt attaches are resolved at run time from a directory outside the repository, and the
cache location is git-ignored. Redistribution of the scale's reference material requires
written permission from felinegrimacescale@umontreal.ca; attaching them to model requests is a
separate question from publishing them, and this repository takes no position on the former
beyond keeping the images out of version control.

The level-1 elaborations in the rubric are **ours**, derived from the findings in
[`FGS-RESEARCH.md`](./FGS-RESEARCH.md), and are not part of the published scale.
