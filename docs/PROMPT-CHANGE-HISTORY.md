# FGS prompt change history

**This is the only file in the repo that compares prompt versions.**

Each `docs/PROMPT-V<n>.md` is written to stand completely on its own: it describes the prompt
it specifies, and nothing else. It does not reference earlier versions, explain what it
changed, or assume you have read anything else. That is deliberate — the prompt that ships is
the only one that matters when you are reading a spec, and cross-references make every version
doc progressively harder to read.

Version-to-version differences live here instead. If you want to know *what changed*, this is
the file. If you want to know *what the prompt currently says*, read the version doc.

## Conventions

- Newest first.
- **Added / Removed / Reworded** are about the system prompt text itself.
- **Outcome** records what the eval measured after the change, including when it measured
  failure. A change that did not work is kept in the record, not quietly dropped.
- Finding IDs (`F1`, `F16`, …) refer to [`FGS-RESEARCH.md`](./FGS-RESEARCH.md).

---

## v0.1 → v0.2

**Theme:** make the *intermediate* (level-1) descriptors operational, and stop the model
inventing whisker scores it cannot see.

**Motivated by:** the first real eval run. v0.1 had never been executed against the model when
it was written; running it produced the first behavioural evidence the project had.

### Reworded — `muzzle` level 1

```diff
- 1 mild tension
+ 1 mild tension - less round than relaxed, beginning to flatten and
+   widen, but not yet clearly elliptical. 1 and 2 are the same shape
+   change differing in degree, so a partial flattening is a 1, not a 0
```

Level 0 (`relaxed and round`) and level 2 (`flattened and stretched … elliptical`) both
describe muzzle **shape**. Level 1 described *degree of tension* — a different axis — so there
was no continuous scale for the model to place a borderline muzzle on. The published words
(`mild tension`) are retained and elaborated rather than replaced.

### Reworded — `whiskers` levels 0 and 1

```diff
- 0 loose and curved
- 1 slightly curved or straight
+ 0 loose, hanging in the relaxed downward curve they rest in
+ 1 straight, or only slightly curved - the relaxed droop of 0 is gone -
+   but still lying out to the side of the face rather than forward
```

`curved` appeared in both levels, so they overlapped lexically. The rewrite anchors level 0 on
the relaxed droop and level 1 on its *absence*, and adds an upper bound (`rather than
forward`) so level 1 cannot bleed into level 2. **The bar was deliberately not lowered** — see
the asymmetry note in [`PROMPT-V0.2.md`](./PROMPT-V0.2.md).

### Added — whiskers visibility rule

```diff
+ Score whiskers only from whiskers you can actually see. If you cannot trace individual
+ whiskers, or the area they sit in is blurred, covered or obscured, that is a null and
+ not a 1. Do not infer whisker position from the shape of the face around them.
```

The eval caught the model scoring `whiskers = 1` on a region that had been **painted over**.
Placed after the "Null is uncommon" paragraph so it reads as a carve-out from the general
rule rather than contradicting it.

### Unchanged

`ears`, `eyes` and `head`; the JSON schema; every other paragraph. `ears` and `eyes` already
tracked their labelled references and were held fixed as controls. `head` was left alone
because our head reference images are tight face crops with the shoulders out of frame, so
head scoring is unmeasurable on our data and any change would have been unfalsifiable.

### A note on provenance

The two reworded lines were **faithful to the published scale** — `mild tension` and
`slightly curved or straight` are the published intermediate descriptors, unchanged since v0.
So v0.2 is not a correction of a misquote; it is a deliberate deviation, adding operational
detail that the published scale leaves to its *image* manual rather than its text. Human
raters are trained against reference photographs; a zero-shot model only ever sees words.

Precedent: F13 (a training intervention more than doubled human muzzle agreement, ICC
0.30 → 0.76, without changing the scale) and F8's 50%-of-eye-width rule, already added in v0.1.

### Outcome — 🔴 the central hypothesis failed

Four success criteria were written down *before* the run. Two failed:

| # | Criterion | Result |
|---|---|---|
| 1 | `muzzle` scores 1 on the labelled `muzzle=1` reference | 🔴 failed — still `0` |
| 2 | `whiskers` scores 1 on the labelled `whiskers=1` reference | 🔴 failed — still `0` |
| 3 | `comfortable` stays 5/5 (does not invent pain) | ✅ held |
| 4 | `ears` / `eyes` unchanged on references they passed | ✅ held |

**Elaborating the rubric in prose does not make the model detect the intermediate level.** The
cheap hypothesis was tested and is now ruled out, which is what promotes visual reference
anchors (`fewshot-guides`) from a guess to the evidence-backed next step.

What did improve: `fgs-muzzle-2` (the labelled *severe* muzzle reference, and v0.1's only
assertion failure) moved `0` → `1` — right direction, magnitude still short. Two of three
occlusion cases now return `muzzle=null, whiskers=null` instead of inventing a score.

What did not: `grey-occl-muzzle` still scores `whiskers = 1` on the painted-over region. The
explicit instruction is followed on two sources and ignored on the third; an instruction that
holds 2/3 of the time is not a control.

**Kept** because it is non-inferior on every measured axis and strictly better on one. **Not**
kept on the grounds that it worked.

⚠️ **Do not compare the headline pass ratios** (v0.1 `24/29`, v0.2 `34/35`). The denominator
changed when the `resolution-boundary` case group was added, so the ratio moved for reasons
unrelated to the prompt. The same applies to the corpus-wide AU histograms: v0.1 ran a 34-image
corpus and v0.2 runs 40, with a different subset gated before the model, so they are not the
same population. **Only the labelled per-AU references are an apples-to-apples comparison.**

---

## v0 → v0.1

**Theme:** correct how the model decides to abstain, and restate the published definitions
precisely.

**Motivated by** document review against the primary literature. v0.1 was never executed
against the model while it was the current version — its behavioural numbers were produced
later, as the baseline for v0.2.

| # | Change | Finding |
|---|---|---|
| 1 | Abstention re-drawn on **visibility** rather than certainty. Uncertainty about a *visible* feature became an explicit `1`, never a `null` | F1 🔴 |
| 2 | The "expect at least one null" quota **removed**, replaced with the measured expert base rate (≈1 image in 6, concentrated in whiskers ≈1 in 10 and muzzle ≈1 in 28) | F3 🟠 |
| 3 | `eyes` gained the published **50%-of-eye-width** criterion; `head`'s two score-2 triggers were **split** so a chin-to-chest cat with its head still above the shoulder line is not missed | F8 🟡 |
| 4 | All five score-2 definitions restated from P1's verbatim wording | F8 🟡 |
| 5 | Brachycephalic claim in the proposed extension corrected | F10 🟡 |

The JSON schema was left unchanged so that any observed behaviour change would be attributable
to wording rather than to a new decoding grammar. That constraint has been honoured in every
revision since.

**Why F1 mattered:** v0 drew abstention on *certainty*, but the FGS draws it on *visibility*.
Those diverge on a visible-but-ambiguous feature, where v0 could return `null` and drop the AU
from the denominator. Worked example: ears 2, eyes 1, muzzle 0, head 0, whiskers ambiguous —
`null` gives `3/8 = 0.375` (below the analgesia threshold), `1` gives `4/10 = 0.400` (above
it). Same photo, opposite recommendation.

---

## v0 — initial

The first prompt. Five action units scored 0/1/2 on a single line each, a JSON schema, and
`temperature: 0`. Its numbers are in [`MODEL-ACCESS.md`](./MODEL-ACCESS.md) and describe v0
only.
