# FGS Prompt v0.2 — measured, and its main hypothesis falsified ⚠️

Supersedes [`PROMPT-V0.1.md`](./PROMPT-V0.1.md), which stays in the repo because it is the
prompt every number in [`../eval/README.md`](../eval/README.md) was produced by.

Unlike v0.1, this revision is **driven by observed behaviour rather than by document review**.
v0.1 was written from the literature and never run; the `eval/` harness has now run it against
`gpt-4.1` on a 40-image generated corpus and a 15-image Feline Grimace Scale reference probe.
Every change below names the eval finding that motivated it.

Per the standing migration rule, **v0.1's numbers do not carry over.** Set
`meta.promptVersion = "v0.2"` so results stay attributable.

> **Bottom line, up front:** v0.2 has been run, and **its central hypothesis did not hold.**
> Rewriting the muzzle and whiskers level-1 descriptors in prose did *not* stop the model
> collapsing level 1 to 0. The revision is kept because it is non-inferior and fixes a
> separate severe-muzzle miss, **not** because it worked. Full numbers in
> [Results](#results--it-failed-criteria-1-and-2-) below. Do not cite v0.2 as having fixed
> under-scoring.

---

## ⚠️ Read this before assuming v0.1 was wrong

The two lines this revision rewrites — muzzle level 1 and whiskers level 1 — were **faithful
to the published scale**. They trace back through v0.1 to v0 unchanged:

| Level | v0.1 wording | Provenance |
|---|---|---|
| muzzle 1 | `mild tension` | published FGS intermediate descriptor |
| whiskers 1 | `slightly curved or straight` | published FGS intermediate descriptor |

So this is **not a correction of a misquote.** It is a deliberate decision to add operational
detail that the published scale leaves to its *image* manual rather than to its text. Human
raters are trained against reference photographs; a zero-shot model only ever sees the words.
The words alone turn out to underspecify the intermediate level, and the model collapses it.

F13 is the licence for doing this at all: a training intervention more than **doubled** human
muzzle agreement (ICC 0.30 → 0.76) without changing the scale, and FGS-RESEARCH.md already
concluded that *"better rubric detail in our prompt is the legitimate analogue."* F8's
50%-of-eye-width rule, added in v0.1, is the existing precedent for putting operational detail
into the prompt that the prose definition omits.

**The cost of the deviation:** our level-1 wording is now ours, not the scale's. If anyone
validates PurrSight against the official manual, this is the first place the two will differ.

---

## What changed, and why

| # | Change | Motivated by |
|---|---|---|
| 1 | `muzzle` level 1 moved onto the **shape** axis, and explicitly continuous with level 2 | Eval: muzzle is bimodal — 20 zeros, 8 ones, 3 twos corpus-wide; scored `0` on a labelled `muzzle=1` reference |
| 2 | `whiskers` level 0/1 **lexically disambiguated** on the relaxed droop, without lowering the level-1 bar | Eval: `curved` appeared in both 0 and 1, so the levels overlapped as text |
| 3 | New rule: whiskers must be scored **from whiskers you can actually see**, never inferred from the surrounding face | Eval 🟡: `grey-occl-muzzle` scored `whiskers = 1` on a **painted-over** region |

The schema is **unchanged**, and so is every other action unit. As in v0.1, that is deliberate:
it keeps this revision to prompt text so an observed behaviour change is attributable to
wording rather than to a new decoding grammar.

---

## Why muzzle and whiskers are NOT treated symmetrically

Both collapsed toward 0 in the eval, so the naive fix is to make both more sensitive. **That
would be a mistake**, and F16 (P5 Table 4) says why:

| AU | Sensitivity | Specificity | What that makes it |
|---|---|---|---|
| Muzzle tension | 0.63 | **0.95** | a **rule-in** feature — present is strong evidence, absent means little |
| Whiskers change | **0.93** | 0.65 | a **rule-out** feature — and the scale's main false-positive source |

Raising muzzle's level-1 sensitivity is therefore well-supported: when the model does call
muzzle tension, that call is trustworthy, and F17 ranks muzzle the *worst-predicted* AU
(MSE 0.3134), so it has the most headroom.

Raising whiskers' sensitivity is the opposite of supported. Whiskers is the weak AU in **six**
independent studies (F20): worst specificity (0.65), worst inter-rater ICC (0.55), highest
expert-unscorable rate (10.2%, 46× the ear rate), and P6's ablation showed dropping every
whisker-derived feature costs 1.46 points of accuracy and **zero** AUROC.

Our own eval reproduced the predicted failure: the model scored `whiskers = 1` on a region
that had been painted over. So change 2 **disambiguates** whiskers without moving the bar, and
change 3 pushes unresolvable whiskers toward `null` — the direction the evidence supports.

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

Everything outside the three changed blocks is byte-identical to v0.1.

---

## Things that are load-bearing

Carried forward from v0.1, and still true:

- **The whitespace alignment of the action-unit block is part of what the model reads.** The
  continuation lines in `muzzle` and `whiskers` are indented to the same column as the score
  text above them, not to the hyphen.
- **`THESE TWO CASES ARE DIFFERENT`** separates the 1-vs-null distinction (F1). Do not move the
  new whiskers paragraph above it — the general null rule has to be established first, so the
  whiskers rule reads as the carve-out it is.
- **The new whiskers paragraph sits *after* "Null is uncommon"** deliberately. That paragraph
  ends on "do not reach for null to avoid committing to a score", and whiskers is the one
  documented exception to it. Order matters.
- `"confidence"` stays in the schema **unrendered**, as a canary. F6 showed the model recites
  published inter-rater ICCs when asked for confidence.

## Deliberately NOT changed in v0.2

| Not changed | Why |
|---|---|
| `head` level 1/2 | Our head reference images are **tight face crops with the shoulders out of frame**, so head is unmeasurable until `underscoring` lands uncropped images. Changing it now would be unfalsifiable. |
| Degraded-image upward drift | Measured by a different case group, and plausibly a preprocessing problem rather than a rubric one. Bundling it would make the muzzle delta unattributable. |
| `ears`, `eyes` | Both already track their labelled references correctly. They are the **control** for this revision. |
| Few-shot reference images | Blocked on licence permission, and would confound a text-only delta. Never bundle it with a wording change. |

---

## Success criteria — stated before the run

A v0.2 that does not meet all four is not an improvement, regardless of what else moves:

1. `muzzle` scores **1** on the labelled `muzzle=1` reference it previously scored 0.
2. `whiskers` scores **1** on the labelled `whiskers=1` reference it previously scored 0.
3. **`comfortable` stays 5/5.** This is the regression canary — it is the only group that
   proves the prompt does not invent pain in a relaxed cat. A v0.2 that finds muzzle tension
   by making everything slightly tense has failed, not succeeded.
4. `ears` and `eyes` are unchanged on every reference they already passed.

Watch, but do not gate on: `grey-occl-muzzle` whiskers moving `1 → null` (change 3 working),
and the corpus-wide muzzle histogram becoming less bimodal.

**Honest limit on all of this:** the reference probe carries **one labelled AU per image and no
ground-truth total**, several severe-level images are the same animal in the same session, and
n is small. These criteria test whether specific known misreads improve. They do **not**
establish accuracy, a threshold, or a false-negative rate, and no result here should be
described as validating the scale.

---

## Results — it failed criteria 1 and 2 🔴

Run: 55 cases, `--concurrency 1`, `gpt-4.1`. **34/35 asserted passed, 0 errored.** That ratio
is not the story, and is not comparable to v0.1's `24/29` — the denominator changed when the
`resolution-boundary` group was added. Compare the criteria instead:

| # | Criterion | Result |
|---|---|---|
| 1 | `muzzle` scores 1 on the labelled `muzzle=1` reference | 🔴 **failed** — still `0` |
| 2 | `whiskers` scores 1 on the labelled `whiskers=1` reference | 🔴 **failed** — still `0` |
| 3 | `comfortable` stays 5/5 | ✅ held |
| 4 | `ears` / `eyes` unchanged on references they passed | ✅ held (`ears=1`, `eyes=1`) |

Across the 31 assessed cases v0.2 returns **muzzle `0` ×17, `1` ×8, `2` ×3, `null` ×3** —
muzzle `1` is still very much the minority call.

⚠️ **That histogram is deliberately not differenced against v0.1's.** v0.1 ran a 34-image
corpus, v0.2 runs 40, and a different subset is gated before the model ever sees it, so the
two are not the same population — subtracting them would manufacture a finding out of a
denominator change. The two labelled references in the table above are the apples-to-apples
comparison, and neither moved.

One genuine change the nulls do show: three muzzle abstentions now appear on the occlusion
cases where v0.1 returned invented scores. That is change 3 working.

### What this actually establishes

**Rewriting the level-1 descriptor in prose does not make the model detect level-1 features.**
That is a real result, and a useful one: the bottleneck is not that the words were vague. The
model reads the elaborated wording and still returns 0. Words were the cheap hypothesis; they
have now been tested and they are not sufficient.

This converts `fewshot-guides` from a speculative idea into the **evidence-backed** next step.
Human raters learn the intermediate level from reference *photographs* — F13's training
intervention doubled muzzle ICC using images, not better prose. We have now shown from our own
data that the text-only analogue does not reproduce that gain.

### What did improve

- `fgs-muzzle-2`, the labelled **severe** muzzle reference and v0.1's *only* assertion failure,
  moved **`0` → `1`**. Direction right, magnitude still short. This is why `fgs-sensitivity`
  reads 8/8 rather than 7/8 — a pass on a tolerance band, not an exact match.
- No regressions anywhere. `tabby-dim18` even settled `0.30` → `0.20`.
- Change 3 (whiskers-null rule) works on `tabby-occl-muzzle` and `calico-occl-muzzle`, which
  now return `muzzle=null, whiskers=null` rather than inventing a score.

### What did not

`grey-occl-muzzle` **still scores `whiskers = 1` on a painted-over region** — the single
remaining assertion failure, unchanged from v0.1. So the explicit "do not infer whisker
position from the shape of the face around them" instruction is followed on two of three
sources and ignored on the third. An instruction that holds 2/3 of the time is not a control.
Whiskers remains the lowest-trust AU, exactly as F20 predicts.

### Verdict: keep v0.2, but do not describe it as fixing under-scoring

It is retained because it is **non-inferior** on every measured axis, strictly better on
`fgs-muzzle-2`, and its text now carries the whiskers-null rule. It is **not** retained on the
grounds that it achieved what it set out to achieve, because it did not. Any summary of this
work that says "v0.2 fixed the level-1 flattening" is false.

---



The Feline Grimace Scale is © Université de Montréal. Scale definitions are used here under
personal/clinical/educational terms; **no FGS reference image is redistributed in this repo**.
The level-1 elaborations in this file are **ours**, derived from the findings in
[`FGS-RESEARCH.md`](./FGS-RESEARCH.md), and are not part of the published scale.
