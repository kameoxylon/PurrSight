# FGS Prompt v0.1 — NOT YET VERIFIED ⚠️

Supersedes [`PROMPT-V0.md`](./PROMPT-V0.md), which stays in the repo because every number in
[`MODEL-ACCESS.md`](./MODEL-ACCESS.md) was produced by it.

**Nothing in this file has been run against the model yet.** v0 earned the word "verified" by
being executed and observed; this has not. Per v0's own migration rule, **the existing eval
numbers do not carry over** — they describe v0's behaviour, not this. Do not cite them
alongside this prompt, and set `meta.promptVersion = "v0.1"` so results stay attributable.

Rationale for every change is in [`FGS-RESEARCH.md`](./FGS-RESEARCH.md); finding IDs are
referenced inline below.

---

## What changed, and why

| # | Change | Finding |
|---|---|---|
| 1 | Abstention re-drawn on **visibility**, not certainty. Uncertainty about a *visible* feature is now an explicit **1** | F1 🔴 |
| 2 | "Expect at least one null" quota **removed**, replaced with the measured expert base rate | F3 🟠 |
| 3 | `eyes` gains the published **50%-of-width** criterion; `head`'s two triggers **split** | F8 🟡 |
| 4 | All five AU score-2 definitions restated from P1's verbatim wording | F8 🟡 |
| 5 | Brachycephalic claim in the proposed extension **corrected** | F10 🟡 |

The schema is **unchanged** from v0. That is deliberate: it keeps this revision to prompt text
only, so any behaviour change observed on re-run is attributable to wording rather than to a
new decoding grammar.

---

## Request envelope

Unchanged from v0.

```
POST {endpoint}/openai/deployments/gpt-4.1/chat/completions?api-version=2025-01-01-preview
Authorization: Bearer <AAD token>
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
    "json_schema": { "name": "fgs_assessment", "strict": true, "schema": { /* unchanged */ } }
  }
}
```

Still downscale to **1024 px on the long edge** before encoding — halves token count, cuts
latency ~30%, and avoids the intermittent `500 server_error` on multi-megabyte payloads.

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
            1 mild tension
            2 flattened and stretched from round toward an elliptical shape
- whiskers: 0 loose and curved
            1 slightly curved or straight
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

Set "confidence" to your genuine per-feature certainty. Do NOT emit the same value for
every unit - vary it to reflect how clearly each specific feature is actually visible.

If there is no cat, the face is not visible, there are multiple cats, or quality is
inadequate: status="rejected", set rejectionReason, and actionUnits=null.
```

---

## JSON Schema

Byte-for-byte unchanged from v0 — reproduced here so this file is self-contained.

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

---

## Why change 1 is the important one

v0 told the model to null anything "not clearly and unambiguously resolvable". That is a
**certainty** test. The published scale draws the line at **visibility**:

> "0 = AU is absent; **1 = moderate appearance of the AU, or uncertainty over its presence or
> absence**; 2 = obvious appearance of the AU; or **'not possible to score' (e.g. if the AU was
> not clearly visible)**." — P1

So an uncertain-but-visible AU belongs at **1**, and v0 routed it to null instead. Because a
null is dropped from the denominator rather than scored, this **lowers** the final ratio near
the decision boundary:

```
uncertain AU nulled:   3 / (2×4) = 0.375   ->  below 0.39, "possible"
uncertain AU scored 1: 4 / (2×5) = 0.400   ->  above 0.39, "likely"
```

The same photo lands in different bands, and the direction of the error is toward
under-calling pain. Formally, scoring an uncertain AU 1 rather than nulling it raises the
ratio **iff** the ratio is below 0.5 — and 0.39 < 0.5, so at the threshold the effect is
always downward.

This is not a theoretical concern. P2 identifies the same mechanism as a cause of the
published chatbot failure — *"if it is not sure, 'assume no pain', which can systematically
skew its outputs"* — and independently measures every chatbot as **underestimating** pain.

**Order matters.** Change 2 (cutting the null quota) without change 1 would make this worse,
by pushing borderline AUs into 0 rather than 1. They ship together or not at all (F1/F3).

---

## Things that are load-bearing

Carried over from v0 — each was arrived at by getting it wrong first. Don't quietly undo them.

**1. `strict: true`, not `{"type":"json_object"}`.** `json_object` guarantees valid JSON, not
*your* JSON. Without strict mode the model returned a paragraph of prose in the
`rejectionReason` enum field.

**2. Every property must be listed in `required`.** Strict mode forbids optional properties.
Express "may be absent" as **nullable** instead.

**3. Mixed-type nullable enums work.** `{"type": ["integer","null"], "enum": [0,1,2,null]}` is
how abstention is expressed without a separate boolean flag.

**4. Abstention is still framed as mandatory.** v0 proved that merely *permitting* null ("you
may answer null if unsure") produced zero nulls, ever. v0.1 keeps the imperative framing and
changes only the **criterion** — visibility instead of certainty. Do not soften it back into a
permission.

**5. `evidence` is per-AU and mandatory.** The entire explainability pitch, and it makes the
model commit to a visual justification instead of pattern-matching a plausible score.

**New in v0.1 — 6. The null base rate is stated as observed frequency, not as a quota.** v0's
"expect at least one null on a typical photo" is ~1.0 nulls/image against an expert average of
**0.167** (F3). Phrasing it as a rate the model can calibrate against, rather than a target to
hit, is the intent. If re-running shows the model now *never* nulls, that has overcorrected —
tighten toward v0's wording rather than reverting wholesale.

---

## Known risk this change introduces

Moving uncertainty from null into 1 **will raise scores**, by construction. That is the
intended correction, and it is the right direction given the measured underestimation (F2) —
but it is unbounded here, and a prompt that scores 1 too eagerly would push healthy cats over
0.39.

Whiskers is the AU to watch: worst specificity of the five (0.65), worst inter-rater
reliability (ICC 0.55), and the highest expert abstention rate (10.2%) (F15). It is the most
likely source of new false positives under this change. **Check the whiskers score
distribution specifically** when re-running, not just the aggregate.

---

## Still not fixed by v0.1

**Abstention is inconsistent.** Under v0 it fired roughly **1 run in 3** on the same image.
Hence `SAMPLES_PER_ASSESSMENT = 3` and a per-AU mode. Whether v0.1 changes this rate is one of
the things re-running measures.

**`confidence` is not real.** Values are byte-identical across repeated runs of the same photo
and track *which feature it is* rather than how visible it is — it approximately recites the
scale's published inter-rater reliability, which is in the model's training data
(MODEL-ACCESS #2, F6). The instruction is retained deliberately so the field stays a fair
canary if a future model actually calibrates. **Do not render it in the UI**;
`ActionUnitAssessment.agreement` is the honest replacement.

**Proportional bias.** P2 measured underestimation that *increases* with true pain (slopes
0.50–1.16, p < 0.001). No wording change here addresses a slope, and `TIES GO HIGH` is a
constant correction. Out of scope for a prompt revision; flagged so it is not forgotten (F2).

---

## Before this replaces v0 — verification checklist

v0 earned "verified" by being run. This must do the same:

1. Run the existing fixtures **3×** under v0.1 and diff against the v0 numbers in
   `MODEL-ACCESS.md`: per-AU score distribution, null rate per AU, and whether any photo
   crosses 0.39.
2. Confirm the null rate **fell** toward the expert base rate and did not collapse to zero.
3. Confirm no AU now returns 1 on a photo where all three v0 runs agreed on 0 **and** the
   feature was plainly visible — that would be over-correction rather than the fix.
4. Inspect the whiskers distribution specifically (see risk note above).
5. Re-run the rejection path — none of these edits should touch gating (MODEL-ACCESS #5), so
   any change there is an unintended side effect.
6. Only then update `MODEL-ACCESS.md` and flip the header of this file to verified.

---

## Proposed extension — still NOT VERIFIED ⚠️

Carried over from v0, with the factual correction from F10. Independent of the changes above;
test separately so the two don't confound each other.

`contract.ts` declares two caveat kinds — `brachycephalic` and `dark_coat` — that nothing can
currently populate, because the schema returns no information about the cat itself.

The justification, stated accurately (v0 overstated this — F10):

- **Brachycephalic:** P1 says brachycephalic breeds **"were not included"**. One Persian and
  one Himalayan were initially recruited but **excluded from final analysis due to poor image
  quality** — not excluded by design. The authors state it is **"not known if"** the scale
  transfers to brachycephalic cats. So the honest claim is *unvalidated on flat-faced breeds*,
  **not** *"explicitly excluded"*.
- **Dark coats:** P1 excluded black cats because facial landmarks could not be identified in
  their faces (n = 2, within poor image quality), and reports the same difficulty for
  dark-coated horses. That one is as previously stated.

Proposed additional top-level property (add `"imageContext"` to `required` as well):

```json
"imageContext": {
  "type": ["object", "null"],
  "additionalProperties": false,
  "required": ["faceShape", "coatIsDark"],
  "properties": {
    "faceShape": { "type": "string", "enum": ["typical", "flat_faced", "unclear"] },
    "coatIsDark": { "type": "boolean" }
  }
}
```

Proposed prompt addition:

```text
Also report "imageContext":
- faceShape: "flat_faced" for brachycephalic cats (Persian, Himalayan, Exotic
  Shorthair, British Shorthair and similar flattened facial structures),
  "typical" otherwise, "unclear" if you cannot tell.
- coatIsDark: true if the cat's face is predominantly black or very dark.
This is NOT part of the pain score. It records conditions under which the Feline
Grimace Scale is known to be less reliable.
```

Then map `flat_faced` → `brachycephalic` caveat and `coatIsDark` → `dark_coat` caveat.

**What to watch for when testing it:** whether asking for breed and coat observations perturbs
the action unit scores. It shouldn't — but that is an assumption, and assumptions about this
model have been wrong twice already.

---

## Attribution

Action unit definitions are derived from the Feline Grimace Scale: Evangelista et al., "Facial
expressions of pain in cats: the development and validation of a Feline Grimace Scale,"
*Scientific Reports* 9:19128 (2019), CC BY 4.0. The abstention rates, the 50%-of-width orbital
criterion and the two head-position triggers are quoted or derived from that paper.

The scale's own training manual and reference images are © Université de Montréal, All Rights
Reserved, and are **not** reproduced here or anywhere in this repo.
