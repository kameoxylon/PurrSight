# Model comparison — why PurrSight runs on gpt-4.1

**Decision: stay on `gpt-4.1` (`2025-04-14`).** Measured 2026-09-15 against prompt v0.2 using
the `eval/` harness.

This is a decision record. If you are wondering "shouldn't we be on a newer model?", the
answer is that it was tested, and the newer models were worse in the way that matters most.

---

## What was compared

| Model | Version | Included? |
|---|---|---|
| `gpt-4.1` | 2025-04-14 | ✅ incumbent |
| `gpt-5.1` | 2025-11-13 | ✅ |
| `gpt-5.4` | 2026-03-05 | ✅ |
| `gpt-5.6-luna` | 2026-07-09 | ❌ excluded — see below |
| `gpt-5.6-terra` | 2026-07-09 | ❌ excluded — see below |

Identical conditions throughout: prompt v0.2, the same 55-case corpus, the same pipeline code,
3 samples per assessment, `--concurrency 1`, `temperature: 0`.

**The gpt-5.6 models were excluded because they refuse `temperature: 0`**, returning
`400 Unsupported value: 'temperature' does not support 0.0 with this model. Only the default
(1) value is supported.` Our three-sample ensemble treats cross-sample disagreement as a
signal about the *image*; at temperature 1 an unknown share of that disagreement is sampling
noise we did not choose. Comparing them against models pinned at 0 would measure two different
sampling regimes, not two models.

---

## Results

| | `gpt-4.1` | `gpt-5.1` | `gpt-5.4` |
|---|---|---|---|
| Asserted case-runs | **35/35** | 32/35 | 32/35 |
| `comfortable` (does it invent pain?) | 5/5 | 5/5 | 5/5 |
| `abstention` | **3/3** | 1/3 | 2/3 |
| `gating` | **13/13** | 12/13 | 11/13 |
| `resolution-boundary` | 6/6 | 6/6 | 6/6 |
| Degraded photos rejected | **6** | **0** | **0** |

### The decisive finding: the newer models stop refusing bad photos

**Neither gpt-5 model rejected a single dim or low-contrast photo.** `gpt-4.1` rejects six and
tells the user to retake. Specifically:

| Case | `gpt-4.1` | `gpt-5.1` | `gpt-5.4` |
|---|---|---|---|
| `tabby-occl-ears` (ears blacked out) | `rejected/face_not_visible` | **0.25 possible** | **0.38 possible** |
| `grey-blur` | `rejected/image_quality` | `rejected/image_quality` | **0.25 possible** |
| `grey-dim18`, `grey-dim30` | `rejected/image_quality` | scored | scored |
| `calico-dim18`, `calico-dim30` | `rejected/image_quality` | scored | scored |
| `grey-lowcontrast`, `calico-lowcontrast` | `rejected/image_quality` | scored | scored |

A cat whose ears are painted out still gets a pain score from both newer models. This is the
failure mode `PLAN.md` names as the fastest way to destroy user trust: a confident verdict
derived from an image no human could score. The resolution gate in
`src/lib/assess/image-dimensions.ts` catches images that are too *small*, but nothing in code
catches too *dark* or too *blurry* — that gating is the model's job, and the newer models
stopped doing it.

### The trap: `gpt-5.4` looks better on whiskers and is not

`gpt-5.4` is the only model that scores the labelled `whiskers = 1` reference correctly —
apparently fixing the exact defect prompt v0.2 failed to fix.

It is not a fix. **`gpt-5.4` returns `whiskers = 1` on all 15 reference images.** Never 0,
never 2, never null. The per-AU distribution across the 15 FGS references makes this obvious:

| Model | whiskers distribution | head distribution |
|---|---|---|
| `gpt-4.1` | `0`×11, `1`×2, `2`×2 | `0`×11, `1`×4 |
| `gpt-5.1` | `0`×10, `1`×3, `2`×2 | `0`×5, **`1`×8**, `2`×2 |
| `gpt-5.4` | **`1`×15** | `0`×2, **`1`×12**, null×1 |

A model that emits the same value for every input has **zero discriminative power** on that
action unit. It scores the labelled `whiskers = 1` case correctly for the same reason a stopped
clock is right twice a day — and it simultaneously *under*-scores the labelled `whiskers = 2`
reference, because it cannot emit a 2 either.

The consequence shows up on relaxed cats, which is where it matters:

| Reference | labelled | `gpt-4.1` | `gpt-5.4` |
|---|---|---|---|
| `fgs-ears-0` | all AUs relaxed | 0.00 | **0.20** (`wh:1 he:1`) |
| `fgs-muzzle-0` | all AUs relaxed | 0.00 | **0.20** (`wh:1 he:1`) |
| `fgs-whiskers-0` | whiskers = 0 | 0.00 | **0.10** (`wh:1`) |
| `fgs-eyes-0` | all AUs relaxed | 0.00 | **0.13** (`wh:1`) |

Any summary claiming gpt-5.4 improved whisker sensitivity would be wrong.

**`gpt-5.1` shows a milder version of the same drift on `head`** — 8 ones against `gpt-4.1`'s
4, plus two 2s where `gpt-4.1` has none. Head position is the AU with the *highest* expert
inter-rater reliability, so drift there is not a close call either.

### Both newer models lose `ears`

`fgs-ears-1` (labelled `ears = 1`): `gpt-4.1` scores `1`; both gpt-5 models score `0`. Ear
position is the strongest AU in the literature — best sensitivity, best specificity, best
inter-rater reliability, and the best-predicted AU in the published deep-learning work. It is
the worst one to regress on.

### Nobody fixes the level-1 muzzle flattening

`fgs-muzzle-1` scores `0` on **all three** models. This is the open defect prompt v0.2 failed
to close, and changing model does not close it either. It remains an argument for visual
reference anchors rather than for more prose or a newer model.

---

## Cost is not the reason

Measured token usage on a real assessment (3 samples), at Global Standard rates:

| Model | in / out per 1M | Per assessment | vs `gpt-4.1` |
|---|---|---|---|
| `gpt-4.1` | $2.00 / $8.00 | $0.0156 | 1.00× |
| `gpt-5.1` | $1.25 / $10.00 | **$0.0140** | **0.90×** |
| `gpt-5.4` | $2.50 / $15.00 | $0.0255 | 1.64× |

**`gpt-5.1` is about 10% cheaper than what we run.** We are not staying on `gpt-4.1` to save
money — we are paying slightly more for a model that refuses bad photos.

---

## Request-shape differences worth knowing

These are breaking API differences, not preferences, and they are handled in
`samplingParamsFor` in `src/lib/assess/client.ts`:

| | `max_tokens` | `temperature: 0` |
|---|---|---|
| `gpt-4.1` | ✅ | ✅ |
| `gpt-5.1`, `gpt-5.4` | ❌ requires `max_completion_tokens` | ✅ accepted |
| `gpt-5.6-*` | ❌ requires `max_completion_tokens` | ❌ rejected outright |

Reasoning models also bill hidden reasoning tokens against the completion limit (150–183
observed on a clean photo), so the token budget that fits a ~250-token answer no longer does.

⚠️ Unverified: `gpt-5.1` and `gpt-5.4` *accept* `temperature: 0` without erroring, but we have
not established that they **honour** it rather than silently clamping to their default.
Accepting a parameter and respecting it are different things. This does not affect the score
comparisons above, but it does mean cross-model `agreement` figures should not be trusted.

---

## Caveats — what this comparison does not prove

- **The prompt was tuned against `gpt-4.1`.** Prompt v0.2's wording was arrived at by measuring
  `gpt-4.1`'s failures. This measures "gpt-5.x reading a gpt-4.1-tuned prompt", not gpt-5.x at
  its best. A prompt written for gpt-5.1 might close the gap — that experiment has not been run.
- **Run-to-run variance is real.** `temperature: 0` is not deterministic on this API;
  `gpt-4.1`'s own `tabby-baseline` moved `0.20 → 0.30` between two passes of the same corpus.
  Single-case differences may be noise. The rejection gap (6 vs 0) is too large and too
  systematic to be.
- **One pass per model.** Each assessment is a 3-sample ensemble, but the corpus was run once
  per model, not repeatedly.
- **The corpus is mostly synthetic.** Degradation is applied programmatically; a brightness
  multiplier is not the same thing as a genuinely black cat in a dim room.

## What would change this decision

- A newer model that **rejects degraded photos at least as readily** as `gpt-4.1`.
- A prompt revision tuned for a newer model that recovers `ears` and the gating behaviour.
- `gpt-4.1` reaching retirement (2027-04-14), which forces the question regardless.

## Re-running this

The four gpt-5 deployments still exist on `foundry-purrsight`, pinned with
`versionUpgradeOption: NoAutoUpgrade`. They are Global Standard, so they cost nothing while
idle — only per-token when called.

```bash
$env:AZURE_OPENAI_DEPLOYMENT='gpt-5.1'
npx tsx eval/run.ts --concurrency 1
```

The eval cache is keyed on the model, so each model keeps its own results and re-running a
model you have already measured costs nothing.
