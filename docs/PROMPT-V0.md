# FGS Prompt v0 — verified

> ⚠️ **SUPERSEDED by [`PROMPT-V0.1.md`](./PROMPT-V0.1.md).** Retained because every number in
> [`MODEL-ACCESS.md`](./MODEL-ACCESS.md) was produced by *this* prompt, so deleting it would
> orphan those results. v0.1 corrects a scoring defect in the abstention rule
> (`FGS-RESEARCH.md` F1) — **build against v0.1, not this.** v0.1 is unverified until its
> checklist is run, so this file remains the last prompt actually observed to work.

This is the exact prompt and schema that produced every result in
[`MODEL-ACCESS.md`](./MODEL-ACCESS.md). It is committed so Person B starts from something
that demonstrably works rather than a blank page. Phase 0 should lift it into
`src/lib/fgs/prompt.ts` and `src/lib/fgs/schema.ts` more or less as-is.

Treat changes to this file the way you'd treat changes to a database migration: if you
edit the prompt or the schema, the eval numbers from before the edit no longer apply.

---

## Request envelope

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
    "json_schema": { "name": "fgs_assessment", "strict": true, "schema": { /* below */ } }
  }
}
```

Downscale the image to **1024 px on the long edge** before encoding. Not cosmetic —
it halves the token count, cuts latency ~30%, and avoids the `500 server_error` that
multi-megabyte payloads intermittently trigger.

---

## System prompt

```text
You assess cat facial expressions using the Feline Grimace Scale (FGS).

Score each of 5 action units 0/1/2:
- ears: 0 forward | 1 slightly pulled apart | 2 flattened/rotated outward
- eyes: 0 fully open | 1 partially open | 2 squinted
- muzzle: 0 relaxed round | 1 mild tension | 2 tense elliptical
- whiskers: 0 loose curved | 1 slightly curved/straight | 2 straight/forward spiked
- head: 0 above shoulder line | 1 aligned | 2 below shoulders or tilted down

ABSTENTION IS REQUIRED, NOT OPTIONAL. Set "score": null whenever the feature is not
clearly and unambiguously resolvable in THIS image. Examples that MUST be null:
whiskers against a busy or light background; muzzle at an oblique angle; head position
when the shoulders are out of frame or cropped. A confident wrong score is far worse
than an honest null. Expect to return at least one null on a typical photo.

Set "confidence" to your genuine per-feature certainty. Do NOT emit the same value for
every unit - vary it to reflect how clearly each specific feature is actually visible.

If there is no cat, the face is not visible, there are multiple cats, or quality is
inadequate: status="rejected", set rejectionReason, and actionUnits=null.
```

---

## JSON Schema

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

## Things in here that are load-bearing

Each of these was arrived at by getting it wrong first. Don't quietly undo them.

**1. `strict: true`, not `{"type":"json_object"}`.**
`json_object` guarantees valid JSON, not *your* JSON. Without strict mode the model
returned a paragraph of prose in the `rejectionReason` enum field. Strict mode enforces
the schema as a decoding grammar server-side, so that failure is structurally impossible
rather than merely unlikely.

**2. Every property must be listed in `required`.** Strict mode does not allow optional
properties — omitting one from `required` is rejected outright. Express "may be absent"
as **nullable** instead: `"type": ["string", "null"]`. That's why `notScorableReason`
and `rejectionReason` are required-but-nullable rather than optional.

**3. Mixed-type nullable enums work.** `{"type": ["integer","null"], "enum": [0,1,2,null]}`
is accepted by strict mode. This was genuinely uncertain going in — it's how abstention
is expressed without a separate boolean flag.

**4. Abstention is framed as mandatory, with concrete examples.** Earlier wording that
merely *permitted* null ("you may answer null if unsure") produced zero nulls, ever.
Requiring it, naming specific cases, and adding "expect at least one null" is what
finally moved the behaviour — and verification showed it does **not** cause blanket
over-abstention: on a close-up where the whiskers were unmistakable, it correctly scored
them in all 3 runs.

**5. `evidence` is per-AU and mandatory.** This is the entire explainability pitch. It
also makes the model commit to a visual justification rather than pattern-matching to a
plausible-looking score.

---

## Two things this prompt does *not* fix

**Abstention is inconsistent.** It fires roughly **1 run in 3** on the same image, so
call the model **3× and take the mode per action unit**, treating an AU as unscorable
when it's null in at least half the runs. See finding #3 in `MODEL-ACCESS.md`.

**`confidence` is not real.** Despite the instruction, the returned values are
byte-identical across repeated runs of the same photo and track *which feature it is*
rather than how visible that feature is. Keep the field — it's a useful canary if a
future model actually calibrates — but **do not render it in the UI.** See finding #2.

---

## Proposed v0.1 extension — NOT YET VERIFIED ⚠️

Everything above this line was run against the model and observed to work. **This section
was not.** It is written down so it isn't lost, and must be tested before anything depends
on it. Do not fold it into the verified schema until it has been run 3× like everything else.

`contract.ts` declares two caveat kinds — `brachycephalic` and `dark_coat` — that nothing
can currently populate, because the schema returns no information about the cat itself.
They exist for good reason: the FGS validation **explicitly excluded brachycephalic
breeds**, and automated landmarking failed on black cats. Those are real limits on when
our output means anything, and silently dropping them would overstate what we can claim.

> ❌ **The brachycephalic sentence above is wrong** — see `FGS-RESEARCH.md` F10. P1 says
> those breeds "were not included", and the one Persian and one Himalayan recruited were
> dropped **for poor image quality**, not by design; the authors state transferability is
> unknown. Corrected wording is in [`PROMPT-V0.1.md`](./PROMPT-V0.1.md). Do not ship the
> sentence above.

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

**What to watch for when testing it:** whether asking for breed/coat observations
perturbs the action unit scores. It shouldn't — but that's an assumption, and the whole
point of this document is that assumptions about this model have been wrong twice already.
Run the existing photos with and without the extension and compare.

---

## Attribution

Action unit definitions are derived from the Feline Grimace Scale: Evangelista et al.,
"Facial expressions of pain in cats: the development and validation of a Feline Grimace
Scale," *Scientific Reports* 9:19128 (2019), CC BY 4.0. The scale's own training manual
and reference images are © Université de Montréal, All Rights Reserved, and are **not**
reproduced here.
