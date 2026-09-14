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

**Verified working.** See [`MODEL-ACCESS.md`](MODEL-ACCESS.md) for the confirmed config
and findings that change the build — most importantly that **`temperature: 0` is not
deterministic**, so the eval set must run each image several times and the demo must
serve cached responses.

Auth is Entra ID (no API keys), `gpt-4o` on `api-version=2024-10-21`, 4–8 s per call.

Keep `client.ts` provider-agnostic anyway so local development can fall back to an
OpenAI or GitHub Models key if the Azure resource becomes unavailable.

---

## Phase 0 — Together, ~90 minutes. Nothing parallel until this lands.

Do this on one machine, screen-shared. It is the contract everything else depends on.

1. Scaffold: `npx create-next-app@latest . --typescript --app --tailwind --eslint`
2. **Install every dependency you expect to need, now, in one commit** — `zod`, the model
   SDK, `vitest`, and any upload helper. `package.json` and the lockfile are the one pair
   of files both people will otherwise touch daily, and lockfile conflicts are miserable
   to resolve. Adding a dep later is fine; just announce it and merge to `main` promptly.
3. Write `src/lib/contract.ts` together (draft below).
4. Write `src/lib/fixtures.ts` — four hardcoded results: healthy cat, painful cat,
   rejected image, partial-scorable (whiskers not visible).
5. Stub `src/lib/assess/index.ts` to return a fixture after a 1.5s delay.
6. Confirm `npm run dev` runs on both machines.
7. **Commit and push to `main` before anyone branches.**

### Draft contract

```ts
export const ACTION_UNITS = ['ears', 'eyes', 'muzzle', 'whiskers', 'head'] as const;
export type ActionUnitId = (typeof ACTION_UNITS)[number];

/** Validated rescue-analgesia cut-off from Evangelista et al. 2019. Do not tune. */
export const ANALGESIA_THRESHOLD = 0.39;

/**
 * Our own product decision, NOT from the paper. Normalizing over one or two action
 * units produces a number too noisy to show a user, so we refuse instead. Tune freely.
 */
export const MIN_SCORABLE_AUS = 3;

export interface ActionUnitAssessment {
  id: ActionUnitId;
  label: string;                  // "Ear position"
  score: 0 | 1 | 2 | null;        // null = not possible to score (FGS-legitimate)
  notScorableReason?: string;     // required when score === null
  evidence: string;               // what was observed, in plain language
  confidence: number;             // 0..1
}

export type RejectionReason =
  | 'no_cat_detected' | 'face_not_visible' | 'image_quality'
  | 'multiple_cats'   | 'too_few_scorable_aus';

export interface Caveat {
  kind: 'brachycephalic' | 'dark_coat' | 'acute_pain_only' | 'low_confidence';
  message: string;
}

export interface Assessment {
  actionUnits: ActionUnitAssessment[];
  scorableCount: number;
  rawScore: number;               // sum of scored AUs
  maxPossible: number;            // 2 * scorableCount
  normalizedScore: number;        // rawScore / maxPossible
  aboveThreshold: boolean;        // normalizedScore > 0.39
  band: 'minimal' | 'possible' | 'likely';
  caveats: Caveat[];
  recommendation: string;
}

export type AssessResult =
  | { status: 'assessed'; assessment: Assessment }
  | { status: 'rejected'; reason: RejectionReason; message: string; retakeTips: string[] };
```

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
- Get Azure OpenAI vision working at all — one hardcoded image, print the raw response.
  Do this first; credential setup is where hackathons die.
- Draft `prompt.ts` v1: the five AUs, 0/1/2 anchors, and an explicit instruction that
  `null` is a valid, encouraged answer when a feature isn't clearly visible.
- `schema.ts` — Zod schema matching the model's expected JSON. Use structured outputs /
  JSON mode. On parse failure, retry once, then reject cleanly.
- `client.ts` — `temperature: 0`, sensible timeout, typed error handling.

**Checkpoint 1:** A has a working upload→mock→render loop. B has real JSON coming back
from the model. Neither has touched the other's files.

---

## Phase 2 — Parallel. Build the substance.

### Person A
- `ActionUnitCard` — label, score chip (0/1/2 or "Not assessable"), evidence text,
  confidence indicator.
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
