# `eval/` — the assessment quality harness

Person B owns this. It exists to answer one question that no amount of UI work can
answer: **does `PROMPT-V0.1` actually behave the way `docs/PROMPT-V0.1.md` claims?**

Run it:

```bash
npx tsx eval/run.ts                 # every case, cached where possible
npx tsx eval/run.ts --only tabby    # substring filter on case id
npx tsx eval/run.ts --repeat 3      # 3 runs per case, for variance
npx tsx eval/run.ts --fresh         # ignore the cache and re-bill everything
npx tsx eval/run.ts --concurrency 5
```

It calls the **real** `assessImage` against the **real** Azure OpenAI deployment,
using the same code path the website uses. It needs a working `.env.local`
(see `docs/LOCAL-SETUP.md`). Results are cached on disk by
`sha256(image) + promptVersion + model + runIndex`, so a re-run costs nothing
unless the prompt or model changed. Retryable errors are deliberately **never**
cached — a rate limit must not be frozen in as if it were a finding.

Cost is roughly **$0.012 per case** (3 samples each). A full pass is well under a
dollar. The harness prints exact spend at the end.

## Two case sets, with very different evidential weight

### 1. The generated corpus — `eval/cases.json`, `eval/images/` (committed)

34 images derived from the three demo photos by `eval/gen-corpus.ts`: occlusions,
underexposure, blur, downscaling, non-cats, and empty frames.

**What it proves:** the pipeline doesn't invent pain in comfortable cats, and the
gate rejects what it should reject.

**What it cannot prove:** sensitivity. Every source animal is comfortable, so
nothing here can show that a cat in genuine pain gets flagged. It also derives
from only **three distinct cats**, and the degradations are synthetic — real
underexposure is not the same thing as a gamma curve.

The images are committed on purpose. `sharp` is only a transitive Next.js
dependency, so regenerating them is not guaranteed to work everywhere; committing
the output keeps the eval runnable without it.

### 2. The FGS reference probe — `eval/cases-fgs.json` (images NOT committed)

The 15 official per-AU reference photographs, one per (action unit, score level).

> **These images are © Université de Montréal.** They are FGS training material,
> not ours to redistribute, and this repository is public. They are **never**
> committed. Point `FGS_REFERENCE_DIR` in `.env.local` at a local copy and the
> probe runs; leave it unset and the probe is skipped.

**This is a weak, directional probe — not validation.** Four reasons, all of which
the team must state out loud rather than bury:

1. **Training-data contamination.** These are published materials. GPT-4.1 has
   very likely seen them, so a correct answer may be recall rather than
   assessment. Never describe this as "accuracy on real painful cats."
2. **One label per image.** `earposition_*_2_sample1.png` labels the *ears*. The
   other four AUs in that photo are unlabeled, so only the labeled AU is
   asserted; everything else is recorded as an observation.
3. **Fewer distinct cats than files.** Verified by inspection: the ears-2, eyes-2
   and whiskers-2 files are near-identical frames of the *same tabby in the same
   session*. The severe level covers **three** independent animals, not five.
4. **No ground-truth total.** These are per-AU exemplars, so `normalizedScore` is
   printed but never asserted.

Assertions are deliberately tolerant — level 0 must not score 2, level 2 must not
score 0, level 1 is observed only. `temperature: 0` is documented non-deterministic
here (`docs/MODEL-ACCESS.md`, finding 1), so exact-match assertions would flap.
What the bounds catch is **inversion**: calling a clearly painful face comfortable.

## Findings — prompt v0.2, gpt-4.1 (40 generated + 15 FGS)

**`34/35` asserted case-runs passed, 20 observed, 0 errored.**

⚠️ **Do not compare that to v0.1's `24/29`.** The denominator changed when the
`resolution-boundary` group was added, so the ratio moved for reasons that have
nothing to do with the model. Compare per group, or per case.

### v0.2 vs v0.1 — what actually moved

| Group | v0.1 | v0.2 | |
|---|---|---|---|
| `comfortable` | 5/5 | **5/5** | ✅ canary held — still does not invent pain |
| `gating` (incl. `tiny96`) | 0/3 on `tiny96` | **13/13** | ✅ fixed in code, not in the prompt |
| `resolution-boundary` | — | **6/6** | new group; measures where the gate belongs |
| `fgs-sensitivity` | 7/8 | **8/8** | ⚠️ one tolerance-band pass, not an exact match |
| `abstention` | 2/3 | **2/3** | 🔴 unchanged — see below |

**The headline result is a negative one.** v0.2 rewrote the muzzle and whiskers
**level-1** descriptors specifically to stop the model collapsing level 1 to 0. It
did not work:

| Reference | labelled | v0.1 | v0.2 |
|---|---|---|---|
| `fgs-muzzle-1` | muzzle = 1 | 0 | **0** |
| `fgs-whiskers-1` | whiskers = 1 | 0 | **0** |

And on the corpus as a whole, muzzle `1` remains the minority call — across the 31
assessed cases v0.2 returns **muzzle 0 ×17, 1 ×8, 2 ×3, null ×3**.

⚠️ That histogram is deliberately *not* set against v0.1's. v0.1 ran a 34-image
corpus and v0.2 runs 40, with a different set gated before the model, so the two
denominators are not the same population and differencing them would be a
measurement artifact. **The two labelled references above are the apples-to-apples
comparison**, and they did not move.

The nulls are worth noting on their own: three muzzle abstentions appear where
v0.1 reported none on the occlusion cases. That is change 3 working — honest
abstention replacing an invented score.

So: **elaborating the rubric in prose does not make the model see the intermediate
level.** That is worth knowing. It was the cheap hypothesis, it has been tested, and
it is now ruled out — which makes visual reference anchors (`fewshot-guides`) the
evidence-backed next step rather than a guess. Full reasoning in
[`../docs/PROMPT-V0.2.md`](../docs/PROMPT-V0.2.md).

**What v0.2 did improve:** `fgs-muzzle-2` — the labelled *severe* muzzle reference,
and v0.1's only assertion failure — moved `0` → `1`. Right direction, still short.
`tabby-occl-muzzle` and `calico-occl-muzzle` now return `muzzle=null, whiskers=null`
instead of inventing a score.

**What it did not:** `grey-occl-muzzle` still scores `whiskers = 1` on a painted-over
region, despite an explicit instruction not to infer whiskers from the surrounding
face. Followed on two sources, ignored on the third — an instruction that holds 2/3
of the time is not a control. Whiskers remains the lowest-trust AU.

---

## Baseline findings — prompt v0.1, gpt-4.1 (34 generated + 15 FGS)

Retained because v0.2 is measured against it, and because the reasoning below is
what motivated both the resolution gate and the v0.2 wording.

`24/29` asserted case-runs passed, 20 observed, 0 errored. The five failures and
the observations below are the whole point of the exercise — read them, not the
ratio.

### Generated corpus — does it invent pain, and does the gate hold?

**The core claim holds: it does not over-score comfortable cats.** All five
`comfortable` assertions passed. Clear photos of relaxed cats come back `minimal`.

**Gate hole: 96 px thumbnails were assessed, not rejected (3/3 failed).** ✅ **FIXED —
see "The resolution gate" below.** All three `tiny96` cases were scored instead of
gated — and `tabby-tiny96` came back **`0.40 likely`, above the analgesia
threshold**, from a 96-pixel image in which no human could judge muzzle tension.
This was the most actionable defect in the run: a worthless input produced a
confident, alarming verdict. It was not fixed by asking the model more nicely; it
is now enforced in code, before the image reaches the model.

**Abstention is real but unreliable (2/3).** Occluding the muzzle usually does
produce `null` — muzzle null rate 9%, whiskers 6% across the corpus. But
`grey-occl-muzzle` scored **whiskers = 1 on a region that was painted over**. The
model will sometimes describe a feature it cannot see.

**Degraded images drift *upward*.** Underexposure and low contrast, where not
rejected outright, push the score up rather than down:

| tabby | baseline | dim50 | dim30 | dim18 | low contrast |
|---|---|---|---|---|---|
| score | 0.20 | 0.30 | 0.20 | 0.30 | 0.30 |

The grey and calico sources mostly got rejected for `image_quality` instead, which
is the safe outcome. The tabby did not, and its score inflated — consistent with
the whisker drift already noted in `docs/PROMPT-V0.1.md`.

### The resolution gate — how `MIN_IMAGE_EDGE` was chosen

The `tiny96` failure said *a* gate was needed; it did not say where to put it.
Guessing a threshold would have been the easy mistake, so the `resolution-boundary`
group measures one. Each source was rendered down a ladder and re-assessed:

| short edge (tabby / grey / calico) | tabby | grey | calico |
|---|---|---|---|
| 640 / 960 / 720 (baseline) | 0.20 | 0.00 | baseline |
| 256 / 384 / 288 | 0.20 ✓ | 0.00 ✓ | 0.00 ✓ |
| 149 / 224 / 168 | 0.20 ✓ | 0.00 ✓ | 0.10 drifting |
| 107 / 160 / 120 | 0.20 ✓ | 0.00 ✓ | self-rejected ✓ |
| **64 / 96 / 72** | **0.40 ✗** | 0.00 | **0.20 ✗** |

Scores stay stable a long way down, and **confidently wrong output only appears at
a short edge of 72 px or below**. `MIN_IMAGE_EDGE = 200` is therefore deliberately
conservative rather than tight to the data, for two reasons:

1. **It should never fire on a real photo.** The client downscales the *long* edge
   to 1024 and never upscales, so a 4:3 phone photo arrives at 1024×768 and a 16:9
   one at 1024×576 — both far above 200.
2. **The two errors are not symmetrical.** Rejecting a usable image costs a retake.
   Emitting a confident "likely pain" from an unreadable one is a safety failure.

Rejected images never reach the model, so this also costs nothing — the harness
reports them separately from billed assessments for exactly that reason.

### The two directions, together

This is the headline, and it is not a single-sentence story:

- On **genuine pain**, v0.1 **under-scores** — level 1 flattens to 0, muzzle misses.
- On **degraded images**, v0.1 **over-scores** — darkness and 96 px thumbnails
  inflate.

Both are explained by the same mechanism: the model appears to be reading image
artifacts as facial tension while discounting real but subtle tension. More
samples will not fix either; every case agreed 3/3.

### FGS reference probe — per-AU only

Raw score was 7/8 asserted passes, after the two head cases were demoted to
`observe` (see below). **The raw number flatters the model and should
not be quoted on its own** — three of those passes are the same tabby.

Read only the per-AU results below. There is **no ground-truth total** for these
photos, so nothing here supports a claim about overall scores, threshold crossings,
or false-negative rates. A cat labeled `muzzle = 2` may legitimately have a true
total of 0.20 if its other four AUs really are 0. Per-AU is the only safe unit.

### What holds up

**1. Moderate (level 1) is largely flattened to 0.** Of the five level-1
references, only ears and eyes were scored correctly; muzzle, whiskers and head
were all returned as 0.

| Level-1 reference | Ground truth | Scored |
|---|---|---|
| ears | 1 | 1 ✅ |
| eyes | 1 | 1 ✅ |
| muzzle | 1 | **0** |
| whiskers | 1 | **0** |
| head | 1 | **0** |

This is the most important result in the run. Subtle, early pain is exactly what
the product claims to surface, and level 1 is where that lives.

**2. `muzzle` is bimodal and brittle.** Distribution across all 15: twelve 0s,
*zero* 1s, three 2s — and all three 2s came from the single tabby. Against the
independent long-haired `muzzle = 2` reference it returned **0**, the run's only
outright assertion failure. That cat's muzzle is genuinely buried in fur, so this
is a hard case rather than an absurd one, but a confident 0 is still the wrong
answer, and `muzzle` was already one of the two weakest AUs in the original
validation (inter-rater 0.63).

**3. The misses are systematic, not noise.** Every case agreed 3/3 across samples.
Raising `SAMPLES_PER_ASSESSMENT` will not help; this needs a prompt change.

Both confirmed effects point the same way: **v0.1 under-scores**, which suggests
the anti-anthropomorphism guardrails may be overcorrecting.

### What does not hold up, and why

`head` never returned 2 in any of the 15 images (eleven 0s, four 1s, zero 2s),
which initially looked like a hard ceiling on the AU. **It isn't a model finding —
it's a corpus defect.** FGS scores head position by where the head sits relative to
the *shoulder line*, and the head reference photos are tight face crops with the
shoulders out of frame (94–107 KB, against 190–267 KB for every other reference).
The discriminating feature is not in the picture. **This corpus cannot test the
head AU at all**, and no conclusion about head scoring should be drawn from it.

There is a real but much softer finding underneath: the model returned a confident
head score, 3/3, on images where the defining reference is not visible, instead of
returning `null`. That is a failure to abstain, and it is worth checking against
the abstention behaviour described in `docs/PROMPT-V0.1.md` — but it is a claim
about *calibration*, not about accuracy.

### Not yet established

Sensitivity on real, uncontaminated cases. Every severe example here is published
FGS material that the model has probably memorised, and the severe level covers
three animals. Whether v0.1 flags a painful cat it has never seen is still open.

## Adding cases

Edit `eval/cases.json`. Every case needs `id`, `file`, `group`, and `mode`:

- `mode: "assert"` — a real expectation; a miss fails the run.
- `mode: "observe"` — recorded and printed, never failed. Use this whenever the
  correct answer is genuinely arguable. An assertion nobody believes is worse than
  no assertion.

`expect` supports `status`, `aboveThreshold`, `rejectionReason`, `nullAus`, and the
per-AU bounds `auMin` / `auMax`.

The harness hard-fails if a case points at a missing image, and warns about images
with no case — a photo dropped into `eval/images/` that nothing runs is a silent
hole in the eval.
