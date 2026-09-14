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

`POST {endpoint}/openai/deployments/{deployment}/chat/completions?api-version=2024-10-21`
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

> ⚠️ **The endpoint URL is deliberately not committed.** This repo is public, and the
> resources we tested against live in a shared internal sandbox subscription. The URL
> isn't a credential (the endpoint is AAD-protected), but internal infrastructure names
> don't belong in a public repo.

> ⚠️ **Confirm we're allowed to use the resource we tested against.** It sits in a
> resource group that belongs to another team's POC. Fine for a smoke test; before we
> depend on it for a demo, either get the nod or stand up our own Azure OpenAI resource.

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

### 2. Confidence calibration — ✅ RESOLVED by `gpt-4.1`

On `gpt-4o` every action unit returned `confidence: 0.9` regardless of how visible the
feature actually was — a plausible-looking constant, not introspection.

`gpt-4.1`, prompted to vary it, returns genuinely differentiated values:

```
ears     score=0    conf=0.95   "Ears are upright and facing forward."
eyes     score=1    conf=0.8
muzzle   score=0    conf=0.7    "no clear tension visible"
whiskers score=NULL conf=0      "Whiskers blend into the light background"
head     score=1    conf=0.7
```

The ordering is sensible — clearly visible ears rate highest, invisible whiskers rate
zero. Still worth sanity-checking against the FGS's published inter-rater reliability
(head 0.90, ears 0.87, eyes 0.86, muzzle 0.63, whiskers 0.55) rather than trusting it blindly.

### 3. Abstention — ✅ RESOLVED by `gpt-4.1` + a firmer prompt

`gpt-4o` never once emitted `null`. `gpt-4.1` correctly abstained on whiskers with a
usable reason, on the very first try.

What made the difference: stating that abstention is **required, not optional**, listing
concrete cases that must be null, and adding "expect to return at least one null on a
typical photo." Permission alone ("you may answer null") was not enough.

### 4. Schema enforcement — ✅ RESOLVED by strict structured outputs

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

Same photo: `gpt-4o` returned all zeros; `gpt-4.1` returned `eyes=1` and `head=1`.
Both land at the same verdict — 2 ÷ (2 × 4 scorable) = **0.25**, under the 0.39
threshold — but 4.1 is readier to assign a 1.

**Consequence:** the eval set must be re-run from scratch if the model or its version
ever changes. Treat the model ID as part of the measurement, exactly like the resize
parameters. Pin it in config and don't drift.

### 7. Large payloads are flaky 🟡

One 5.9 MB base64 request returned `500 server_error`. The 135 KB requests never failed.
Another reason the client-side downscale is load-bearing, not cosmetic.

---

## Sanity check on the happy path

The relaxed test cat scored **2 out of a possible 8** (whiskers abstained), normalizing
to **0.25** — correctly under the 0.39 analgesia threshold. On `gpt-4o` the same photo
scored 0/10, consistently across 6 runs. Both reach the right verdict.

Baseline behaviour on a comfortable cat looks right, which is the one thing the eval set
can actually prove.

## The prompt that produced this

Recorded verbatim in `PLAN.md` terms: what mattered was (a) `strict: true` structured
outputs, (b) framing abstention as **required, not permitted**, with concrete examples,
and (c) explicitly telling the model not to emit a constant confidence. Person B should
start from this rather than from a blank page.
