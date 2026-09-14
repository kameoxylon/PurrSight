# Deploying PurrSight to Azure App Service

This deploys the Next.js app to **Azure App Service (Linux, Node 20)** using a
**publish profile** + **GitHub Actions**. You push to `main`, CI builds the
Next standalone bundle and ships it. No Azure login happens in CI.

> Subscription: **Yitzak's Visual Studio Enterprise** (guest access).
> Resource group: **`purrsight`** (already created).
> ⚠️ VS Enterprise has a **monthly credit cap + spend limit** — stay on the
> **Free (F1)** or **Basic (B1)** tier and a single region.

---

## 0. One-time: prerequisites

- You have **Contributor** on the subscription (confirmed).
- `az` CLI installed and logged into Yitzak's tenant:
  ```bash
  az login --tenant <YITZAK_TENANT_ID>
  az account set --subscription "Visual Studio Enterprise"
  az account show --output table   # confirm the right sub is active
  ```
- Find the region the `purrsight` resource group is in (keep everything there):
  ```bash
  az group show --name purrsight --query location -o tsv
  ```
  Use that value wherever `<REGION>` appears below (e.g. `eastus`).

---

## 1. Create the App Service (once)

```bash
# App Service plan — Linux, Free tier (F1). Use B1 if F1 quota is unavailable.
az appservice plan create \
  --name purrsight-plan \
  --resource-group purrsight \
  --location <REGION> \
  --is-linux \
  --sku F1

# The web app itself, running the Node 20 runtime.
az webapp create \
  --name purrsight \
  --resource-group purrsight \
  --plan purrsight-plan \
  --runtime "NODE:20-lts"
```

> `purrsight` must be **globally unique** across `*.azurewebsites.net`. If it's
> taken, append a suffix (e.g. `purrsight-app`) and update `AZURE_WEBAPP_NAME`
> in `.github/workflows/deploy.yml` to match.

### Set the startup command

The standalone bundle is launched with `server.js`. On App Service Linux the
`HOSTNAME` env var is set to the container's name, which breaks Next's bind —
so force it to `0.0.0.0`:

```bash
az webapp config set \
  --name purrsight \
  --resource-group purrsight \
  --startup-file "HOSTNAME=0.0.0.0 node server.js"
```

### App settings (env vars)

App Service supplies `PORT` automatically; Next standalone reads it. Add any
runtime secrets the model needs (Person B will fill these in later):

```bash
az webapp config appsettings set \
  --name purrsight \
  --resource-group purrsight \
  --settings NODE_ENV=production
  # later, e.g.:  AZURE_OPENAI_ENDPOINT=...  AZURE_OPENAI_API_KEY=...
```

---

## 2. Wire up GitHub deployment

### a. Get the publish profile

```bash
az webapp deployment list-publishing-profiles \
  --name purrsight \
  --resource-group purrsight \
  --xml > purrsight.publishsettings
```

This file is a **credential — do not commit it.** Open it and copy the entire
XML contents.

### b. Add it as a GitHub secret

In the GitHub repo: **Settings → Secrets and variables → Actions → New
repository secret**:

- **Name:** `AZURE_WEBAPP_PUBLISH_PROFILE`
- **Value:** paste the full XML

Then delete the local file:
```bash
rm purrsight.publishsettings
```

### c. Deploy

The workflow at `.github/workflows/deploy.yml` runs on every push to `main`
(and via **Actions → Deploy to Azure App Service → Run workflow**). It:

1. `npm ci`
2. `npm run build` (produces `.next/standalone`)
3. copies `public/` and `.next/static` into the standalone bundle
4. deploys it via the publish profile

Merge this branch to `main` (or trigger manually) and watch the **Actions** tab.

---

## 3. Verify

```bash
# Open the live site
az webapp browse --name purrsight --resource-group purrsight
# → https://purrsight.azurewebsites.net
```

Check the upload flow works end-to-end. Tail logs if it doesn't:

```bash
az webapp log tail --name purrsight --resource-group purrsight
```

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| **Application Error / 503** on first load | App Service cold-starts slowly on F1; wait ~30s and retry. Check `log tail`. |
| App starts but returns 500s | Confirm the startup command is exactly `HOSTNAME=0.0.0.0 node server.js`. |
| Static assets / images 404 | The `Assemble standalone bundle` step didn't run — ensure `public/` and `.next/static` were copied (they are in the workflow). |
| Deploy step fails with auth error | The publish profile secret is stale (regenerated). Re-run step 2a/2b. |
| `F1 quota exceeded` on plan create | Use `--sku B1` instead (small credit cost). |
| Model calls fail in prod | Person B's API keys aren't set — add them via `az webapp config appsettings set`. |

---

## Notes for the team

- **`assessImage` is still a stub** — the deployed site returns the fixture
  result until Person B wires the real model. Deploy is safe to do now; the UI
  works, scores just won't vary yet.
- **Never commit** the `.publishsettings` file or any API key.
- Everything lives in the **`purrsight`** resource group — delete it to tear
  down all Azure resources and stop credit spend:
  `az group delete --name purrsight`.
