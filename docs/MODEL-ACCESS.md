# Phase −1 — Model Access: VERIFIED ✅

Vision assessment works end to end. Recorded here so Person B doesn't re-derive it.

## Verified working configuration

| | |
|---|---|
| Auth | **Entra ID (AAD) bearer token — no API keys** |
| Resource kind | Azure AI Services (`AIServices`) with a custom subdomain |
| Region | **`eastus2`** — see the region warning below |
| Deployment | **`gpt-4.1`** (`2025-04-14`), GlobalStandard |
| API version | **`2025-01-01-preview`** (required for structured outputs) |
| Structured output | `response_format: json_schema` with `strict: true` |
| Latency | 5–7 s per assessment (~1250 prompt tokens) |

Auth token, already working from a normal `az login`:

```powershell
az account get-access-token --resource https://cognitiveservices.azure.com --query accessToken -o tsv
```

`POST {endpoint}/openai/deployments/{deployment}/chat/completions?api-version=2025-01-01-preview`
with header `Authorization: Bearer <token>`.

**Using AAD instead of keys means there is no secret to leak, rotate, or accidentally
commit** — and it maps directly to Managed Identity when we deploy to App Service.

### Discovering the endpoint (don't hardcode it — see note below)

```powershell
az cognitiveservices account list `
  --query "[?kind=='OpenAI'||kind=='AIServices'].{name:name,rg:resourceGroup,loc:location,endpoint:properties.endpoint}" -o table

az cognitiveservices account deployment list -n <account> -g <resourceGroup> `
  --query "[].{deployment:name,model:properties.model.name}" -o table
```

Put the result in `.env.local` (gitignored):

```
AZURE_OPENAI_ENDPOINT=https://<your-resource>.cognitiveservices.azure.com
AZURE_OPENAI_DEPLOYMENT=gpt-4.1
AZURE_OPENAI_API_VERSION=2025-01-01-preview
```

> ⚠️ **`westus2` has no Azure OpenAI models at all.** It does not appear even once in
> Microsoft's region availability table, and a resource created there lists only partner
> models (Mistral, Cohere, DeepSeek, Llama, Grok) — no `gpt-*`. Use **`eastus2`**,
> `eastus`, `westus3`, or `southcentralus`. Verify before creating anything.

> ⚠️ **Deleting a Cognitive Services account soft-deletes it.** Recreating with the same
> name then fails until you purge:
> `az cognitiveservices account purge -n <name> -g <rg> -l <old-region>`

> ⚠️ **`--custom-domain` is mandatory** when creating the resource. Without it, Entra ID
> auth is unavailable and you're forced back onto API keys.

> ⚠️ **The endpoint URL is deliberately not committed.** This repo is public. The endpoint
> is AAD-protected so the URL isn't a credential, but resource names still don't belong in
> a public repo. Use the discovery commands above and keep the value in `.env.local`.

> ✅ **We now have our own resource.** Phase −1 originally smoke-tested against another
> team's sandbox subscription, which was fine for a one-off but not something to demo on.
> The verified configuration above is a dedicated `AIServices` resource in a personal
> subscription, so there's no borrowed capacity and no one else's quota to exhaust
> mid-demo. Both of us need the **Cognitive Services OpenAI User** role on it:
>
> ```powershell
> az role assignment create --assignee <user> `
>   --role "Cognitive Services OpenAI User" --scope <resource-id>
> ```

---

## Findings that change the build

### 1. `temperature: 0` is NOT deterministic 🔴

An early run scored `eyes=1`; every subsequent run scored `eyes=0`. Repeating each image
3× at `temperature: 0`:

| | Size | Tokens | Latency | 3 runs |
|---|---|---|---|---|
| Original | 4524 KB | 1672 | 7.7 s | all zeros, 3/3 identical |
| Resized to 1024px | 135 KB | 828 | 5.4 s | all zeros, 3/3 identical |

Both sizes agree, so **resolution did not change the score** — the one-off `eyes=1` was
run-to-run variance on a borderline feature. `temperature: 0` reduces variance but does
not eliminate it.

**Consequences:**
- **The eval set must run each image several times**, not once. A single pass measures
  noise as much as behaviour, and a borderline AU can flip between runs.
- **Do not rely on `temperature: 0` for a reproducible demo.** Cache the responses for
  the demo photos and serve from cache. This was already in `PLAN.md` — now it's load-bearing.
- Report a borderline result honestly rather than implying precision the model doesn't have.

Resize is still worth doing — 33× smaller payload, half the tokens, 30% faster, and far
more reliable (see #5). Just pin the parameters in one shared constant and use the same
path in `eval/` and production, so the eval stays valid if either stream changes them.

### 2. Confidence varies now, but it is still not calibrated 🟠

`gpt-4o` returned `confidence: 0.9` for every action unit in every call. `gpt-4.1`,
asked to vary it, does — but the variation is not what it looks like.

Across 3 runs of the same photo, the confidence values were **byte-identical for every
AU**, even on the run where the whiskers score flipped to `null`:

```
run1  conf set = [0.6, 0.7, 0.8, 0.95]
run2  conf set = [0,   0.7, 0.8, 0.95]   <- only whiskers moved, and only because it abstained
run3  conf set = [0.6, 0.7, 0.8, 0.95]
```

Confidence tracks **which feature it is**, not **how visible that feature is in this
photo** — a fixed per-feature prior. Tellingly, the ordering it produces (ears highest,
whiskers lowest) closely mirrors the FGS's own published inter-rater reliability
(head 0.90, ears 0.87, eyes 0.86, muzzle 0.63, whiskers 0.55), which is in its training
data. It is reciting a known ranking, not examining the image.

**Consequence: do not display this number.** A per-photo confidence that is actually a
constant is worse than no confidence at all — it manufactures false precision in the
exact feature we're pitching as honest. Band the AUs by the paper's published reliability
instead, and say plainly that's what we're doing. We have no ground truth to calibrate
against in a hackathon, so don't imply we do.

### 3. Abstention now happens — but only about a third of the time 🟠

`gpt-4o` never once emitted `null`. `gpt-4.1` does. But a single success was misleading;
repeating each image 3× tells a different story:

| Image | Whiskers | Head |
|---|---|---|
| Washed-out whiskers against a light background | **null 1/3** | null 0/3 |
| Close-up control, whiskers unmistakable, shoulders cropped | null 0/3 ✅ | **null 1/3** |

Two things are true at once, and both matter:

- **It is not over-abstaining.** On the control photo, where every whisker is individually
  resolvable, it never abstained. The firmer "abstention is required" prompt did not
  cause blanket nulls — the risk of tripping `MIN_SCORABLE_AUS` and rendering a good
  photo unscorable did not materialise.
- **It is not reliably abstaining either.** On the hard photo it scored `whiskers=1`
  twice and called them "not clearly visible" once. On the cropped control it scored
  head position twice despite the shoulders being out of frame — there, the `null` was
  the *correct* answer and the two confident scores were the wrong ones.

So the model can tell which features are unscorable; it just acts on that knowledge
inconsistently. This is finding #1 resurfacing — run-to-run variance at `temperature: 0`
now infecting the abstain decision rather than the score.

**Consequence — sample N times and aggregate.** This is the single most important
implementation decision to come out of Phase −1:

- Call the model **3× per image** and take the **mode per action unit**.
- Treat an AU as unscorable when it comes back `null` in **at least half** the runs.
- Disagreement across runs is itself a useful signal — surface "the model was unsure
  about this feature" rather than hiding it.

Three parallel calls cost ~6 s wall-clock (they don't serialise) and roughly 3× tokens,
which at ~1250 prompt tokens is negligible. It converts our worst finding into an
ensemble, and it makes the demo defensible when a judge asks "would it say that again?"

### 4. Schema enforcement — ✅ genuinely fixed by strict structured outputs

Unlike #2 and #3, this one is not a behavioural tendency that might regress — strict mode
is grammar enforced server-side during decoding, so the model *cannot* emit a value
outside the enum.

`json_object` mode guarantees valid JSON, **not your schema**. On `gpt-4o` the rejection
came back as prose in an enum field:

```json
"rejectionReason": "The image contains dogs, not cats, and the Feline Grimace Scale is..."
```

With `response_format: json_schema` + `strict: true`, the same image returns:

```json
{ "status": "rejected", "rejectionReason": "no_cat_detected", "actionUnits": null }
```

Validate with Zod anyway — belt and braces — but the model is now constrained rather
than merely encouraged.

### 5. Gating works ✅

A collage of dogs was correctly rejected by both models. This is the behaviour judges
will probe, and it holds.

### 6. `gpt-4.1` scores differently from `gpt-4o` 🟠

Same photo, majority vote across 3 runs each:

| | ears | eyes | muzzle | whiskers | head | Normalized |
|---|---|---|---|---|---|---|
| `gpt-4o` | 0 | 0 | 0 | 0 | 0 | **0.00** |
| `gpt-4.1` | 0 | 1 | 0 | 1 | 1 | **0.30** |

Both land under the 0.39 threshold, so the verdict is unchanged — but 4.1 is
consistently readier to assign a 1. On a genuinely borderline cat that difference is
enough to flip the recommendation.

**Consequence:** the eval set must be re-run from scratch if the model or its version
ever changes. Treat the model ID as part of the measurement, exactly like the resize
parameters. Pin it in config and don't drift.

### 7. Large payloads are flaky 🟡

One 5.9 MB base64 request returned `500 server_error`. The 135 KB requests never failed.
Another reason the client-side downscale is load-bearing, not cosmetic.

---

## Sanity check on the happy path

Taking the mode across 3 runs, as finding #3 recommends:

| Photo | ears | eyes | muzzle | whiskers | head | Normalized | Verdict |
|---|---|---|---|---|---|---|---|
| Relaxed cat, light background | 0 | 1 | 0 | 1 | 1 | 3 ÷ 10 = **0.30** | under 0.39 ✅ |
| Close-up control | 0 | 0 | 0 | 0 | 0 | 0 ÷ 10 = **0.00** | under 0.39 ✅ |

Both comfortable cats land correctly below the analgesia threshold, and the visibly more
alert one scores higher than the placid one — the right ordering, even if neither is a
pain case.

**This is the ceiling of what we can currently claim.** We have no photographs of cats in
genuine pain with a veterinarian's FGS score attached, so we have tested that the system
does not cry wolf, and nothing about whether it detects pain when pain is present. Say
exactly that when demoing. Sourcing even a handful of scored painful cases would be the
highest-value thing Person B could do.

## The prompt and schema

Both are committed verbatim in **[`PROMPT-V0.md`](./PROMPT-V0.md)** — this is what
produced every result above. Start from it rather than a blank page; three specific
things in it are load-bearing and were each arrived at by a failed attempt first.
