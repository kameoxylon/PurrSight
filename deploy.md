# Deploying PurrSight to Azure App Service

This is the **as-built record** of how PurrSight is hosted, plus how to
recreate or operate it. The app runs on **Azure App Service (Linux, Node 22)**.
CI builds the Next.js standalone bundle on Linux and ships it via a **publish
profile**; **no Azure login happens in CI**, and **no API key** is used —
the app authenticates to Azure OpenAI with the App Service's **managed
identity**.

> Subscription: **Yitzak's Visual Studio Enterprise** (`3d6b372e-…-60808011e60c`).
> Resource group: **`purrsight`** (in West US 2).
> App Service plan: **`purrsight-plan`** (F1, **West US 3** — see the quota note).
> Web app: **`purrsight`** → https://purrsight.azurewebsites.net
> Azure OpenAI: **`foundry-purrsight`** (AI Services account), deployment `gpt-4.1`.

---

## 0. Permissions — the part that actually cost us time

Access to this subscription is **guest (Entra B2B)**, scoped narrowly. Two
operations are **subscription-level** and a resource-group–scoped role (even
Contributor *on the RG*) **cannot** perform them:

1. **Registering a resource provider** (`Microsoft.Web/register/action`).
2. **Assigning roles** (`Microsoft.Authorization/roleAssignments/write`).

Both must be done by the **subscription owner (Yitzak)**. On 2026-09-15 he ran,
once:

```bash
# (owner) register the App Service provider — required before ANY Microsoft.Web
# resource can be created; every compute provider in this sub started NotRegistered.
az provider register --namespace Microsoft.Web --subscription 3d6b372e-a136-4435-8d35-60808011e60c

# (owner) elevate the deploying user so they can finish solo:
az role assignment create --assignee <USER_OBJECT_ID> --role "Contributor" \
  --scope /subscriptions/3d6b372e-a136-4435-8d35-60808011e60c
az role assignment create --assignee <USER_OBJECT_ID> --role "User Access Administrator" \
  --scope /subscriptions/3d6b372e-a136-4435-8d35-60808011e60c
```

> **Why the elevation?** Provider registration alone unblocks *creating* the
> App Service, but the managed-identity role grant in §2 also needs
> `roleAssignments/write`. Granting the user **User Access Administrator** lets
> them do that grant themselves instead of round-tripping to the owner a second
> time. For a hackathon this is acceptable; **remove these two assignments when
> the event ends** (see §6).

Confirm the provider is ready and you're on the right tenant/sub before
continuing:

```bash
az account show --query "{sub:name, tenant:tenantId}" -o table
az provider show --namespace Microsoft.Web --query registrationState -o tsv   # -> Registered
```

> If `az login` has expired (the CLI credential lapses periodically), re-run:
> `az login --tenant e8670eae-3d20-4022-a890-61b0f024d9ed --allow-no-subscriptions`
> — the `--allow-no-subscriptions` flag is needed because the guest has
> resource access but no subscription *listed* under it.

---

## 1. Create the App Service

> **Already provisioned** — this documents how, and how to recreate.

### Quota reality
This subscription has **0 App Service quota** in westus2, eastus, westus, and
eastus2 (for **both** F1 and B1). **West US 3** was the first region with
free-tier capacity, so the plan lives there. A plan in a different region from
its resource group is fine.

```bash
# Plan — Linux, Free tier (F1). B1 was attempted first but quota is 0 here too.
az appservice plan create \
  --name purrsight-plan \
  --resource-group purrsight \
  --location westus3 \
  --is-linux \
  --sku F1

# Web app. App Service Linux no longer offers NODE:20-lts (only 22/24/26).
# We run NODE:22-lts. The repo's engines pin (>=20 <21) is advisory only (no
# engine-strict), and the one native dep (sharp) is never invoked at runtime —
# the UI uses plain <img> and an `unoptimized` next/image — so building on
# 20/22 and running on 22 is safe.
az webapp create \
  --name purrsight \
  --resource-group purrsight \
  --plan purrsight-plan \
  --runtime "NODE:22-lts"
```

> `purrsight` must be globally unique across `*.azurewebsites.net`. If taken,
> use a suffix and update `AZURE_WEBAPP_NAME` in
> `.github/workflows/deploy.yml`.

### Startup command
Next's standalone bundle is launched with `server.js`. On App Service Linux the
`HOSTNAME` env var is set to the container's own name, which makes Next bind to
the wrong host and fail the platform health check — force `0.0.0.0`:

```bash
az webapp config set \
  --name purrsight \
  --resource-group purrsight \
  --startup-file "HOSTNAME=0.0.0.0 node server.js"
```

### App settings
App Service supplies `PORT` automatically; Next standalone reads it. The rest
mirror `.env.example`. **`AZURE_OPENAI_API_KEY` is intentionally absent** — a
blank/absent key makes `client.ts` fall back to `DefaultAzureCredential`, i.e.
the managed identity configured in §2.

```bash
az webapp config appsettings set \
  --name purrsight \
  --resource-group purrsight \
  --settings \
    MODEL_PROVIDER=azure \
    AZURE_OPENAI_ENDPOINT=https://foundry-purrsight.cognitiveservices.azure.com \
    AZURE_OPENAI_DEPLOYMENT=gpt-4.1 \
    AZURE_OPENAI_API_VERSION=2025-01-01-preview \
    ASSESS_TIMEOUT_MS=30000 \
    SCM_DO_BUILD_DURING_DEPLOYMENT=false \
    WEBSITES_CONTAINER_START_TIME_LIMIT=600
```

> `SCM_DO_BUILD_DURING_DEPLOYMENT=false` — CI ships a **prebuilt** standalone
> bundle; we do **not** want App Service's Oryx builder running `npm install`
> on the artifact. `WEBSITES_CONTAINER_START_TIME_LIMIT=600` gives the app
> generous headroom to boot on the small F1 instance.

---

## 2. Managed identity → Azure OpenAI (no keys)

Give the web app an identity and let it call the model. This is the production
equivalent of `az login` locally, and it never expires.

```bash
# Enable a system-assigned identity; capture its principalId.
az webapp identity assign --name purrsight --resource-group purrsight \
  --query principalId -o tsv

# Grant that identity permission to CALL the model (data-plane).
# NOTE: "Cognitive Services OpenAI User", NOT Contributor — Contributor is
# control-plane only and returns 401/403 on /chat/completions.
az role assignment create \
  --assignee-object-id <PRINCIPAL_ID_FROM_ABOVE> \
  --assignee-principal-type ServicePrincipal \
  --role "Cognitive Services OpenAI User" \
  --scope /subscriptions/3d6b372e-a136-4435-8d35-60808011e60c/resourceGroups/purrsight/providers/Microsoft.CognitiveServices/accounts/foundry-purrsight
```

> This grant needs `roleAssignments/write` — that's why the user was given
> **User Access Administrator** in §0. In a locked-down environment the owner
> runs this step instead.

---

## 3. Wire up GitHub deployment

### a. Get the publish profile (a credential — keep it out of the repo)

```bash
# Write it OUTSIDE the working tree so it can never be git-committed.
az webapp deployment list-publishing-profiles \
  --name purrsight --resource-group purrsight --xml \
  > "$HOME/purrsight-pubprofile.xml"
```

### b. Add it as a GitHub secret

Repo **Settings → Secrets and variables → Actions → New repository secret**:

- **Name:** `AZURE_WEBAPP_PUBLISH_PROFILE`
- **Value:** the full XML contents of the file above

Then delete the local copy: `rm "$HOME/purrsight-pubprofile.xml"`.

> Setting the secret requires **admin** on the GitHub repo. An EMU/enterprise
> account without admin gets HTTP 403 from `gh secret set` — add it via the web
> UI with an account that has admin, or ask the repo owner.

### c. Deploy

`.github/workflows/deploy.yml` runs on every push to `main` (and manually via
**Actions → Deploy to Azure App Service → Run workflow**). It:

1. `npm ci` (Node 22, on Linux — installs the correct native binaries)
2. `npm run build` → `.next/standalone`
3. copies `public/` and `.next/static` into the standalone bundle
4. deploys that bundle via the publish profile

Merging to `main` triggers it. Watch the **Actions** tab.

---

## 4. Verify

```bash
az webapp browse --name purrsight --resource-group purrsight
# → https://purrsight.azurewebsites.net
```

Upload a photo (or a demo cat) and confirm you get a **real score**, not an
error card. To watch the model calls server-side:

```bash
az webapp log tail --name purrsight --resource-group purrsight
# look for: [assess] <id> assessed in N.Ns | 3/3 samples | ... band ...
```

---

## 5. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| **Application Error / 503** on first load | Cold start on F1 — wait ~30–60s and retry. Persistent → `az webapp log tail`. |
| App boots but 500s immediately | Startup command must be exactly `HOSTNAME=0.0.0.0 node server.js`. |
| Static assets / demo images 404 | CI's *Assemble standalone bundle* step didn't copy `public/` + `.next/static` — check the Actions log. |
| Upload returns an **error card**, logs show `does not match resource tenant` | Only happens **locally**, not in prod. Prod uses the in-tenant managed identity. Locally, `az login` is pointed at the wrong tenant — re-login (see §0). |
| Logs show **401 / 403 / PermissionDenied** on the model call | The managed identity is missing **Cognitive Services OpenAI User** on `foundry-purrsight` (§2). Contributor is not enough. |
| `DeploymentNotFound` | `AZURE_OPENAI_DEPLOYMENT` must be the **deployment** name (`gpt-4.1` here), which can differ from the model name. |
| Deploy step fails with an auth error | Publish profile rotated — regenerate and re-set the secret (§3a/b). |
| `gh secret set` → **HTTP 403** | The GitHub account lacks repo admin — add the secret via the web UI. |
| Plan create → `quota` / `No available instances` | No App Service capacity in that region — try another (westus3 worked). |

---

## 6. Teardown / cost control

- Everything lives in the **`purrsight`** resource group. Delete it to stop all
  spend: `az group delete --name purrsight`.
- **Revoke the hackathon elevation** when done — remove the two broad grants
  from §0:
  ```bash
  az role assignment delete --assignee <USER_OBJECT_ID> --role "Contributor" \
    --scope /subscriptions/3d6b372e-a136-4435-8d35-60808011e60c
  az role assignment delete --assignee <USER_OBJECT_ID> --role "User Access Administrator" \
    --scope /subscriptions/3d6b372e-a136-4435-8d35-60808011e60c
  ```
- **Never commit** the publish profile or any key. `.gitignore` already
  excludes `.env*`; the publish profile is written outside the repo on purpose.
