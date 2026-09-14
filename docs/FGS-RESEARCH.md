# FGS Research — how the scale actually scores, and where we diverge

Person B research pass. **No code changed.** This documents what the Feline Grimace Scale
literature actually specifies, checked against what `contract.ts` and `PROMPT-V0.md`
currently do.

**All nine papers have now been read**, and **P2's raw dataset has been downloaded and
their entire results table reproduced.** Every ⚠️ from the first draft is resolved.
Five headlines:

1. **`TIES GO HIGH` points the right way.** LLMs underestimate feline pain — confirmed twice
   over: the sign convention is stated explicitly in the literature, *and* it reproduces from
   their raw data (F2, F16). But the bias is proportional, so the rule is necessary, not
   sufficient.
2. **F1 is not a hypothetical.** P2 names *our exact mechanism* — "if it is not sure, assume
   no pain" — as the cause of the published failure.
3. **We have a real scoreboard, and the gold-standard labels are public.** P2 and P4 use the
   same metric against the same expert, so untrained vets, trained vets and four chatbots are
   directly comparable (F14) — and P2's 50 expert-scored ratios plus their R code are
   downloadable under CC BY (F16).
4. **I reproduced all eight of P2's Bland–Altman rows to ±0.007** (F16). That pins the exact
   eval formula — including a **trap in how they define "LoA spans the threshold"** that
   would have silently invalidated our benchmark (F2) — and gives our future harness a free
   regression test. It also showed P2's chatbots **never abstained once in 6,000 AU scores**,
   which is direct evidence for F1/F3.

5. **The second reading pass (P6–P9) moved the product thesis, not just the prompt.** Cat
   owners already score the FGS about as well as vets (F18) — so "owners can't do this" is
   dead and needs replacing. Humans err by *over*-scoring pain while LLMs err by
   *under*-scoring it (F19), which is the strongest argument for `TIES GO HIGH` we have. And
   whiskers is now the weak AU in **six** independent studies (F20).

One first-draft finding was **wrong** and is retracted (F11). Everything else here has been
checked against the primary sources or recomputed from P2's raw data.

---

## Source status

| # | Source | Status |
|---|--------|--------|
| P1 | Evangelista et al. 2019, *Sci Rep* 9:19128 — development & validation | ✅ read in full |
| P2 | Ngai, Bukhari, Alonso Sousa & Steagall 2025, *Sci Rep* 15:43461 — chatbots vs expert | ✅ read in full |
| P3 | Cheng et al., *JFMS* — FGS in kittens | ✅ read in full |
| P4 | Robinson & Steagall, *JFMS* 2024 — effects of training | ✅ read in full |
| P5 | Steagall et al., *Vet J* — dimensionality, AU importance, variables | ✅ read in full |
| P6 | Steagall et al. 2023, *Sci Rep* 13:21584 — fully automated deep learning | ✅ read |
| P7 | Lee & Steagall 2026, *JVIM* 40(1) — COSMIN systematic review of acute pain instruments | ✅ read |
| P8 | Monteiro, Lee & Steagall 2023, *JFMS* — 1,262-caregiver global survey | ✅ read |
| P9 | Evangelista & Steagall 2021, *Sci Rep* 11:5262 — agreement across owners/vets/students/nurses | ✅ read |
| P2-supp | P2 supplementary files 1 & 2 — raw dataset + R code | ✅ downloaded, results reproduced (F16) |

The FGS training manual and its reference images are © Université de Montréal, All Rights
Reserved. They are **not** reproduced here or anywhere in this repo. P1 and P2 are open
access; quoted passages are short and attributed.

---

## The scoring algorithm, exactly as published (P1)

> "For each AU, the observers could select one of the four following options: 0 = AU is
> absent; **1 = moderate appearance of the AU, or uncertainty over its presence or absence**;
> 2 = obvious appearance of the AU; or **"not possible to score" (e.g. if the AU was not
> clearly visible)**."

> "A single total pain score per image was calculated as the sum of scores from each AU
> divided by the maximum possible score (e.g. 4/10 = 0.4), excluding the AU marked as "not
> possible to score". The final FGS score ranged from 0 to 1. **Images receiving more than
> two "not possible to score" from the same rater were excluded from the analysis.**"

Cut-off: **> 0.39 out of 1.0** → rescue analgesia. Sensitivity 90.7%, specificity 86.6%,
AUC 0.94 (95% CI 0.89–0.98).

### Verbatim AU definitions (P1)

1. **Ear position** — tips of ears pulled apart and rotated outwards.
2. **Orbital tightening** — narrowing of the orbital area, **with a height between eyelids
   smaller than 50% of eye width**, or tightly closed eyelid (squinted eyes).
3. **Muzzle tension** — flattening and stretching of the muzzle from round to an elliptical
   shape (muzzle may be bulged).
4. **Whiskers position** — movement of whiskers forward (rostrally and away from the face),
   as if standing on end (spiked).
5. **Head position** (relative to the shoulders) — head below the shoulder line, or tilted
   down (chin toward the chest).

---

## F1 — 🔴 We define abstention by *certainty*; the scale defines it by *visibility*

**Status: not yet observed in our own runs, but P2 identifies this exact mechanism as the
cause of the published chatbot failure.** Upgraded from 🟠 after reading P2.

The scale draws its line at **visibility**. Our prompt draws it at **certainty**:

| Situation | FGS says | `PROMPT-V0.md` says |
|---|---|---|
| Can't see the AU (cropped, occluded, bad angle) | not possible to score | `null` ✅ |
| Can see it, but unsure whether it's present | **score 1** | `null` ❌ |

Our current headline wording — *"Set `score`: null whenever the feature is not clearly and
unambiguously resolvable in THIS image"* — is certainty-framed and collapses both rows into
`null`. (Its three concrete examples — busy/light background, oblique angle, cropped
shoulders — are all genuine *visibility* cases, which is why this has not yet bitten.) Note
that the official FGS app's own UI labels option 1 **"Moderately present or uncertainty over
its presence"**, matching P1 exactly.

**If it fires, it biases the score downward at the decision boundary.**

Let `r = S / 2n`. Scoring an uncertain AU `1` instead of dropping it gives `r' = (S+1) / (2n+2)`.

```
r' > r   ⟺   2n > 2S   ⟺   S/n < 1   ⟺   r < 0.5
```

So **whenever the score is below 0.5, dropping an uncertain AU lowers it.** The entire
region around the 0.39 cutoff is below 0.5, so the divergence pushes cases *down* across the
rescue-analgesia line — the direction that tells an owner their cat is fine.

Concrete band flip — ears 2, eyes 1, muzzle 0, head 0, whiskers uncertain:

- our behaviour (whiskers → `null`): `3/8 = 0.375` → below threshold → **`possible`**
- FGS behaviour (whiskers → `1`): `4/10 = 0.400` → above threshold → **`likely`**

Same photo, opposite recommendation.

### Has it actually fired? Not yet — and that is the interesting part

Checked against `MODEL-ACCESS.md` finding #3, which records every observed `null`:

| Photo | AU | Nulls | Was it visibility or ambiguity? |
|---|---|---|---|
| Washed-out whiskers, light background | whiskers | 1/3 | **visibility** |
| Close-up control, shoulders cropped | head | 1/3 | **visibility** |

Both are visibility cases, so **no recorded null was a visible-but-ambiguous AU**, and the
divergence has not yet changed a score. Two further reasons it is currently suppressed:
abstention only fires ~1 run in 3, and `contract.ts` rule 3 only converts an AU to `null`
when it is null in *at least half* the runs — so the 1/3 nulls above were outvoted anyway.

On the washed-out photo the model actually scored `whiskers = 1` twice. Under P1's rules
that is defensible — but so is the null. **The prompt as written gives us no way to know
which the model meant**, and that ambiguity is the actual defect.

### Why it still needs fixing: P2 names this mechanism by name

P2's own explanation for why chatbots underestimated pain:

> "a LLM may rely on its prior knowledge, like *'cats usually hide pain well'* or, **if it is
> not sure, 'assume no pain'** which can systematically skew its outputs."

**"If it is not sure, assume no pain" is precisely what certainty-framed abstention
implements.** Dropping an uncertain AU from the numerator *is* assuming no pain for that
feature. Our prompt currently instructs the model to do the thing P2 identifies as the bias.

Independent corroboration from our own data: `MODEL-ACCESS.md` #4 records `gpt-4o` scoring a
photo `0,0,0,0,0` → **0.00**, where `gpt-4.1` scored higher. P2 measured GPT-4o at bias 0.22
(underestimation). Our finding #4 is a one-photo replication of P2's headline result.

### F1 and F3 interact badly — order matters

`MODEL-ACCESS.md` finding #3's stated goal is to make abstention **more reliable**. Doing
that *under certainty-framing* is precisely what converts ambiguity into `null` at volume —
activating the downward bias above, and spending AUs against `MIN_SCORABLE_AUS` (F4).

So: **fix the visibility/certainty split before, or at the same time as, making abstention
more consistent.** Doing F3 first would make things worse.

**Fix direction (not yet applied):** separate the two concepts in the prompt. `null` means
*"I cannot see this feature well enough to judge it"*. `1` means *"visible, but moderate or
I'm unsure whether it's present"*. This also reduces null volume, which independently helps
F3 and `MIN_SCORABLE_AUS`.

---

## F2 — 🔴 RESOLVED: chatbots underestimate feline pain. `TIES GO HIGH` points the right way, but is not sufficient.

Ngai, Bukhari, Alonso Sousa & Steagall, *Sci Rep* 15:43461 (2025). Four chatbots scored 50
expert-scored cat images twice, two months apart, analysed with Bland–Altman.

### The sign, settled

> "Chatbots showed positive bias, **indicating underestimation of FGS scores**." (P2, abstract)

And the convention is stated outright by the same group in P4:

> "Bias with a negative value would suggest **overestimation** of the FGS score by the novice
> rater compared with the gold standard, whereas a **positive bias would suggest
> underestimation of pain**." (P4, Methods)

Every chatbot bias in P2 is positive (0.05 → 0.25). **LLMs under-score feline pain.**
`contract.ts` rule 4 — "ties go high, under-calling pain is the worse error" — corrects a
real, measured, directional bias. **Keep it.** The first-draft worry that it might amplify
an over-estimation is dead.

But keep it with the qualifier below: the direction is right, the magnitude is not under
our control, and the bias is *proportional*, which a one-step tie rule cannot correct. Rule 4
is **necessary but not sufficient**. Do not treat it as the bias fix.

### The numbers

Published, alongside the values I **recomputed from their raw data** (see F16):

| Rater | Bias (pub / mine) | LoA (pub) | LoA spans 0.39? |
|---|---|---|---|
| ChatGPT (GPT-4o) t1 | 0.22 / 0.227 | −0.13 to 0.59 | no |
| ChatGPT (GPT-4o) t2 | 0.21 / 0.214 | −0.14 to 0.57 | no |
| Claude 3.5 Sonnet t1 | 0.11 / 0.108 | −0.37 to 0.59 | **yes** |
| Claude 3.5 Sonnet t2 | **0.05** / 0.051 | −0.39 to 0.49 | **yes** |
| Gemini 1.5 Pro t1 | 0.22 / 0.218 | −0.31 to 0.75 | **yes** |
| Gemini 1.5 Pro t2 | 0.25 / 0.249 | −0.29 to 0.79 | **yes** |
| Perplexity t1 | 0.21 / 0.208 | −0.18 to 0.59 | no |
| Perplexity t2 | 0.18 / 0.179 | −0.29 to 0.65 | **yes** |

Acceptability thresholds (P2/P4): bias < 0.1 is good agreement; LoA must not span 0.39.
**No chatbot achieved both.** Claude got the bias; ChatGPT got the LoA.

### ⚠️ "Spans the threshold" does not mean what it sounds like — pin this down before coding

Read literally, "the LoA spanned 0.39" sounds like *the interval contains 0.39*. It does not.
P2 defines it parenthetically:

> "The LoA did not span the analgesic threshold of 0.39 **(difference between bias and lower
> or upper LoA)** at either time point." (P2, Results — ChatGPT)

So the criterion is on the **half-width**: `1.96 × SD > 0.39` → fails. It is a statement about
*spread*, not about where the interval sits. The two readings disagree loudly — ChatGPT t1's
LoA of −0.13 to 0.59 plainly contains 0.39, yet the paper scores it as *not* spanning, because
0.59 − 0.22 = 0.37 < 0.39.

I confirmed the half-width reading reproduces the paper's verdict on **all eight rows**
(F16). The interval-containment reading reproduces **none** of the four "no" rows.

This matters directly: **an eval harness built on the intuitive reading would mark PurrSight
as failing a bar that the published chatbots "passed", and the comparison would be garbage.**
Use `1.96 × SD < 0.39`, and say so explicitly in the code comment.

### The worst part: the bias is *proportional*

> "as the mean value increases, the difference also increases" — significant for ChatGPT
> (estimate 0.50, p < 0.001), Gemini (0.92 / 1.16, p < 0.001) and Perplexity (0.27 / 0.29,
> p = 0.009 / 0.02).

**Underestimation gets worse as real pain gets worse.** The cats most in need are scored
most wrongly. For a screening tool that exists to catch pain owners would otherwise miss,
this is the single most dangerous property in the literature — and note that a constant
correction like `TIES GO HIGH` cannot fix a *slope*. Claude was the exception (p = 0.91 /
0.77, no significant proportional bias).

### Why this is an opportunity, not just a threat

P2's entire method was **one unstructured sentence typed into a consumer chat UI**:

> "Please assess pain of the following cat facial image using the Feline Grimace Scale and
> provide scores for each of the five action units—ear position, orbital tightening, muzzle
> tension, whisker changes, and head position—as well as the total FGS ratio"

No rubric. No AU descriptors. No abstention option. No structured output. No temperature
control. Manual transcription of free text. That is a **floor, not a ceiling** — and almost
every gap is something we already do:

| P2's method | PurrSight |
|---|---|
| One-line prompt, no AU descriptors | Full 0/1/2 rubric per AU |
| No abstention option offered | Explicit `null` + `MIN_SCORABLE_AUS` |
| Free text, manually transcribed | `strict: true` JSON schema |
| Consumer chat UI, default sampling | API, `temperature: 0` |
| 3 independent assessments, **mean-aggregated** | 3 samples → **modal vote** per AU |
| GPT-4o / Claude 3.5 / Gemini 1.5 (April 2024) | gpt-4.1 |
| No bias correction | `TIES GO HIGH` |

The honest framing for the demo: *a published study found chatbots unreliable at this; we
reproduced their metric, targeted each of their method's gaps, and measured whether it
helped.* That is a real result either way it lands.

**Caveat on their per-AU agreement:** weighted Cohen's κ peaked at 0.65–0.70 (ChatGPT,
orbital) and was far lower elsewhere (Claude best: 0.45–0.49). Even the best AU agreement
was moderate.

**Do not oversell the ensemble.** P2's Statistical analysis section: *"Mean FGS scores from
three independent assessments were calculated for each image and AU"*, and it is those means
that feed the Bland–Altman. So **P2 already had a 3-run ensemble**, and the bias/LoA numbers
above are *post*-averaging. Repeated sampling is **parity with P2, not an advantage over it**
— any improvement we measure has to come from the rubric, the abstention handling, the
structured output, temperature control, or the tie rule. It cannot come from "we sample three
times", because they did too. The one genuine sampling difference is **modal vote per AU**
vs. their **mean of the ratio**, and that is a small, testable delta — not a headline.

**They published their raw data.** P2's Data availability statement: *"The raw dataset and R
analysis codes are available in the supplementary file 1 and 2."* That is expert-rater FGS
scores for their image set, plus the exact R that produced every number we are trying to beat.
See F14 — this materially changes the "we have no expert labels" problem.

---

## F3 — 🟠 We instruct ~6× more abstention than experts produce

P1 reports how often expert raters chose "not possible to score", per AU:

| AU | Expert "not possible to score" |
|---|---|
| Whiskers | **10.2%** |
| Muzzle | 3.6% |
| Head | 2.7% |
| Ears | 0.22% |
| Eyes | **0%** |

That averages **~0.17 unscorable AUs per image**. `PROMPT-V0.md` tells the model to
*"Expect to return at least one null on a typical photo"* — roughly 6× the expert rate.

Two honest caveats: experts scored curated best-of-three screenshots, and our users will
upload worse photos, so *some* increase is legitimate. But the **ordering** is a free
calibration prior we aren't using: eyes should almost never be null, whiskers most often.
A blanket "expect one null" also invites the model to abstain on `eyes`, which experts
never did, and each null costs us an AU against `MIN_SCORABLE_AUS`.

**Fix direction:** make the abstention instruction per-AU and visibility-based rather than a
blanket quota. Pairs naturally with F1.

---

## F4 — 🟠 `contract.ts` comment is factually wrong about `MIN_SCORABLE_AUS`

Current comment:

> `/** Our own product decision, NOT from the paper. ... Tune freely (owned by B). */`
> `export const MIN_SCORABLE_AUS = 3;`

P1: *"Images receiving more than two 'not possible to score' from the same rater were
excluded from the analysis."*

More than two unscorable → excluded. So ≤2 unscorable, i.e. **≥3 scorable**. The value 3 is
exactly right, but it **is** from the paper, and it is therefore **not** free to tune —
lowering it to 2 puts us outside the conditions under which 0.39 was validated.

The constant stays; the comment needs correcting and the "tune freely" licence removed.

**Unresolved: per-rater vs. ensemble.** P1's rule is ">2 not-possible-to-score **from the
same rater**" — a *per-rater* exclusion. Nothing currently maps that onto our 3-run
ensemble. Two readings disagree:

- **Per-run:** reject if any single run returns >2 nulls. Closest to P1's literal wording,
  since each run is the analogue of one rater.
- **Aggregate (what we do today):** apply `MIN_SCORABLE_AUS` to the post-vote AU set, after
  rule 3 has collapsed nulls by majority.

These give different answers whenever nulls are scattered across runs rather than
concentrated in one. Pick one deliberately and write the reasoning down; right now it is
unexamined rather than decided.

---

## F5 — ✅ Confirmed correct, do not touch

- **Denominator.** `rawScore / (2 × scorableCount)`, excluding unscorable AUs — matches P1
  exactly. The earlier worry that the ratio might be over all five AUs is resolved: it is
  scorable-only.
- **Strictly greater-than.** P1 says "> 0.39". `contract.ts` uses `>` and derives `band` and
  `aboveThreshold` from one comparison. Correct.
- **Equal AU weighting.** Cronbach's α = 0.89; α-if-deleted ranges only 0.85–0.90 across all
  five AUs, and P1 concludes "all AU contributed similarly to the final score." Do not
  weight AUs.
- **`acute_pain_only` caveat.** P1 validates the FGS for *acute* pain only.

---

## F6 — ✅ The `confidence` finding now has a mechanism

`MODEL-ACCESS.md` #2 found the model's `confidence` is byte-identical across runs and tracks
*which AU it is* rather than how visible that AU is. P1 publishes exactly such a per-AU table
— inter-rater reliability, round 1 ICC<sub>single</sub>:

| AU | ICC | Interpretation |
|---|---|---|
| Head position | 0.90 | good |
| Ears | 0.87 | good |
| Eyes | 0.86 | good |
| Muzzle | 0.63 | moderate |
| Whiskers | 0.55 | moderate |

This is almost certainly what the model is reciting from training data. It confirms replacing
`confidence` with our measured `agreement` was the right call — keep the field unrendered as
a canary, as PROMPT-V0 says.

Useful side effect: this ranks which AUs are *intrinsically* hard even for experts. Low
agreement on whiskers or muzzle is expected; low agreement on head position is a red flag.

---

## F7 — ✅ Band cut-offs survive contact with the published distributions

P1 score distributions:

| Group | Median (range) |
|---|---|
| Control cats | **0 (0–0.1)** |
| Painful, before analgesia | **0.71 (0.18–0.98)** |
| Painful, after analgesia | **0.44 (0.11–0.93)** |

Our `BAND_CUTOFFS.possible = 0.25` cleanly clears every control cat (max 0.1) → all
`minimal`. Good.

Worth putting in the UI copy: **treated cats still had a median of 0.44, above the 0.39
threshold.** A high score does not mean "untreated", and a cat already on pain relief can
still score `likely`. This supports framing output as a screening prompt to talk to a vet,
never a treatment decision.

---

## F8 — 🟡 We're leaving a measurable criterion on the table

P1 defines orbital tightening quantitatively: **eyelid height < 50% of eye width**. Our
prompt only says "1 partially open | 2 squinted". A ratio test is something a VLM can
actually apply and justify, and it makes `evidence` falsifiable rather than vibes.

Same for head position, where P1 anchors on the **shoulder line** — which is only scorable if
the shoulders are in frame. Our upload UI should explicitly ask for **face plus shoulders**,
or `head` becomes a systematic `null` and we burn one of our five AUs on framing.

**Head position score 2 is two distinct morphologies, not one.** P1 defines it as "head below
the shoulder line **or** tilted down (chin toward the chest)", and the official app's own
score-2 screen shows **two** reference photos accordingly. Our prompt compresses this to
"2 below shoulders or tilted down" on a single line — a model checking only the first clause
will miss a chin-to-chest cat whose head is still above the shoulder line. Worth splitting
into two explicitly enumerated triggers, since head position has the *highest* expert
inter-rater reliability of all five AUs (ICC 0.90) and is therefore the one we can least
afford to get wrong.

---

## F9 — 💡 The strongest idea in the literature for the CV half of the project

Before validating the subjective scale, P1 corroborated it with **objective landmark
measurements**, all significant at p < 0.001:

| Measurement | Control (n=20) | Painful (n=31) |
|---|---|---|
| Ear tips / ear bases ratio | 2.85 ± 0.3 | 2.34 ± 0.3 |
| Eye height / width ratio | 0.79 ± 0.1 | 0.50 ± 0.2 |
| Muzzle height / width ratio | 0.70 ± 0.1 | 0.50 ± 0.1 |
| Medial ear angle | 126.5 ± 4.7° | 140.4 ± 6.5° |
| Lateral ear angle | 78.9 ± 3.1° | 68.5 ± 5.9° |

Inter-observer agreement on these measurements was good-to-excellent (ICC 0.76–0.97).

These are **computable from cat facial landmarks** — no LLM involved. That gives us an
independent geometric signal to cross-check the VLM's `ears`, `eyes` and `muzzle` scores,
and it is a direct, evidence-backed answer to F2's "chatbots are unreliable at this."
A disagreement between the geometric channel and the VLM channel is also a much better
honesty signal than anything self-reported.

Feasibility is the open question — cat facial landmarking is not as turnkey as human
landmarking, and P1 itself notes landmarks **could not be identified in black cats (n = 2)**.

**But the approach is proven.** P2 cites a published model that "combined convolutional
neural networks with machine learning to detect facial landmarks and pain scoring with high
accuracy (~ 95.5%) in classifying painful and non-painful cats." So the question is not
*whether* landmark-based FGS scoring works — it does, better than any chatbot in P2 — only
whether we can stand one up in hackathon time. Worth a timeboxed spike, not a commitment.

---

## F10 — 🟡 Correct the brachycephalic wording before we publish it

`PROMPT-V0.md` currently claims the validation *"explicitly excluded brachycephalic breeds."*
P1 actually says:

> "Brachycephalic breeds were not included. Indeed, one Persian and one Himalayan were
> initially recruited, however they were excluded from final analysis **due to poor image
> quality**... At this point it is not known if brachycephalic cats present the same AU
> related to pain as mesocephalic and dolichocephalic cats."

So they weren't excluded *for being* brachycephalic — they were simply never represented, and
the authors flag transferability as an open question. The `brachycephalic` caveat is still
justified (arguably more so — it's unknown, not merely untested), but the claim as written is
not what the paper says.

Same precision needed on `dark_coat`: the black-cat failure was in the **landmark measurement**
sub-study, not in FGS scoring by human raters.

---

## F11 — ❌ RETRACTED: there is no separate kitten threshold

**The first draft of this document was wrong.** It claimed, on the strength of a web search
summary, a kitten-specific cut-off of ≥ 0.34. Having now read P3 in full: **no such cut-off
exists.** P3 derives no new threshold and applies the adult one:

> "An FGS total ratio score **⩾ 0.39**/1 suggests that analgesia should be administered."

Recorded here rather than deleted, as a reminder that the search summary was confidently
wrong about a clinical number.

**One genuine wrinkle it did surface:** P1 derives the ROC cut-off as **"> 0.39"**, while P3
restates it as **"⩾ 0.39"**. Our `contract.ts` uses strict `>`, matching P1's own derivation,
which is the defensible choice. The discrepancy could only matter on an exact 0.39, and that
value is **unreachable**: attainable scores are `raw / 2n` for integer `raw`, so 0.39 needs
`raw = 0.78n`, which is non-integer for every `n` in 1–5. **No action required**; noted so
nobody "fixes" it later.

**What P3 does tell us — reliability is materially worse in kittens:**

| Measure | Adults (P1) | Kittens (P3) |
|---|---|---|
| Inter-rater ICC, total score | 0.89 (good) | **0.68 (moderate)** |
| Inter-rater ICC, whiskers | 0.55 | **0.35** |
| Inter-rater ICC, muzzle | 0.63 | **0.47** |
| Inter-rater ICC, orbital | 0.86 | 0.70 |
| Inter-rater ICC, ears | 0.87 | 0.62 |
| Inter-rater ICC, head | 0.90 | 0.66 |

Kittens are harder for *humans*, on every AU, with the same whiskers-worst ordering. If we
ever add a kitten caveat it should be about **confidence**, not about moving the threshold.

---

## F12 — ✅ RESOLVED: training works on humans, and gives us the benchmark that matters

P4 (Robinson & Steagall, *JFMS* 2024): seven small-animal vets scored 50 images before and
after FGS training, against the same expert rater (PVS) used in P2.

Per-AU inter-rater ICC, before → after training:

| AU | Before | After |
|---|---|---|
| Muzzle tension | **0.30 (poor)** | 0.76 (good) |
| Whiskers change | 0.48 (poor) | 0.56 (moderate) |
| Ear position | 0.69 | 0.76 (good) |
| Head position | 0.73 | 0.76 (good) |
| Orbital tightening | 0.75 | 0.80 (good) |
| **Total FGS ratio** | **0.75 (moderate)** | **0.80 (good)** |

Bland–Altman vs the expert: bias **0.016 → 0.008**, LoA **−0.277–0.310 → −0.237–0.255**.
Neither spanned 0.39.

The transferable claim is that **the FGS is teachable** — performance is not fixed at
whatever a naive rater does first, and the biggest gain was on the *worst* AU (muzzle, more
than doubling). Better rubric detail in our prompt is the legitimate analogue, and F8's
50%-eyelid rule is the obvious first instance.

Licensing constraint: the official manual's reference images are © Université de Montréal,
All Rights Reserved. Few-shot examples must use our own or properly-licensed images.

---

## F13 — 🟠 Domain shift: validation photos are nothing like user uploads

P1's images were: screenshots from 6 minutes of video, cat **undisturbed in a hospital cage**,
camera at eye level between the cage bars, **best of three by image quality**, cat facing the
camera and **not sleeping, grooming or vocalizing**, cropped to face + part of shoulders.

Our users will upload a phone photo of a relaxed cat at home. Specific risks:

- **A sleepy or mid-blink cat mimics orbital tightening** → false positive. Not something the
  validation sample could contain, because sleeping cats were excluded by design.
- **Shoulders cropped out** → `head` unscorable (see F8).
- **Neither group was "a happy cat at home"** — controls were colony cats in cages. We have no
  published base rate for the population we actually serve.

P5 reinforces this from the scoring side: image quality degrades **muzzle and whiskers**
specifically, via "camera position, coat color, lighting, image resolution, and pixels" —
i.e. exactly the variables a phone snapshot varies most.

At minimum this belongs in user-facing guidance ("awake, facing the camera, include the
shoulders") and in the limitations section of the demo.

---

## F14 — ⭐ The scoreboard: P2 and P4 are directly comparable, and we can join them

This is the most useful thing to come out of the whole reading pass. P2 and P4 use **the same
metric (Bland–Altman bias + LoA), the same acceptability thresholds, and the same expert
rater (PVS)**. So human and machine performance sit on one axis:

| Rater | Bias | LoA | Bias < 0.1? | LoA clears 0.39? |
|---|---|---|---|---|
| **Trained vets** (P4) | **0.008** | −0.237 to 0.255 | ✅ | ✅ |
| **Untrained vets** (P4) | **0.016** | −0.277 to 0.310 | ✅ | ✅ |
| Claude 3.5 t2 (P2) | 0.05 | −0.39 to 0.49 | ✅ | ❌ |
| Claude 3.5 t1 (P2) | 0.11 | −0.37 to 0.59 | ❌ | ❌ |
| Perplexity t2 (P2) | 0.18 | −0.29 to 0.65 | ❌ | ❌ |
| ChatGPT t2 (P2) | 0.21 | −0.14 to 0.57 | ❌ | ✅ |
| Perplexity t1 (P2) | 0.21 | −0.18 to 0.59 | ❌ | ✅ |
| ChatGPT t1 (P2) | 0.22 | −0.13 to 0.59 | ❌ | ✅ |
| Gemini t1 (P2) | 0.22 | −0.31 to 0.75 | ❌ | ❌ |
| Gemini t2 (P2) | 0.25 | −0.29 to 0.79 | ❌ | ❌ |
| **PurrSight** | ? | ? | ? | ? |

("clears 0.39" uses P2's own half-width definition — see the warning in F2. The human rows
pass under either reading; several chatbot rows do not.)

Two things jump out:

1. **An *untrained* vet (bias 0.016) beats every chatbot by an order of magnitude.** The gap
   is not "AI is nearly there" — it is a chasm.
2. **No chatbot passes both tests. Passing both is therefore a concrete, publishable bar**,
   and it is exactly what a hackathon project can aim at and honestly report against.

**This is the eval to build.** It also defines what "done" means for the assessment half of
the project, which we otherwise did not have.

### The labels are public — I downloaded and verified them

P2's Data availability statement points at exactly what we thought we lacked, and I checked
that it is real:

> "The raw dataset and R analysis codes are available in the supplementary file 1 and 2,
> respectively." (P2, Data availability)

Both files are live and unauthenticated (Scientific Reports is CC BY):

```
https://static-content.springer.com/esm/art%3A10.1038%2Fs41598-025-27404-z/
    MediaObjects/41598_2025_27404_MOESM1_ESM.xlsx   (35 KB — raw dataset)
    MediaObjects/41598_2025_27404_MOESM2_ESM.pdf    (43 KB — R analysis code)
```

Workbook 1 contains three sheets:

| Sheet | Shape | Contents |
|---|---|---|
| `Expert rater (GS)` | 50 × 2 | Image ID → gold-standard FGS **ratio** |
| `Chatbots (Trial 1)` | 50 × 73 | 4 bots × 3 assessments × (5 AUs + total) |
| `Chatbots (Trial2)` | 50 × 73 | same, two months later |

**We have the gold-standard labels.** What we do *not* have is the images — the sheet keys on
`Image ID` only, and the images come from P1's dataset. So this is not yet a drop-in
benchmark, but it is far more than we had. See F16 for what it already buys us.

About the gold-standard set itself:

- **Mean GS 0.392, and exactly 25 of 50 images score > 0.39.** The set is deliberately
  balanced around the analgesia threshold — which is why bias near the cut-off matters so much.
- GS values include **0.375, 0.75 and 0.875** — denominators of 8, not 10. **The expert rater
  abstained on exactly one AU in 3 of 50 images (6%).** Direct confirmation that
  not-possible-to-score is used sparingly by experts (F3) and that partial denominators are
  normal and expected (F5).

Remaining gap and fallbacks, in order: (a) ask the authors for the image↔ID mapping — now a
much smaller ask, since we already have their labels and code; (b) build a small
internally-scored set and label it as such; (c) relative improvement on our own fixtures,
noting F2's warning that repeated sampling alone is parity with P2, not an advantage.

---

## F15 — 💡 Per-AU discriminative power is *not* uniform, and the asymmetry is usable

P5 (Steagall et al., *Vet J*) is the first study to measure each AU's diagnostic performance
individually. Table 4:

| AU | Sensitivity | Specificity | AUC | Youden |
|---|---|---|---|---|
| **Ear position** | **0.98** | 0.80 | **0.94** | **0.78** |
| Head position | 0.94 | 0.71 | 0.89 | 0.66 |
| Orbital tightening | 0.92 | 0.75 | 0.88 | 0.67 |
| Whiskers change | 0.93 | **0.65** | 0.87 | 0.59 |
| Muzzle tension | **0.63** | **0.95** | 0.87 | 0.59 |

The two extremes are the interesting part, and they point in *opposite* directions:

- **Muzzle tension: sensitivity 0.63, specificity 0.95.** Muzzle tension being *present* is
  strong evidence of pain; being *absent* means little. A rule-in feature.
- **Whiskers change: sensitivity 0.93, specificity 0.65.** Whisker changes show up in plenty
  of pain-free cats. A rule-out feature, and a false-positive source.
- **Ear position is the single best AU** on every metric (Youden 0.78, AUC 0.94).

This is directly usable in the explainability UI: "muzzle tension present" deserves more
narrative weight than "whiskers changed", even though both contribute 1–2 points.

**⚠️ Whiskers is where three weaknesses stack — and where `TIES GO HIGH` costs the most.**
Pull the whisker row across every table in this document:

| Property | Whiskers | Source |
|---|---|---|
| Specificity | **0.65** — worst of the five | F15 / P5 Table 4 |
| Inter-rater ICC | **0.55** — worst of the five | F6 / P1 |
| Expert "not possible to score" | **10.2%** — 46× the ear rate | F3 / P1 |
| Kitten ICC | **0.35** — worst of the five | F11 / P3 |

The AU our raters agree on least, abstain on most, and which fires most often in pain-*free*
cats, is therefore also the AU most likely to produce a **1–1–2 style split across our three
samples** — which is exactly the case `TIES GO HIGH` resolves upward. Rule 4 does its most
frequent work on our least trustworthy signal, in the direction of false positives.

This does not mean drop the rule (F2: the measured bias is underestimation, so the direction
is right). It means the rule is worth **measuring per-AU** rather than assuming it is
uniformly good. A cheap experiment: log tie frequency by AU across a fixture run, and check
whether whiskers dominates as predicted. If it does, a per-AU tie policy — ties go high
everywhere *except* whiskers — is a one-line change with a literature-backed rationale.
Do not make that change speculatively; measure first.

**Do not reweight the score.** P5 also confirms the FGS is **unidimensional** (PCA, all AUs
loading ≥ 0.6 on PC1) and P1 found α-if-deleted flat across AUs. The scale is validated as an
equal-weight sum and 0.39 is calibrated to that. Weighting would invalidate the threshold.

**P5 also names our abstention priors for us:**

> "Muzzle and whiskers assessment can be challenging when using images, as factors such as
> camera position, coat color, lighting, image resolution, and pixels can affect the
> evaluation. Low-quality images may have a greater impact on scoring these AUs, than on more
> prominent features like head position, ear position, and orbital tightening."

That is F3's ordering, independently confirmed, with the *reasons* enumerated — and it is
close to prompt-ready language.

**Curiosity worth knowing:** female raters scored higher than male raters (p = 0.02),
significantly so on orbital tightening (p < 0.001) and whiskers (p = 0.002). The "gold
standard" the models are chasing has its own human variance.

---

## F16 — ⭐ I reproduced P2's entire results table from their raw data

Using only the downloaded workbook, I recomputed every Bland–Altman row in P2. All eight
match the published values to **±0.007**:

| Rater | Published bias | Recomputed | Published LoA | Recomputed LoA |
|---|---|---|---|---|
| Claude t1 | 0.11 | 0.108 | −0.37 to 0.59 | −0.374 to 0.590 |
| Claude t2 | 0.05 | 0.051 | −0.39 to 0.49 | −0.391 to 0.494 |
| Perplexity t1 | 0.21 | 0.208 | −0.18 to 0.59 | −0.181 to 0.597 |
| Perplexity t2 | 0.18 | 0.179 | −0.29 to 0.65 | −0.292 to 0.651 |
| ChatGPT t1 | 0.22 | 0.227 | −0.13 to 0.59 | −0.136 to 0.589 |
| ChatGPT t2 | 0.21 | 0.214 | −0.14 to 0.57 | −0.145 to 0.573 |
| Gemini t1 | 0.22 | 0.218 | −0.31 to 0.75 | −0.315 to 0.751 |
| Gemini t2 | 0.25 | 0.249 | −0.29 to 0.79 | −0.291 to 0.788 |

### Why this matters more than it looks

**1. The eval formula is no longer a guess.** The exact recipe, now confirmed by
reconstruction rather than inferred from prose:

```
per image:  bot_ratio = mean over the 3 assessments of (sum of 5 AU scores / 10)
            difference = expert_GS − bot_ratio          # sign: positive = bot UNDER-scores
overall:    bias = mean(differences)
            LoA  = bias ± 1.96 × SD(differences)        # sample SD
            fail if 1.96 × SD > 0.39                    # NOT "if the interval contains 0.39"
```

That the sign convention reproduces the published positive biases is **independent
confirmation of F2's direction finding** — underestimation — from the data rather than from
a sentence in the methods. F2 and this agree, from two different kinds of evidence.

**2. We can validate our harness before we have a single label of our own.** When we build the
F14 eval, we can run it against this workbook and require it to reproduce the table above.
An eval harness that cannot reproduce a published result should not be trusted to measure
ours. This is a free, high-value regression test and it should be the *first* test we write.

**3. It decoded a definition that the prose alone left ambiguous.** Reproducing the table is
what let me test the two possible readings of "LoA spans 0.39" against ground truth. The
half-width reading (`1.96 × SD > 0.39`) matches the paper on **8 of 8** rows; the intuitive
interval-containment reading matches **0 of 4** of the "did not span" rows. Without the raw
data this would have stayed a coin-flip, and we would have had a 50% chance of building the
eval against the wrong criterion. See the warning box in F2.

**4. P2's chatbots never abstained — not once.** I counted every AU cell in both trials:
**6,000 cells (4 bots × 3 assessments × 5 AUs × 50 images × 2 trials), zero blank.** The
"not possible to score" option that P1 defines as part of the scale simply never appears in
their data, because their one-line prompt never offered it. Two consequences:

- It is **direct primary evidence for F1 and F3**. The published failure was measured on a
  system that could not abstain at all, which is the extreme end of the same axis our prompt
  sits on. Handling abstention properly is a genuine, untested-in-the-literature
  differentiator — not a detail.
- The comparison is **asymmetric**: the expert rater abstained on 3 of 50 images, the
  chatbots on 0 of 50. Any harness we build has to decide what to do when our model abstains
  and the gold standard did not, or vice versa. P2 never had to answer this. We do.

**5. We inherit a baseline for free.** We can compute *anything* on their per-AU chatbot
scores — per-AU error rates, which AU drives the most disagreement, whether the three
assessments disagreed most on whiskers (F15's prediction). That is a real dataset to test our
hypotheses against, today, without touching an API.

Working copy is in the session workspace, not committed:
`P2-supp1-rawdata.xlsx`. It is CC BY — usable with attribution, which we owe regardless.

---

## F17 — ⭐ P6 almost certainly powers the paid app's AI mode, and its dataset is deliberately withheld

P6 (Steagall, Monteiro, Marangoni, Moussa & Sautié 2023, *Sci Rep* 13:21584) is the "~95.5%
accuracy" model P2
cites and that F9 proposed spiking on. It is by the same group as every other paper here, and
it is explicitly built as the backend for a phone app — which makes it, almost certainly, the
AI mode of the paid "Feline Grimace Scale" app we are building a free alternative to.

> **This specific link is inference, not citation.** P6 states that a mobile phone application
> is under development by the same group; it never names the shipped product. The architecture,
> the smartphone targeting, the authorship and the withheld dataset all point one way, but if
> challenged, what we can actually defend is "same group, app under development" — not "this is
> that app's engine."

**The architecture, for F9's benefit:**

| Stage | Method | Result |
|---|---|---|
| 1. Landmark detection | CNN (ShuffleNetV2 / EfficientNetB0 / MobileNetV3), 37 facial landmarks | NRMSE **16.76%** |
| 2. Feature engineering | 35 geometric descriptors derived from landmarks | — |
| 3. Classification | XGBoost, painful vs non-painful | accuracy **95.51%**, AUROC **0.97** |
| 3b. Regression | XGBoost on total FGS ratio | MSE **0.0096–0.0104** |

3,447 images. Small dataset, short training times, smartphone-targeted — they chose
ShuffleNetV2/MobileNetV3 *because* of on-device constraints. **F9 is therefore not
speculative: it is a published, reproducible recipe.** What we lack is the data, not the method.

**And the data is gone on purpose.** P6's data availability statement:

> "The datasets generated and analysed during the current study are not publicly available due
> to the undergoing development of the mobile phone application."

This is a **commercial** withholding, not an administrative one. ⚠️ **This directly lowers the
odds on the "email Steagall for P1's images" suggestion in step 3 of the next-steps list.**
Same corresponding author, same group, and we would be a free competitor to the product the
data is being reserved for. Worth one polite email, but plan as though the answer is no.

### The ablation nobody else ran — and it lands on whiskers

P6 retrained with AU-linked descriptor groups removed. Binary classification accuracy:

| Descriptor set | Accuracy | AUROC |
|---|---|---|
| All 35 | **95.51%** | 0.97 |
| **Excluding whiskers-derived** | **94.05%** | **0.97** |
| Excluding head-position-derived | 93.26% | 0.97 |
| Excluding both | 91.01% | 0.96 |

**Dropping every whisker-derived feature costs 1.46 percentage points and *zero* AUROC.**

State this one carefully: it does **not** say whiskers can be removed from the FGS. The ground
truth still includes whiskers, and the remaining descriptors can partly infer it. What it does
say is that whisker-derived geometry carries **little unique predictive information** — which
is independent, quantitative support for treating whiskers as our lowest-trust AU (F15, F20).

### Per-AU prediction error confirms the ear/whisker split

P6 Table 4, ordinal classification MSE per AU (Mode aggregation, lower = better):

| AU | MSE | Rank |
|---|---|---|
| **Ear position** | **0.0806** | best |
| Orbital tightening | 0.1092 | 2nd |
| Head position | 0.1674 | 3rd |
| Whiskers change | 0.2258 | 4th |
| **Muzzle tension** | **0.3134** | worst |

**Ear position is the best AU in P5 (Youden 0.78, AUC 0.94) *and* the best-predicted AU in
P6.** Muzzle and whiskers are the hardest for both humans and machines. P6 says so directly:

> "whiskers change and muzzle tension have consistently presented lower inter-rater
> reliability compared with the other AUs. This information was corroborated for the
> prediction of AU scores with the largest prediction errors observed for muzzle tension and
> whiskers change."

---

## F18 — 🔴 The product premise needs adjusting: cat owners already score the FGS well

This is the uncomfortable finding, and it is better to hit it now than in front of judges.
P8 and P9 both measured **untrained cat owners** using the FGS, and they are good at it.

**P8** (Monteiro, Lee & Steagall 2023, *JFMS*) — 1,262 caregivers, 66 countries, 10 images:

> caregiver scores were **not significantly different** from veterinarian scores for any AU
> **except muzzle tension** (0.9 vs 0.7, p = 0.035).

Demographics — age, gender, education, number of cats, prior FGS exposure — had no meaningful
effect. **P9** (Evangelista & Steagall 2021, *Sci Rep* 11:5262) — 5 raters × 4 groups, 100
images, veterinarians as gold standard:

| Group | Inter-rater ICC | Intra-rater ICC | Bias vs vets |
|---|---|---|---|
| Veterinarians | > 0.8 | 0.91 | — (gold standard) |
| Students | > 0.8 | 0.91 | −0.038 |
| **Cat owners** | **0.80** | **0.87** | **−0.041** |
| Nurses | > 0.8 | 0.81 | −0.060 |

P9 reports that LoA "did not span the analgesic threshold" for every group and that bias was
"minimal" in all cases.

> ⚠️ **Deliberately not merged into F14's scoreboard.** F14 works *only* because P2 and P4
> share one expert rater and one metric. P9's gold standard is a **five-vet group on 100
> images**; P8's is **eight vets on 10 images**; P2/P4's is **one rater (PVS)**. Different
> axis, different image sets. Putting these rows in the same table would recreate exactly the
> error F14 was built to avoid. Also note P9 reports **no numeric LoA values** — only that
> they were "narrow" and cleared 0.39 — so there is nothing to tick a ✅ against, and P9 uses
> the **same "should not span 0.39" phrasing whose half-width reading trapped us in F2**.

**What this means, stated plainly: an untrained cat owner (bias −0.041) would pass the bar
that every chatbot in P2 failed.** The honest framing is not "owners can't score pain, so
they need AI." It is:

1. **Owners are unreliable on specific AUs, not overall.** P8's per-AU caregiver ICCs:
   eyes 0.69, ears 0.65, muzzle 0.58, **head 0.38, whiskers 0.37**. The aggregate hides two
   AUs where caregivers are genuinely poor. That is a real, narrow, defensible gap.
2. **Friction, not capability, is the barrier.** P8/P9 measured people who had opted into a
   study and were shown curated images. That is not an owner at 11 p.m. wondering whether to
   drive to an emergency clinic.
3. **The reference images are copyrighted** (© Université de Montréal) — which is *not* an
   advantage over the paid app, since that app is licensed by the rights holder. It is the
   reason a free tool cannot simply redistribute the training manual and call it a day: we
   have to guide scoring in our own words, which is exactly what the prompt work is.

**Do not claim the app beats humans.** Claim it makes a validated instrument usable at the
moment of worry, and that it is honest about the two AUs everyone struggles with.

---

## F19 — ⭐ Humans over-score pain; LLMs under-score it. That asymmetry justifies `TIES GO HIGH`.

Put F2 and F18 side by side and a clean pattern appears:

| Rater type | Bias sign | Direction | Safe for screening? |
|---|---|---|---|
| Owners, students, nurses (P9) | **−0.038 to −0.060** | **over**-estimate pain | ✅ yes — errs toward "get it checked" |
| Chatbots (P2) | **+0.05 to +0.25** | **under**-estimate pain | ❌ no — errs toward "probably fine" |

(P9: *"Owners, students and nurses tend to slightly overestimate the veterinarians' scores."*
Sign conventions are consistent across P2/P4/P9 — negative bias = overestimation. Both were
computed against veterinarian gold standards using Bland–Altman.)

> ⚠️ **The load-bearing assumption in this table is cross-paper sign inheritance.** P9 states
> its own direction in prose (above), so that half is direct. P2's positive biases are read as
> *under*-estimation via **P4's Methods**, which states the convention explicitly — P2 itself
> does not spell it out. Same research group, same metric, same software, and P2's values are
> reproduced from their raw data (F16), so the inheritance is sound. But if a single sign
> convention differs between those two papers, this entire table inverts. **Re-verify against
> P2's R code (supplementary file 2, already downloaded) before putting F19 in a slide.**

**Untrained humans fail in the safe direction. Language models fail in the dangerous one.**

For a tool whose entire purpose is catching pain an owner would otherwise miss, a false
negative ("your cat looks fine") is far more costly than a false positive ("worth a vet
call"). So the design goal is not "minimise bias" in the abstract — it is **move the bias
across zero into the human failure mode.** That is the clearest rationale `TIES GO HIGH` has,
and it is worth saying out loud in the demo: *we deliberately tuned toward over-calling,
because that is how careful humans already behave.*

Two guardrails, both still true:
- F2's proportional bias means the rule is **necessary but not sufficient** — slopes 0.50–1.16
  mean a constant nudge cannot fully correct it.
- F15/F20 mean the rule does its most frequent work on whiskers, our least reliable AU. Over-
  calling is the safer error, but it is still an error. **Measure it per-AU.**

---

## F20 — ⭐ Whiskers is now the weak AU in six independent studies

F15 flagged this from three sources and called a per-AU tie policy speculative. It is no
longer speculative — every study that has measured whiskers separately has found it worst or
near-worst, across humans, kittens, experts, caregivers, and machines:

| Source | Measure | Whiskers | Verdict |
|---|---|---|---|
| P1 | Inter-rater ICC | **0.55** | worst of 5 |
| P1 | Expert "not possible to score" | **10.2%** | highest, 46× the ear rate |
| P3 | Kitten ICC | **0.35** | worst of 5 |
| P5 | Specificity | **0.65** | worst of 5 |
| P6 | AU prediction MSE | **0.2258** | 4th of 5 (muzzle worse) |
| P6 | Ablation: accuracy without whisker features | **−1.46 pp**, AUROC unchanged | least unique information |
| P8 | Caregiver ICC | **0.37** | worst of 5 |
| P9 | Owner ICC (single) | **0.47** — "poor", vs 0.74/0.56/0.60 for students/nurses/vets | worst group-gap of 5 |

**Six studies, four rater populations, two species-ages, and one machine-learning ablation all
agree.** F15's proposed experiment — log tie frequency per AU, and if whiskers dominates,
exempt it from `TIES GO HIGH` — now has enough prior support that it should be **planned in**
rather than treated as a maybe. Still measure first; the change is one line and the evidence
says which way it will go.

**Head position is a different story — do not lump them together.** Head is
*discriminative* (P5: AUC 0.89, sensitivity 0.94 — second-best AU) but *unreliable for
non-experts* (P8 caregiver ICC 0.38; P6's second-largest landmark error). So head position is
a good signal that humans and landmark detectors both struggle to *measure*, whereas whiskers
is a weak signal that everyone struggles to measure. Those need different treatment: head
position justifies **better prompt guidance** (which is why F8's split head-position triggers
went into v0.1); whiskers justifies **lower trust in the output**.

### Two corroborating details from P9 worth keeping

**Another grimace scale gave up on whiskers entirely.** P9, explaining the FGS's whisker
problem, notes: *"Some difficulty has also been reported in mice, as authors decided to
exclude the AU whiskers from evaluations."* Combined with P6's ablation (−1.46 pp, AUROC
unchanged), there is now precedent in a sibling instrument *and* a quantitative ablation in an
FGS model. We should **not** drop whiskers — 0.39 is calibrated to all five AUs (F15) — but
down-weighting our confidence in it is the conservative, well-supported position.

**⚠️ And we are locked into the harder modality — this compounds F13.** P9 states plainly:

> "image assessment lacks three-dimensional view that would help to identify the correct
> position of whiskers and muzzle. The assessment of these AU may be impaired by the fur
> colour, image background, and the position of the cat in relation to the camera."

> "Clinical experience in our laboratory shows that scoring the muzzle and whiskers in
> real-time is commonly less challenging than image assessment."

PurrSight is **image-only, by construction**. So we sit permanently in the modality the
authors identify as *worse*, for precisely the two AUs that every rater population scores
worst. This is not fixable by prompting — it is a structural ceiling on muzzle and whiskers
accuracy, and it belongs in the limitations slide rather than being discovered by a judge.
It also sharpens F13: the domain-shift problem and the weak-AU problem are the same problem.

---

## F21 — ✅ P7 independently validates choosing the FGS at all

P7 (Lee & Steagall 2026, *JVIM* 40(1)) is a COSMIN/PRISMA systematic review of **15 acute pain
instruments across 25 studies** in cats and dogs — the first rigorous head-to-head of the
field.

> "The UNESP-Botucatu multidimensional pain scale, its short form, and the Feline Grimace
> Scale demonstrated the highest quality of evidence and findings, with appropriate criterion
> and construct validity, reliability, and responsiveness."

The FGS is one of only **three** instruments presenting "high-quality evidence and sufficient
results **across all 7 measurement properties**" — content validity, internal consistency,
reliability, measurement error, criterion validity, construct validity, and responsiveness.

Two things this buys us:

1. **A defensible answer to "why the FGS and not some other scale?"** — it is not the only
   validated feline instrument, but it is in the top tier by an independent 2026 review, and
   it is the only one of the three that is **image-based** and therefore automatable from a
   photo. MCPS and UFEPS-SF require behavioural observation and palpation.
2. **A credibility anchor for the demo.** "Built on one of three instruments rated highest by
   a 2026 systematic review" is a stronger claim than "built on a published pain scale."

Caveat worth keeping honest: P7 evaluates the **instrument**, not any automated
implementation of it. Nothing in P7 says a model applying the FGS inherits its properties —
P2 is the evidence on *that*, and it is unflattering.

---

## What I'd do next, in order

1. **Fix F1 + F3 + F8 in a single prompt revision.** ✅ **Drafted — `docs/PROMPT-V0.1.md`,
   unverified.** P2 names certainty-framed abstention ("if not sure, assume no pain") as the
   mechanism behind the published chatbot failure. Order was forced — making abstention more
   reliable (F3) *without* splitting visibility from certainty (F1) makes the bias worse — so
   both ship together, with F8's 50%-eyelid rule and split head-position triggers, and P5's
   image-quality language behind the per-AU abstention priors. **Next: run its verification
   checklist.** Until then v0 is still the only prompt observed to work.
2. **Re-run the existing fixtures 3×** and diff AU distribution and null rate against
   `MODEL-ACCESS.md`. Watch whether whiskers nulls fall and whether any photo crosses 0.39.
3. **Use P2's supplementary data (F16), which is already downloaded.** Two immediate jobs:
   (a) make the eval harness reproduce their eight-row table as its first regression test;
   (b) mine their per-AU chatbot scores to test F15's prediction that whiskers carries the
   most disagreement — no API calls needed. Then ask the authors for the image↔ID mapping;
   it is a small ask now that we have their labels and code. ⚠️ **But temper expectations on
   any *image* request (F17):** P6 withholds its dataset explicitly "due to the undergoing
   development of the mobile phone application" — a commercial reservation, from the same
   group, for the product we are building a free alternative to. Ask, but do not plan on yes.
4. **Build the F14 eval: Bland–Altman, bias + LoA vs 0.39**, using F16's confirmed formula.
   This is the project's spine, not a nice-to-have — it is the only way to say anything
   defensible given P2 exists. Note that "we sample 3 times" is **not** the differentiator —
   P2 mean-aggregated three assessments too (F2). The testable deltas are the rubric,
   abstention handling, structured output, temperature, and modal-vote-vs-mean.
5. **Log tie frequency per AU** during step 2's run and check F15's prediction that whiskers
   dominates. **F20 upgraded this from "maybe" to "expect it"** — six independent studies now
   put whiskers worst or near-worst. Still measure first, but plan for the per-AU tie policy.
6. **Fix F4's comment**, remove the "tune freely" licence, and decide per-run vs. aggregate
   for the >2-nulls rule.
7. **Fix F10's wording** in `PROMPT-V0.md` before it ends up in the demo. ✅ **Done** —
   corrected in `PROMPT-V0.1.md`, with an inline ❌ warning left on the wrong sentence in v0.
8. **Timebox a spike on F9** (geometric landmarks). **F17 makes this concrete:** P6 publishes
   the full recipe — 37 landmarks → CNN (ShuffleNetV2/MobileNetV3, NRMSE 16.76%) → 35
   geometric descriptors → XGBoost (95.51%, AUROC 0.97), explicitly built for smartphones on
   3,447 images. The method is proven and the architecture is small. **The blocker is data,
   not technique**, and P6's data is withheld for commercial reasons.
9. **Rewrite the pitch around F18 before the demo.** "Owners can't assess pain" is
   contradicted by our own sources — owners hit ICC 0.80 and bias −0.041 vs vets, and would
   pass the bar every chatbot failed. The defensible story is narrower and better: owners are
   genuinely poor on **whiskers (0.37) and head position (0.38)**, the reference manual is
   copyrighted, and nobody runs a five-AU rubric at 11 p.m. while worried. Pair it with F19 —
   humans over-call pain, LLMs under-call it, and we deliberately tune toward the human
   failure mode. F21 supplies the "why the FGS at all" answer.

Items 1 and 6 change behaviour, so `PROMPT-V0.md`'s rule applies: **eval numbers from before
the change do not carry over.**

**Explicitly not doing:** reweighting AUs (F15 — would invalidate the 0.39 threshold), adding
a kitten threshold (F11 — retracted, no such thing), and claiming repeated sampling as an
advantage over P2 (F2 — they did it too).

---

## Attribution

- **P1** — Evangelista MC, Watanabe R, Leung VSY, Monteiro BP, O'Toole E, Pang DSJ,
  Steagall PV. "Facial expressions of pain in cats: the development and validation of a
  Feline Grimace Scale." *Scientific Reports* 9:19128 (2019). CC BY 4.0. PMC6911058.
- **P2** — Ngai ST, Bukhari SSUH, Alonso Sousa S, Steagall PV. "Agreement of Feline Grimace
  Scale scores between chatbots and an expert rater." *Scientific Reports* 15:43461 (2025).
  doi:10.1038/s41598-025-27404-z. **Supplementary files 1 & 2** (raw dataset, R analysis
  code) are CC BY 4.0 and are the source of every recomputed figure in F16.
- **P3** — Cheng AJ, Malo A, Garbin M, Monteiro BP, Steagall PV. "Construct validity,
  responsiveness and reliability of the Feline Grimace Scale in kittens." *Journal of Feline
  Medicine and Surgery* (2023).
- **P4** — Robinson E, Steagall PV. "Effects of training on Feline Grimace Scale scoring for
  acute pain assessment in cats." *Journal of Feline Medicine and Surgery* (2024).
  doi:10.1177/1098612X241275284.
- **P5** — Steagall PV, Monteiro BP, Trindade PHE, Bukhari SSUH, Luna SPL. "Understanding the
  Feline Grimace Scale: A study of dimensional structure, importance of each action unit and
  variables affecting assessment." *The Veterinary Journal*.
- **P6** — Steagall PV, Monteiro BP, Marangoni S, Moussa M, Sautié M. "Fully automated deep
  learning models with smartphone applicability for prediction of pain using the Feline
  Grimace Scale." *Scientific Reports* 13:21584 (2023). doi:10.1038/s41598-023-49031-2.
  CC BY. Dataset **not** public — withheld pending mobile app development (F17).
- **P7** — Lee J, Steagall PV. "A systematic review of acute pain scoring instruments and
  their measurement properties in cats and dogs." *Journal of Veterinary Internal Medicine*
  40(1):aalaf062 (2026). doi:10.1093/jvimsj/aalaf062. CC BY-NC.
- **P8** — Monteiro BP, Lee NHY, Steagall PV. "Can cat caregivers reliably assess acute pain
  in cats using the Feline Grimace Scale? A large bilingual global survey." *Journal of
  Feline Medicine and Surgery* (2023). doi:10.1177/1098612X221145499. CC BY-NC.
- **P9** — Evangelista MC, Steagall PV. "Agreement and reliability of the Feline Grimace
  Scale among cat owners, veterinarians, veterinary students and nurses." *Scientific
  Reports* 11:5262 (2021). doi:10.1038/s41598-021-84696-7. CC BY.

The P3 author list is abbreviated; verify before any external publication.

Quoted passages are short excerpts used for scholarly comment and are attributed inline. The
Feline Grimace Scale training manual and its reference images are © Université de Montréal,
All Rights Reserved, and are **not** reproduced in this repository.

Extracted plain-text copies of these PDFs live in the session workspace, not in the repo —
the papers themselves are not ours to redistribute.
