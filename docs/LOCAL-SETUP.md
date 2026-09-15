# Local setup — running the real model pipeline

Getting PurrSight talking to Azure OpenAI on your own machine.

If you only want to work on the UI you can skip most of this: with no `.env.local`
at all the app still builds and runs, it just can't score a photo.

---

## TL;DR

```bash
nvm use 20                 # the repo pins node >=20 <21
npm ci
cp .env.example .env.local # then fill in the endpoint, see below
az login                   # auth is Entra ID, not an API key
npm run dev
```

Then POST a photo and watch the server console:

```bash
curl -X POST http://localhost:3000/api/assess \
  -F "image=@public/demo/tabby.jpg;type=image/jpeg"
```

---

## 1. Node 20, and use `npm ci`

`package.json` pins `"node": ">=20 <21"`. Newer Node ships a newer npm, and
**`npm install` on Node 24 silently rewrites `package-lock.json`** — it strips
`"libc": ["glibc"]` from sharp's Linux binary entries. That field decides which
native binary gets installed on Linux, which is what App Service runs, so the
rewrite can break the deployed build while everything still looks fine locally.

Use `npm ci`. If you already ran `npm install` and see ~144 deletions in the
lockfile, that's this: `git checkout -- package-lock.json`.

## 2. Yes, you create `.env.local` yourself

It is **not** in the repo and never will be — `.gitignore` excludes `.env*`, and
this repository is public. `.env.example` is the source of truth for variable
*names*; copy it and fill in the values.

```ini
MODEL_PROVIDER=azure
AZURE_OPENAI_ENDPOINT=https://foundry-purrsight.cognitiveservices.azure.com
AZURE_OPENAI_API_KEY=
AZURE_OPENAI_DEPLOYMENT=gpt-4.1
AZURE_OPENAI_API_VERSION=2025-01-01-preview
```

Three things people get wrong here:

- **Leave `AZURE_OPENAI_API_KEY` blank.** It is optional and we don't use it.
  `client.ts` uses it only if it is set; otherwise it falls back to
  `DefaultAzureCredential`, which is what we want both locally and in
  production. A blank value is correct, not a missing step.
- **The domain is `.cognitiveservices.azure.com`,** because the resource is an
  Azure AI Services (`AIServices`) account. Classic Azure OpenAI resources use
  `.openai.azure.com`. Copy whatever `az` reports:
  ```bash
  az cognitiveservices account show -n foundry-purrsight -g purrsight \
    --query properties.endpoint -o tsv
  ```
- **`2025-01-01-preview` is required,** not cosmetic. Older API versions accept
  `strict: true` on the JSON schema and then quietly ignore it, so the model is
  free to return values outside the enum. See `docs/MODEL-ACCESS.md`.

## 3. You need a data-plane role — `Contributor` is not enough

This is the one that wastes an afternoon.

Auth is Entra ID (`az login`), so your **user account** needs permission to call
the model. The role you need is **`Cognitive Services OpenAI User`**.

`Contributor` looks like it should cover this and does not:

| Role | `dataActions` | Can call `/chat/completions`? |
| --- | --- | --- |
| Contributor | `[]` | **No** |
| Cognitive Services OpenAI User | includes `.../deployments/chat/completions/action` | Yes |

Contributor is control-plane only — it lets you *manage* the resource (and read
its keys) but not *invoke* it. With Contributor alone you will configure
everything correctly and still get 401/403 on every call.

Check what you have:

```bash
az role assignment list \
  --scope $(az cognitiveservices account show -n foundry-purrsight -g purrsight --query id -o tsv) \
  --include-inherited --query "[].{role:roleDefinitionName, principal:principalName}" -o table
```

If `Cognitive Services OpenAI User` isn't listed against your principal, ask the
resource owner to grant it. In production the same role is granted to the App
Service's system-assigned managed identity instead of to a person.

## 4. Confirm you're on a commit that has the pipeline

```bash
ls src/lib/assess/client.ts
```

If that file doesn't exist you're on a commit from before the Phase 1 pipeline
landed, and `assessImage()` is still the Phase 0 stub that returns fixtures
without contacting Azure. That stub needs no credentials at all — which is also
why "nothing happens" rather than "auth failed" when you run it.

## 5. Verify it actually reached the model

There is no spinner to trust; read the server console. A successful assessment
logs one line per sample plus one summary, tied together by a correlation id:

```
[assess] pxplx3 start | image/jpeg ~196KB | 3 samples
[assess] pxplx3.1 ok in 8641ms | finish=stop tokens=1531in (1280 cached)/191out ~$0.002670 | ears=0 eyes=0 muzzle=0 whiskers=0 head=0
[assess] pxplx3.2 ok in 8087ms | ...
[assess] pxplx3.3 ok in 7670ms | ...
[assess] pxplx3 assessed in 8.7s | 3/3 samples | 4593in 3840cached/568out ~$0.007970 ($7.97/1k) | ears=0(3/3) ... | 0/10 = 0.00 minimal | scorable 5/5
```

`3 samples` is expected and not a bug: we call the model three times per image
and vote, because `temperature: 0` is **not** deterministic for this task. The
`(3/3)` after each action unit is how many samples agreed.

Cost runs ~$0.008–0.015 per assessment depending on prompt cache; budget with
the higher number. See `docs/MODEL-ACCESS.md`.

---

## 6. Optional: the "vets near me" map

`NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY` enables the embedded map in *What we
recommend*. **You do not need it.** Leave it blank and that section falls back
to a plain Google Maps link, which is what the app did before the map existed —
nothing breaks and the demo is unaffected.

If you do set it, two things are easy to get wrong:

- The `NEXT_PUBLIC_` prefix is deliberate. The Maps Embed API key is read by the
  browser, so Next inlines it into the client bundle **at build time**. It is
  public by design — restrict it in Google Cloud Console to the *Maps Embed API*
  and to your hostnames (`http://localhost:3000/*` for local). Never paste an
  unrestricted key here.
- Because it is baked in at build time and our build runs in GitHub Actions,
  **setting this one in App Service does nothing** — the bundle was already
  built without it. It has to be set on the build step and redeployed. Every
  other variable in `.env.example` is read at runtime and does belong in App
  Service configuration.

The map never asks for your location on page load — only when you tap
*Show vets near me*. Denying the prompt falls back to the link.

---

## Troubleshooting

| What you see | What it means |
| --- | --- |
| `AZURE_OPENAI_ENDPOINT is not set (see .env.example)` | No `.env.local`, or you created it but didn't restart `npm run dev` — Next reads env at boot. |
| 401 / 403 / `PermissionDenied` | Almost always §3: you have Contributor but not `Cognitive Services OpenAI User`. Second most likely: `az login` expired, or `az account show` points at the wrong subscription. |
| `DefaultAzureCredential failed to retrieve a token` | Not logged in. Run `az login`. |
| `DeploymentNotFound` | `AZURE_OPENAI_DEPLOYMENT` must be the **deployment** name, which can differ from the model name. List them with `az cognitiveservices account deployment list -n foundry-purrsight -g purrsight -o table`. |
| Results come back instantly, always identical, no `[assess]` logs | You're on the Phase 0 stub — see §4. |
| HTTP 502, *"Something went wrong on our end"* | May be a genuine fault, but Azure content safety also rejects some legitimate low-quality cat photos with a 400 that we currently map to this. Known gap, tracked in `docs/PLAN.md`. |
| Lockfile shows ~144 unexpected deletions | Node version mismatch — see §1. |
