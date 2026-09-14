# PurrSight — Parallel Build Plan

Two people, one repo, minimal merge conflicts.

**Person A — Application & Delivery** (the one with Next.js experience)
**Person B — Assessment Quality** (the C# dev)

> Why this way round: A already knows Next.js, and the Azure deploy is the critical path
> to "it exists on the internet" — that must not fail. B's stream is language-light: JSON
> shapes, arithmetic, and prompt judgment. `scoring.ts` is plain math and Zod is basically
> FluentValidation, so a C# dev is productive in it within an hour without learning React.

---

## The core principle

**There is no computer-vision workstream.** The perception layer is a single multimodal
model call that returns JSON. Nobody trains a model, nobody detects facial landmarks,
nobody writes OpenCV. If either person starts building a cat face detector, stop and
reread this paragraph.

The work that actually determines quality is: the rubric prompt, the abstention logic,
the scoring math, and the eval set. That is Stream B.

---

## File ownership (this is the anti-conflict mechanism)

Each person edits only their own files. Two shared files, both handled in Phase 0:
`contract.ts` (frozen afterwards) and `package.json` (front-load all dependencies).

```
src/
├── app/
│   ├── layout.tsx                A
│   ├── page.tsx                  A
│   ├── globals.css               A
│   └── api/assess/route.ts       A   (thin — just calls assessImage)
├── components/                   A   (all of it)
│   ├── UploadCard.tsx
│   ├── ResultPanel.tsx
│   ├── ActionUnitCard.tsx
│   ├── ScoreDial.tsx
│   ├── CaveatBanner.tsx
│   └── RejectionCard.tsx
└── lib/
    ├── contract.ts               SHARED — written together, then frozen
    ├── fixtures.ts               B writes first, A consumes
    └── assess/                   B   (all of it)
        ├── index.ts                  entry point: assessImage()
        ├── prompt.ts                 the FGS rubric
        ├── schema.ts                 Zod schema for model output
        ├── client.ts                 Azure OpenAI wiring
        ├── gating.ts                 refuse-to-score logic
        ├── scoring.ts                normalization + threshold
        └── scoring.test.ts           unit tests
eval/                             B
├── images/
├── cases.json
└── run.ts
public/demo/                      A   (cached demo photos)
```

**A never opens `lib/assess/`. B never opens `components/`.**

---

## Phase −1 — Model access ✅ DONE

**Verified working**, against our own dedicated Azure resource. See
[`MODEL-ACCESS.md`](MODEL-ACCESS.md) for the confirmed config and the findings that
change the build, and the prompt spec — **the highest-numbered `docs/PROMPT-V*.md`**, now
[`PROMPT-V0.1.md`](PROMPT-V0.1.md) — for the exact prompt and schema. Start from that
file, not a blank page. ([`PROMPT-V0.md`](PROMPT-V0.md) is superseded but retained: it is
what produced the MODEL-ACCESS numbers.)

Config: Entra ID auth (no API keys), **`gpt-4.1`** on `api-version=2025-01-01-preview`,
`json_schema` + `strict: true`, 5–7 s per call.

Three findings materially change what Phase 2 has to build:

- **`temperature: 0` is not deterministic.** The eval set must run each image several
  times, and the demo must serve cached responses.
- **Therefore `assessImage` samples 3× and takes the mode per action unit** (see the
  contract note below). This is not optional polish — it's what makes abstention usable.
- **Do not display `confidence`.** The number the model returns is a fixed per-feature
  prior, not a per-photo judgement. Band by the paper's published reliability instead.

Keep `client.ts` provider-agnostic anyway so local development can fall back to an
OpenAI or GitHub Models key if the Azure resource becomes unavailable.

> **Both of us need access.** The resource is AAD-only; ask for the
> **Cognitive Services OpenAI User** role, then `az login` and you're done. There is no
> key to copy around, and nothing secret to put in `.env.local` beyond the endpoint name.

---

## Phase 0 — Together, ~90 minutes. ✅ DONE

Done on one machine, screen-shared. It is the contract everything else depends on.

1. Scaffold: `npx create-next-app@latest . --typescript --app --tailwind --eslint`
2. **Install every dependency you expect to need, now, in one commit** — `zod`, the model
   SDK, `vitest`, and any upload helper. `package.json` and the lockfile are the one pair
   of files both people will otherwise touch daily, and lockfile conflicts are miserable
   to resolve. Adding a dep later is fine; just announce it and merge to `main` promptly.
   *(`@azure/identity` was added later for keyless Azure auth —
   `getBearerTokenProvider` lives there. Run `npm install` after pulling.)*
3. Write `src/lib/contract.ts` together (draft below).
4. Write `src/lib/fixtures.ts` — four hardcoded results: healthy cat, painful cat,
   rejected image, partial-scorable (whiskers not visible).
5. Stub `src/lib/assess/index.ts` to return a fixture after a 1.5s delay.
6. Confirm `npm run dev` runs on both machines.
7. **Commit and push to `main` before anyone branches.**

### The contract — live, and FROZEN

**Phase 0 is done.** The contract lives in **[`src/lib/contract.ts`](../src/lib/contract.ts)**.
Read it there, not here. A second copy in this document would drift, and a drifting copy
of a frozen contract is worse than no copy at all.

It was revised once after this document's Phase −1 findings merged — Phase 0 landed
first and had encoded a superseded draft. The four changes worth knowing before you open
the file:

- **`confidence` is gone. `agreement` replaced it.** The model's own confidence number is
  a fixed per-feature prior, not a per-photo judgement (`MODEL-ACCESS.md` #2). `agreement`
  counts how many runs backed the winning score. **Its denominator is `meta.samples`, not
  a hardcoded 3** — runs can fail or be dropped by the status vote.
- **`SAMPLES_PER_ASSESSMENT = 3`, `MIN_CONTRIBUTING_SAMPLES = 2`, and five vote-resolution
  rules.** "Take the mode" was under-specified in ways `scoring.ts` cannot guess: how
  failed runs are discarded, that status is voted before action units, what happens on a
  status tie, how score ties break, and which run's `evidence` prose survives.
- **`Assessment.meta`** records model, prompt version and contributing sample count.
  Finding #6: `gpt-4.1` and `gpt-4o` score the same photo differently, so the model ID is
  part of the measurement and an eval number is meaningless without it.
- **Caveat `low_confidence` → `low_agreement`.**

Changing any of it still requires both people to agree, and now breaks a real build
rather than a hypothetical one.

Once this is on `main`, **freeze it**. Any change requires both people to agree, because
it breaks the other person's build.

---

## Phase 1 — Parallel. Get both halves independently alive.

### Person A
- Upload UI: drag-drop + file picker + tap-to-upload on mobile.
- Image preview before submit.
- **Client-side downscale to ~1024px longest edge before upload.** Phone photos are
  4–12 MB; this cuts latency and token cost substantially. Use a `<canvas>`.
- Known gotcha: iPhone `.heic` files won't decode in canvas in some browsers. Detect the
  failure and show "Please upload a JPEG or PNG" rather than dying silently.
- Loading state with realistic timing (model calls take 3–8s — design for it, don't fight it).
- `POST /api/assess` route handler — accepts multipart, calls `assessImage()`, returns
  `AssessResult`. Keep it thin. Validate size/MIME here.

### Person B
- **Most of the original Phase 1 is already done** — see `MODEL-ACCESS.md` and the prompt
  spec. Credentials work, the prompt works, the schema works. Don't re-derive it.
- **Use the highest-numbered `docs/PROMPT-V*.md`** — currently
  [`PROMPT-V0.1.md`](PROMPT-V0.1.md). Port it into `prompt.ts` and `schema.ts` verbatim,
  then get one hardcoded image running through it from inside the Next.js app rather than
  a scratch script. Set `meta.promptVersion` to match the file you ported.
  > ⚠️ v0.1 is **unverified** — it fixes a real scoring defect (`FGS-RESEARCH.md` F1) but
  > has not been run. Work through its verification checklist as part of this step, and
  > treat `MODEL-ACCESS.md`'s numbers as describing v0 only.
- `client.ts` — AAD token acquisition (`DefaultAzureCredential`), `temperature: 0`,
  sensible timeout, typed error handling. On schema-parse failure, retry once, then
  reject cleanly.
- **Implement the 3× sample-and-vote in `score.ts`.** Fire the calls in parallel, take
  the mode per AU, and record `agreement`. This is the real Phase 1 work now, and
  everything about how trustworthy the demo feels depends on it.

**Checkpoint 1:** A has a working upload→mock→render loop. B has voted, aggregated JSON
coming back from the model. Neither has touched the other's files.

---

## Phase 2 — Parallel. Build the substance.

### Person A
- `ActionUnitCard` — label, score chip (0/1/2 or "Not assessable"), evidence text, and
  an **agreement** indicator ("all 3 runs agreed" / "2 of 3").
- **Do not render the model's `confidence` field.** It's a fixed per-feature prior, not a
  per-photo judgement (`MODEL-ACCESS.md` #2). Showing it would fake exactly the precision
  we're claiming to be honest about. Use `agreement` instead — we computed that ourselves.
- **Weight the visual hierarchy by reliability.** In the original validation, inter-rater
  agreement was: head 0.90, ears 0.87, eyes 0.86, muzzle 0.63, whiskers 0.55. Present
  muzzle and whiskers as lower-confidence by default. This is a real finding, not decoration.
- `ScoreDial` — normalized score with the 0.39 threshold marked on the scale.
- `RejectionCard` — the refusal state with retake tips. Make this look deliberate and
  designed, not like an error. Judges will test it.
- `CaveatBanner` — renders `Caveat[]`.
- Persistent footer disclaimer: not a diagnosis, acute pain only, see a vet.

### Person B
- `gating.ts` — is it a cat, is the face visible, is it roughly frontal, is quality
  adequate, is there exactly one cat. Fold into the main call or a cheap pre-call.
- `scoring.ts` + **unit tests**:
  - `normalized = sum(scored) / (2 × count(scored))`
  - `aboveThreshold = normalized > 0.39`
  - `scorableCount < 3` → reject with `too_few_scorable_aus`, do **not** report a score
  - Test: all zeros, all twos, whiskers null, three nulls, empty.
  - This is the one place a silent bug produces a confidently wrong medical-ish number.
    It is pure arithmetic and trivially testable. Test it.
- Caveat generation: brachycephalic breed detected (Persian/Himalayan/Exotic — explicitly
  excluded from FGS validation), very dark coat (landmarking failed for black cats in the
  original study), and always the acute-vs-chronic caveat.
- `eval/` — 20–40 photos, expected outcome per photo in `cases.json`, a `run.ts` that
  scores them all and prints a table.

> **Be realistic about what the eval can prove.** You can easily source relaxed, healthy
> cats and non-cat images. You cannot source *labeled painful* cats — those live in
> veterinary datasets you don't have. So the eval measures two things: does it stay near
> zero on comfortable cats (over-scoring), and does it refuse correctly on junk input
> (gating). It cannot measure sensitivity. Don't burn hours hunting for painful-cat
> images, and don't claim accuracy numbers you haven't earned — say exactly this to the
> judges instead. It lands better than a fabricated percentage.

**Checkpoint 2:** Swap the stub for the real `assessImage`. First end-to-end run.
Expect it to be wrong in interesting ways — that's what Phase 3 is for.

---

## Phase 3 — Parallel. Ship and tune.

### Person A
- Deploy to **Azure App Service (Linux, Node 20)**. One target, no containers.
- Config via App Service application settings. **Never commit a key.** Prefer Managed
  Identity to Azure OpenAI if you have time; a key in app settings is acceptable if not.
- Error boundaries — model timeout, rate limit, malformed response all need real UI.
- Mobile layout. People will demo this on a phone.
- Cache 3–4 demo photos + their responses in `public/demo/` so the live demo cannot fail
  on a rate limit.

### Person B
- Run the eval set. Iterate the prompt. Watch specifically for:
  - Over-scoring — a relaxed cat read as painful. This is the failure mode that destroys
    trust fastest.
  - Refusing to use `null`. Models hate admitting uncertainty; you may need to push hard
    in the prompt.
  - Evidence text that restates the score instead of describing the image.
- Freeze the prompt once the eval is stable. Stop tuning before the demo, not during.

---

## Phase 4 — Together. Rehearse.

Run the demo end to end three times, including the rejection path and one real phone
photo. Fix only what breaks. No new features.

---

## Git workflow

- Short-lived branches: `feat/app-upload`, `feat/assess-scoring`. Merge to `main` daily
  or more. No long-lived branches — with two people they cause more pain than they prevent.
- `.gitignore` must cover `.env*.local`. Verify before the first push.
- If you touch `contract.ts` after Phase 0, tell the other person immediately.

---

## Deliberately out of scope

No auth. No database. No image persistence — process in memory and discard, which is
both faster to build and a better answer when a judge asks about privacy of people's pet
photos. No history tracking. No multi-photo. No PDF export.

---

## Attribution

The Feline Grimace Scale is © Université de Montréal. The source paper (Evangelista et
al., *Scientific Reports* 9:19128, 2019) is open access under CC BY — the action-unit
definitions may be quoted with attribution. The training manual and illustrations on
felinegrimacescale.com are All Rights Reserved: **write our own rubric text, do not embed
their images.** Credit the scale and link to felinegrimacescale.com in the UI.
