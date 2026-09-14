# Phase −1 — Model Access: VERIFIED ✅

Vision assessment works end to end. Recorded here so Person B doesn't re-derive it.

## Verified working configuration

| | |
|---|---|
| Auth | **Entra ID (AAD) bearer token — no API keys** |
| Resource kind | Azure AI Services / Azure OpenAI |
| Deployment tested | `gpt-4o` (2024-11-20) |
| API version | `2024-10-21` |
| Structured output | `response_format: { type: "json_object" }` — works |
| Latency | 4–8 s per assessment |

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
AZURE_OPENAI_DEPLOYMENT=gpt-4o
AZURE_OPENAI_API_VERSION=2024-10-21
```

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

### 2. Confidence values are not calibrated 🟠

Every action unit in every call came back at `confidence: 0.9` — including ones the
model got wrong, and ones where the feature was barely visible. The model is not
introspecting; it's emitting a plausible-looking constant.

**Consequence:** shipping this number as-is would be actively misleading, which
undercuts the entire explainability pitch. Either derive confidence from something real,
or drop the numeric display and use the FGS's own published inter-rater reliability to
band the AUs instead (head/ears/eyes = higher trust, muzzle/whiskers = lower).

### 3. The model will not abstain on its own 🟠

Zero `null` scores across all runs, including on a photo where whiskers were genuinely
ambiguous. Exactly the failure predicted in `PLAN.md` — models strongly prefer producing
an answer over admitting uncertainty.

**Consequence:** "you may answer null" in the prompt is not enough. Person B will need
to push much harder — few-shot examples of correct abstention, or a separate visibility
pass that runs before scoring.

### 4. Gating works, but the schema doesn't hold 🟡

The non-cat test (a collage of dogs) was correctly **rejected** — good. But the model
returned free prose in an enum field:

```json
"rejectionReason": "The image contains dogs, not cats, and the Feline Grimace Scale is..."
```

Expected one of `no_cat_detected | face_not_visible | image_quality | multiple_cats`.

**Consequence:** `json_object` mode guarantees *valid JSON*, not *your schema*. Use real
structured outputs with a JSON Schema, and validate with Zod on the way out regardless.
Treat a schema violation as a failed call and retry once.

### 5. Large payloads are flaky 🟡

One 5.9 MB base64 request returned a `500 server_error`. The 135 KB requests succeeded
first try every time. Another reason the client-side downscale is load-bearing rather
than nice-to-have.

---

## Sanity check on the happy path

The relaxed test cat scored **0 out of 10** (normalized 0.0), consistently across 6 runs,
correctly landing well under the 0.39 analgesia threshold. Baseline behaviour on a
comfortable cat looks right — which is the one thing the eval set can actually prove.
